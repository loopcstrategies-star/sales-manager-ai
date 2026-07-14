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
const {
  assessProspect,
  companyName: deriveCompanyName,
  companyWebsiteUrl,
  hostnameOf,
  isNoiseHost,
  looksLikeListicle,
  withRegion,
  DEFAULT_PROSPECT_QUERIES,
  REGION_PRESETS,
  resolveCountry,
  normalizeRegionLabel,
} = require('../services/prospectQuality')
const { findContactsForCompany, isStubContact } = require('../services/contactFind')
const { hunterDomainSearch, isHunterConfigured } = require('../services/hunterClient')

const router = express.Router()
router.use(protect)

function normalizeNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeHostKey(url) {
  return hostnameOf(url)
}

function mapSearchHit(r, i) {
  const title = r.title || 'Untitled'
  const url = r.url || ''
  const snippet = r.content || r.snippet || ''
  const assessment = assessProspect({ title, url, snippet })
  return {
    id: `p-${i}-${Buffer.from(String(url || title || i)).toString('base64url').slice(0, 24)}`,
    title,
    url,
    snippet,
    companyName: assessment.companyName,
    importable: assessment.ok,
    skipReason: assessment.reason,
    score: assessment.score,
  }
}

async function maybeEnrichAccount(account, company, url, summary) {
  if (!account || !isSearchConfigured()) return
  try {
    const query = [company, url].filter(Boolean).join(' ').trim()
    if (!query) return
    const result = await enrichFromQuery(query)
    if (result.error && !Object.keys(result.fields || {}).length) {
      summary.errors.push({ title: company, message: result.error })
      return
    }
    applyAccountEnrichment(account, result.fields, false)
    applyAccountGeo(account, { website: url || account.website, region: account.region })
    await account.save()
    summary.enriched = (summary.enriched || 0) + 1
  } catch (e) {
    summary.errors.push({ title: company, message: e.message || 'Enrich failed' })
  }
}

function applyAccountGeo(account, { website, region } = {}) {
  const regionLabel = normalizeRegionLabel(region || account.region)
  if (regionLabel && !String(account.region || '').trim()) {
    account.region = regionLabel
  }

  const billing = { ...(account.billingAddress?.toObject?.() || account.billingAddress || {}) }
  const country = resolveCountry({
    website: website || account.website,
    region: regionLabel || account.region,
    existingCountry: billing.country,
  })
  if (country && !String(billing.country || '').trim()) {
    billing.country = country
    account.billingAddress = billing
  }
  return account
}

async function maybeEnrichLead(lead, company, url, summary) {
  if (!lead || !isSearchConfigured()) return
  try {
    const query = [company, url].filter(Boolean).join(' ').trim()
    if (!query) return
    const result = await enrichFromQuery(query)
    if (result.error && !Object.keys(result.fields || {}).length) {
      summary.errors.push({ title: company, message: result.error })
      return
    }
    applyLeadEnrichment(lead, result.fields, false)
    await lead.save()
    summary.enriched = (summary.enriched || 0) + 1
  } catch (e) {
    summary.errors.push({ title: company, message: e.message || 'Enrich failed' })
  }
}

async function importProspectItem(req, filter, item, flags, summary) {
  const title = String(item.title || '').trim() || 'Prospect'
  const url = String(item.url || '').trim()
  const snippet = String(item.snippet || item.content || '').trim()
  const force = Boolean(flags.force || item.force)
  const regionLabel = normalizeRegionLabel(flags.region || item.region)
  const assessment = assessProspect({ title, url, snippet })
  const company = String(item.companyName || assessment.companyName || deriveCompanyName(title, url)).trim()
    || 'Prospect'

  if (!assessment.ok && !force) {
    summary.skippedLowQuality = (summary.skippedLowQuality || 0) + 1
    return
  }

  const siteUrl = companyWebsiteUrl(url) || url
  const country = resolveCountry({ website: siteUrl, region: regionLabel, existingCountry: '' })
  const blob = `${company}\n${title}\n${snippet}\n${siteUrl}`
  const { asAccount, asLead, asContact } = flags
  let account = null
  let createdAccount = false
  let createdLead = null

  const needAccount = asAccount || asContact
  if (needAccount) {
    const nameRe = new RegExp(`^${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    account = await Account.findOne({ ...filter, name: nameRe })
    if (!account && siteUrl) {
      const host = hostnameOf(siteUrl)
      if (host) {
        account = await Account.findOne({
          ...filter,
          website: new RegExp(host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        })
      }
    }
    if (account) {
      if (asAccount) {
        if (siteUrl && !account.website) account.website = siteUrl.slice(0, 300)
        if (snippet && !account.description) account.description = snippet.slice(0, 2000)
        applyAccountGeo(account, { website: siteUrl, region: regionLabel })
        await account.save()
        summary.accountsUpdated += 1
      }
    } else {
      account = await Account.create({
        name: company.slice(0, 200),
        website: siteUrl.slice(0, 300),
        description: snippet.slice(0, 2000),
        type: 'Prospect',
        region: regionLabel,
        billingAddress: country ? { country } : {},
        workspaceId: req.user.workspaceId,
        ownerId: req.user._id,
      })
      createdAccount = true
      if (asAccount) summary.accountsCreated += 1
    }
  }

  if (asLead) {
    createdLead = await Lead.create({
      lastName: 'Prospect',
      company: company.slice(0, 200),
      website: siteUrl.slice(0, 300),
      description: snippet.slice(0, 2000),
      leadSource: 'Web Search',
      status: 'Open',
      address: country ? { country } : {},
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    summary.leadsCreated += 1
  }

  if (asContact && account) {
    const emailMatch = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    const phoneMatch = blob.match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/)
    const acctCountry = account.billingAddress?.country || country || ''
    await Contact.create({
      lastName: 'Main',
      accountId: account._id,
      description: snippet.slice(0, 2000),
      phone: phoneMatch ? phoneMatch[0].slice(0, 60) : '',
      email: emailMatch ? emailMatch[0].toLowerCase().slice(0, 200) : '',
      title: '',
      mailingAddress: acctCountry ? { country: acctCountry } : {},
      source: 'web_llm',
      needsVerify: true,
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    summary.contactsCreated += 1
  }

  if (createdAccount && account) {
    await maybeEnrichAccount(account, company, siteUrl, summary)
  }
  if (createdLead) {
    await maybeEnrichLead(createdLead, company, siteUrl, summary)
  }
}

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
      if (object === 'accounts') {
        patch = applyAccountEnrichment(record, result.fields, overwrite)
        applyAccountGeo(record, { website: record.website, region: record.region })
      }
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
    const queryRaw = String(req.body.query || '').trim()
    const region = String(req.body.region || '').trim()
    const query = withRegion(queryRaw, region)
    if (!query) {
      return res.status(400).json({ success: false, message: 'query is required.' })
    }
    const search = await searchWithCache(query, { maxResults: 10, searchDepth: 'basic' })
    if (search.error && !(search.results || []).length) {
      return res.status(502).json({ success: false, message: search.error })
    }
    const results = (search.results || [])
      .map((r, i) => mapSearchHit(r, i))
      .sort((a, b) => Number(b.importable) - Number(a.importable) || (b.score || 0) - (a.score || 0))
    res.json({
      success: true,
      data: {
        query,
        region: region || null,
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
    const asContact = Boolean(req.body.asContact)
    const force = Boolean(req.body.force)
    const region = String(req.body.region || '').trim()
    if (!items.length) {
      return res.status(400).json({ success: false, message: 'Select at least one result.' })
    }
    if (!asAccount && !asLead && !asContact) {
      return res.status(400).json({
        success: false,
        message: 'Choose Add as Account, Lead, and/or Contact.',
      })
    }

    const filter = workspaceFilter(req.user)
    const summary = {
      accountsCreated: 0,
      accountsUpdated: 0,
      leadsCreated: 0,
      contactsCreated: 0,
      skippedLowQuality: 0,
      enriched: 0,
      errors: [],
    }
    const flags = { asAccount, asLead, asContact, force, region }

    for (const item of items.slice(0, 25)) {
      try {
        await importProspectItem(req, filter, item, flags, summary)
      } catch (e) {
        summary.errors.push({ title: item?.title, message: e.message || 'Failed' })
      }
    }

    res.json({ success: true, data: summary })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Prospect import failed.' })
  }
})

router.post('/prospect/bulk', async (req, res) => {
  try {
    if (!isSearchConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Web search is not configured. Set TAVILY_API_KEY or BRAVE_API_KEY.',
      })
    }

    const region = String(req.body.region || '').trim()
    const rawQueries = Array.isArray(req.body.queries) && req.body.queries.length
      ? req.body.queries
      : DEFAULT_PROSPECT_QUERIES
    const queries = [...new Set(
      rawQueries.map((q) => withRegion(String(q || '').trim(), region)).filter(Boolean),
    )].slice(0, 5)
    const perQuery = Math.max(1, Math.min(Number(req.body.perQuery) || 8, 8))
    const asAccount = req.body.asAccount !== false
    const asContact = Boolean(req.body.asContact)
    const asLead = Boolean(req.body.asLead)
    if (!asAccount && !asLead && !asContact) {
      return res.status(400).json({
        success: false,
        message: 'Choose Add as Account, Lead, and/or Contact.',
      })
    }

    const filter = workspaceFilter(req.user)
    const existingAccounts = await Account.find(filter).select('name website').lean()
    const knownNames = new Set(existingAccounts.map((a) => normalizeNameKey(a.name)).filter(Boolean))
    const knownHosts = new Set(existingAccounts.map((a) => normalizeHostKey(a.website)).filter(Boolean))

    const summary = {
      queriesRun: queries,
      perQuery,
      accountsCreated: 0,
      accountsUpdated: 0,
      leadsCreated: 0,
      contactsCreated: 0,
      skippedDuplicates: 0,
      skippedLowQuality: 0,
      enriched: 0,
      resultsSeen: 0,
      errors: [],
    }
    const flags = { asAccount, asLead, asContact, force: false, region }
    const seenInRun = new Set()

    for (const query of queries) {
      try {
        const search = await searchWithCache(query, { maxResults: Math.min(perQuery * 2, 12), searchDepth: 'basic' })
        const results = (search.results || []).slice(0, Math.min(perQuery * 2, 12))
        let importedForQuery = 0
        for (const r of results) {
          if (importedForQuery >= perQuery) break
          summary.resultsSeen += 1
          const title = String(r.title || '').trim() || 'Prospect'
          const url = String(r.url || '').trim()
          const assessment = assessProspect({ title, url, snippet: r.content || '' })
          if (!assessment.ok) {
            summary.skippedLowQuality += 1
            continue
          }
          const company = assessment.companyName
          const nameKey = normalizeNameKey(company)
          const hostKey = normalizeHostKey(url)
          const dedupeKey = hostKey || nameKey
          if (!dedupeKey) {
            summary.skippedDuplicates += 1
            continue
          }
          if (
            seenInRun.has(dedupeKey)
            || (nameKey && knownNames.has(nameKey))
            || (hostKey && knownHosts.has(hostKey))
          ) {
            summary.skippedDuplicates += 1
            continue
          }
          seenInRun.add(dedupeKey)
          if (nameKey) knownNames.add(nameKey)
          if (hostKey) knownHosts.add(hostKey)

          try {
            await importProspectItem(
              req,
              filter,
              { title, url, snippet: r.content || '', companyName: company },
              flags,
              summary,
            )
            importedForQuery += 1
          } catch (e) {
            summary.errors.push({ title: company, message: e.message || 'Failed' })
          }
        }
      } catch (e) {
        summary.errors.push({ query, message: e.message || 'Search failed' })
      }
    }

    res.json({ success: true, data: summary })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Bulk prospect failed.' })
  }
})

router.get('/prospect/default-queries', (_req, res) => {
  res.json({
    success: true,
    data: {
      queries: DEFAULT_PROSPECT_QUERIES,
      regions: REGION_PRESETS,
    },
  })
})

async function saveFoundContacts(req, filter, account, found, summary) {
  const note = summary.source === 'hunter'
    ? 'Found via Hunter.io domain search. Confirm before outreach.'
    : 'Found via web+LLM from public snippets. Verify before outreach.'
  let created = 0
  let skipped = 0

  applyAccountGeo(account, {
    website: account.website,
    region: account.region || summary.region,
  })
  if (found.companyPhone && !account.phone) {
    account.phone = String(found.companyPhone).slice(0, 60)
  }
  await account.save()

  const acctCountry = String(account.billingAddress?.country || '').trim()
  const source = summary.source || 'web_llm'
  const needsVerify = source !== 'csv'

  for (const person of found.people || []) {
    const email = String(person.email || '').trim().toLowerCase()
    const lastName = String(person.lastName || 'Contact').trim()
    const firstName = String(person.firstName || '').trim()
    if (email) {
      const existingEmail = await Contact.findOne({ ...filter, accountId: account._id, email })
      if (existingEmail) {
        skipped += 1
        continue
      }
    } else {
      const existingName = await Contact.findOne({
        ...filter,
        accountId: account._id,
        lastName,
        firstName,
      })
      if (existingName) {
        skipped += 1
        continue
      }
    }

    await Contact.create({
      firstName: firstName.slice(0, 100),
      lastName: lastName.slice(0, 100),
      email: email.slice(0, 200),
      phone: String(person.phone || '').slice(0, 60),
      title: String(person.title || '').slice(0, 120),
      accountId: account._id,
      description: note,
      mailingAddress: acctCountry ? { country: acctCountry } : {},
      source,
      needsVerify,
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
      lastEnrichedAt: new Date(),
    })
    created += 1
  }

  summary.contactsCreated = (summary.contactsCreated || 0) + created
  summary.contactsSkipped = (summary.contactsSkipped || 0) + skipped
  return { created, skipped }
}

router.post('/prospect/find-contacts', async (req, res) => {
  try {
    const filter = workspaceFilter(req.user)
    const accountId = req.body.accountId ? String(req.body.accountId) : null
    const region = String(req.body.region || '').trim()
    const save = req.body.save !== false

    if (!accountId) {
      return res.status(400).json({ success: false, message: 'accountId is required.' })
    }

    const account = await Account.findOne({ ...filter, _id: accountId })
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found.' })
    }

    const found = await findContactsForCompany({
      name: account.name,
      website: account.website,
      region: region || account.region,
    })
    if (!found.ok) {
      return res.status(502).json({
        success: false,
        message: found.error || 'Find contacts failed.',
        data: { people: found.people || [], sources: found.sources || [] },
      })
    }

    if (region) {
      applyAccountGeo(account, { website: account.website, region })
      await account.save()
    }

    const summary = { contactsCreated: 0, contactsSkipped: 0, region }
    let saveResult = { created: 0, skipped: 0 }
    if (save) {
      saveResult = await saveFoundContacts(req, filter, account, found, summary)
    }

    res.json({
      success: true,
      data: {
        people: found.people,
        phones: found.phones,
        emails: found.emails,
        sources: found.sources,
        query: found.query,
        provider: found.provider,
        saved: save,
        contactsCreated: saveResult.created,
        contactsSkipped: saveResult.skipped,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Find contacts failed.' })
  }
})

router.post('/prospect/hunter-contacts', async (req, res) => {
  try {
    if (!isHunterConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Hunter is not configured. Set HUNTER_API_KEY on the API service.',
      })
    }
    const filter = workspaceFilter(req.user)
    const accountId = req.body.accountId ? String(req.body.accountId) : null
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'accountId is required.' })
    }
    const account = await Account.findOne({ ...filter, _id: accountId })
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found.' })
    }
    if (!account.website) {
      return res.status(400).json({ success: false, message: 'Account needs a website/domain for Hunter.' })
    }

    const found = await hunterDomainSearch(account.website, { limit: Number(req.body.limit) || 10 })
    if (!found.ok) {
      return res.status(502).json({ success: false, message: found.error || 'Hunter search failed.' })
    }

    const summary = { contactsCreated: 0, contactsSkipped: 0, source: 'hunter' }
    const saveResult = await saveFoundContacts(req, filter, account, {
      people: found.people,
      companyPhone: '',
    }, summary)

    res.json({
      success: true,
      data: {
        domain: found.domain,
        organization: found.organization,
        people: found.people,
        contactsCreated: saveResult.created,
        contactsSkipped: saveResult.skipped,
        provider: 'hunter',
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Hunter contacts failed.' })
  }
})

async function accountHasRealEmailedContact(filter, accountId) {
  const contacts = await Contact.find({
    ...filter,
    accountId,
    email: { $nin: [null, ''] },
  })
    .select('firstName lastName')
    .limit(30)
    .lean()
  return contacts.some((c) => !isStubContact(c))
}

router.post('/prospect/find-contacts-batch', async (req, res) => {
  try {
    const filter = workspaceFilter(req.user)
    const region = String(req.body.region || '').trim()
    const cap = Math.max(1, Math.min(Number(req.body.cap) || 15, 25))
    const thinOnly = req.body.thinOnly !== false

    const accounts = await Account.find(filter).sort({ updatedAt: -1 }).limit(120)
    const summary = {
      accountsProcessed: 0,
      contactsCreated: 0,
      contactsSkipped: 0,
      skipped: 0,
      errors: [],
      region,
      thinOnly,
    }

    for (const account of accounts) {
      if (summary.accountsProcessed >= cap) break
      if (!account.website && !account.name) {
        summary.skipped += 1
        continue
      }
      const hasReal = await accountHasRealEmailedContact(filter, account._id)
      if (hasReal) {
        summary.skipped += 1
        continue
      }
      if (!thinOnly) {
        /* same skip rule: only process accounts without real emailed contacts */
      }

      try {
        if (region) {
          applyAccountGeo(account, { website: account.website, region })
          await account.save()
        }
        const found = await findContactsForCompany({
          name: account.name,
          website: account.website,
          region: region || account.region,
        })
        summary.accountsProcessed += 1
        if (!found.ok) {
          summary.errors.push({ accountId: account._id, name: account.name, message: found.error })
          continue
        }
        await saveFoundContacts(req, filter, account, found, summary)
      } catch (e) {
        summary.errors.push({ accountId: account._id, name: account.name, message: e.message || 'Failed' })
      }
    }

    res.json({ success: true, data: summary })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Batch find contacts failed.' })
  }
})

router.post('/prospect/backfill-geo', async (req, res) => {
  try {
    const filter = workspaceFilter(req.user)
    const region = normalizeRegionLabel(req.body.region)
    const accounts = await Account.find(filter).limit(500)
    let updated = 0
    let contactsUpdated = 0

    for (const account of accounts) {
      const beforeRegion = String(account.region || '')
      const beforeCountry = String(account.billingAddress?.country || '')
      applyAccountGeo(account, { website: account.website, region: region || account.region })
      const afterRegion = String(account.region || '')
      const afterCountry = String(account.billingAddress?.country || '')
      if (beforeRegion !== afterRegion || beforeCountry !== afterCountry) {
        await account.save()
        updated += 1
      }

      const country = afterCountry
      if (!country) continue
      const contacts = await Contact.find({
        ...filter,
        accountId: account._id,
        $or: [
          { 'mailingAddress.country': { $in: [null, ''] } },
          { mailingAddress: { $exists: false } },
        ],
      }).limit(50)
      for (const c of contacts) {
        const mailing = { ...(c.mailingAddress?.toObject?.() || c.mailingAddress || {}) }
        if (!mailing.country) {
          mailing.country = country
          c.mailingAddress = mailing
          await c.save()
          contactsUpdated += 1
        }
      }
    }

    res.json({ success: true, data: { accountsUpdated: updated, contactsUpdated } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Backfill failed.' })
  }
})

router.post('/prospect/cleanup-noise', async (req, res) => {
  try {
    const filter = workspaceFilter(req.user)
    const prospects = await Account.find({ ...filter, type: 'Prospect' }).limit(500)
    const noiseAccounts = prospects.filter((a) => {
      const website = String(a.website || '')
      const name = String(a.name || '')
      return isNoiseHost(website) || looksLikeListicle(name)
    })

    let accountsDeleted = 0
    let contactsDeleted = 0
    let leadsDeleted = 0

    for (const account of noiseAccounts) {
      const contactRes = await Contact.deleteMany({ ...filter, accountId: account._id })
      contactsDeleted += contactRes.deletedCount || 0

      const website = String(account.website || '').trim()
      const company = String(account.name || '').trim()
      const leadQuery = {
        ...filter,
        leadSource: 'Web Search',
        $or: [
          ...(company ? [{ company }] : []),
          ...(website ? [{ website }] : []),
        ],
      }
      if (leadQuery.$or.length) {
        const leadRes = await Lead.deleteMany(leadQuery)
        leadsDeleted += leadRes.deletedCount || 0
      }

      await account.deleteOne()
      accountsDeleted += 1
    }

    // Orphan Web Search leads that still look like listicles / noise hosts
    const noisyLeads = await Lead.find({ ...filter, leadSource: 'Web Search' }).limit(500)
    for (const lead of noisyLeads) {
      const website = String(lead.website || '')
      const company = String(lead.company || '')
      if (isNoiseHost(website) || looksLikeListicle(company)) {
        await lead.deleteOne()
        leadsDeleted += 1
      }
    }

    res.json({
      success: true,
      data: { accountsDeleted, contactsDeleted, leadsDeleted },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Cleanup failed.' })
  }
})

router.post('/contacts/from-accounts', async (req, res) => {
  try {
    const filter = workspaceFilter(req.user)
    const cap = Math.max(1, Math.min(Number(req.body.cap) || 50, 100))
    const accounts = await Account.find(filter).sort({ createdAt: -1 }).limit(200)
    let created = 0
    let skipped = 0

    for (const account of accounts) {
      if (created >= cap) break
      const existing = await Contact.countDocuments({ ...filter, accountId: account._id })
      if (existing > 0) {
        skipped += 1
        continue
      }
      await Contact.create({
        lastName: 'Main',
        accountId: account._id,
        description: String(account.description || '').slice(0, 2000),
        phone: String(account.phone || '').slice(0, 60),
        email: '',
        source: 'manual',
        needsVerify: true,
        mailingAddress: account.billingAddress?.country
          ? { country: account.billingAddress.country }
          : {},
        workspaceId: req.user.workspaceId,
        ownerId: req.user._id,
      })
      created += 1
    }

    res.json({ success: true, data: { created, skipped, cap } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Contact backfill failed.' })
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
