const express = require('express')
const { protect } = require('../middleware/auth')
const Lead = require('../models/Lead')
const Contact = require('../models/Contact')
const Account = require('../models/Account')
const { workspaceFilter } = require('../services/crmHelpers')
const {
  enrichFromQuery,
  applyLeadEnrichment,
  applyAccountEnrichment,
  applyContactEnrichment,
} = require('../services/crmEnrichment')
const { searchWithCache, isSearchConfigured } = require('../services/webSearch')
const { runCrmEnrichRefresh } = require('../jobs/crmEnrichRefresh')

const router = express.Router()
router.use(protect)

function buildQuery(object, record, draft = {}) {
  const src = record || draft || {}
  if (object === 'leads') {
    return [src.company, src.website, src.firstName, src.lastName, src.industry]
      .filter(Boolean)
      .join(' ')
      .trim() || String(src.email || '').trim()
  }
  if (object === 'accounts') {
    return [src.name, src.website, src.type].filter(Boolean).join(' ').trim()
  }
  if (object === 'contacts') {
    return [src.firstName, src.lastName, src.title, src.email, src.company].filter(Boolean).join(' ').trim()
  }
  return ''
}

router.post('/enrich', async (req, res) => {
  try {
    if (!isSearchConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Web search is not configured. Set TAVILY_API_KEY or BRAVE_API_KEY.',
      })
    }

    const object = String(req.body.object || '').toLowerCase()
    const overwrite = Boolean(req.body.overwrite)
    const id = req.body.id ? String(req.body.id) : null
    const draft = req.body.draft && typeof req.body.draft === 'object' ? req.body.draft : {}

    if (!['leads', 'contacts', 'accounts'].includes(object)) {
      return res.status(400).json({ success: false, message: 'object must be leads, contacts, or accounts.' })
    }

    const filter = workspaceFilter(req.user)
    let record = null

    if (id) {
      if (object === 'leads') record = await Lead.findOne({ ...filter, _id: id })
      if (object === 'contacts') record = await Contact.findOne({ ...filter, _id: id })
      if (object === 'accounts') record = await Account.findOne({ ...filter, _id: id })
      if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found.' })
      }
    }

    const query = buildQuery(object, record, draft)
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Need a company, name, website, or email to enrich.',
      })
    }

    const result = await enrichFromQuery(query)
    if (result.error && !Object.keys(result.fields || {}).length) {
      return res.status(502).json({ success: false, message: result.error })
    }

    let patch = result.fields
    let saved = null

    if (record) {
      if (object === 'leads') patch = applyLeadEnrichment(record, result.fields, overwrite)
      if (object === 'accounts') patch = applyAccountEnrichment(record, result.fields, overwrite)
      if (object === 'contacts') patch = applyContactEnrichment(record, result.fields, overwrite)
      await record.save()
      saved = record.toObject({ virtuals: true })
    }

    res.json({
      success: true,
      data: {
        fields: patch,
        sources: result.sources,
        provider: result.provider,
        record: saved,
        draft: !record,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Enrichment failed.' })
  }
})

router.post('/prospect/search', async (req, res) => {
  try {
    if (!isSearchConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Web search is not configured. Set TAVILY_API_KEY or BRAVE_API_KEY.',
      })
    }
    const query = String(req.body.query || '').trim()
    if (!query) {
      return res.status(400).json({ success: false, message: 'query is required.' })
    }
    const search = await searchWithCache(query, { maxResults: 10, searchDepth: 'basic' })
    if (search.error && !(search.results || []).length) {
      return res.status(502).json({ success: false, message: search.error })
    }
    const results = (search.results || []).map((r, i) => ({
      id: `p-${i}-${Buffer.from(String(r.url || r.title || i)).toString('base64url').slice(0, 24)}`,
      title: r.title || 'Untitled',
      url: r.url || '',
      snippet: r.content || '',
    }))
    res.json({
      success: true,
      data: {
        query,
        answer: search.answer || null,
        results,
        provider: search.provider || null,
        fromCache: Boolean(search.fromCache),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Prospect search failed.' })
  }
})

router.post('/prospect/import', async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : []
    const asAccount = req.body.asAccount !== false
    const asLead = Boolean(req.body.asLead)
    if (!items.length) {
      return res.status(400).json({ success: false, message: 'Select at least one result.' })
    }
    if (!asAccount && !asLead) {
      return res.status(400).json({ success: false, message: 'Choose Add as Account and/or Add as Lead.' })
    }

    const filter = workspaceFilter(req.user)
    const summary = { accountsCreated: 0, accountsUpdated: 0, leadsCreated: 0, errors: [] }

    for (const item of items.slice(0, 25)) {
      try {
        const title = String(item.title || '').trim() || 'Prospect'
        const url = String(item.url || '').trim()
        const snippet = String(item.snippet || item.content || '').trim()
        let account = null

        if (asAccount) {
          account = await Account.findOne({
            ...filter,
            name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          })
          if (account) {
            if (url && !account.website) account.website = url
            if (snippet && !account.description) account.description = snippet.slice(0, 2000)
            await account.save()
            summary.accountsUpdated += 1
          } else {
            account = await Account.create({
              name: title.slice(0, 200),
              website: url.slice(0, 300),
              description: snippet.slice(0, 2000),
              type: 'Prospect',
              workspaceId: req.user.workspaceId,
              ownerId: req.user._id,
            })
            summary.accountsCreated += 1
          }
        }

        if (asLead) {
          await Lead.create({
            lastName: 'Prospect',
            company: title.slice(0, 200),
            website: url.slice(0, 300),
            description: snippet.slice(0, 2000),
            leadSource: 'Web Search',
            status: 'Open',
            workspaceId: req.user.workspaceId,
            ownerId: req.user._id,
          })
          summary.leadsCreated += 1
        }
      } catch (e) {
        summary.errors.push({ title: item?.title, message: e.message || 'Failed' })
      }
    }

    res.json({ success: true, data: summary })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Prospect import failed.' })
  }
})

router.post('/enrich/refresh', async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId
    const result = await runCrmEnrichRefresh({ workspaceId, cap: Number(req.body.cap) || 50 })
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Refresh failed.' })
  }
})

module.exports = router
