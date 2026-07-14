const express = require('express')
const { protect } = require('../middleware/auth')
const Account = require('../models/Account')
const Contact = require('../models/Contact')
const Opportunity = require('../models/Opportunity')
const Case = require('../models/Case')
const Campaign = require('../models/Campaign')
const Lead = require('../models/Lead')
const { workspaceFilter } = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

function countByKey(docs, getKey) {
  const map = {}
  docs.forEach((doc) => {
    const key = String(getKey(doc) || '').trim() || 'Unknown'
    map[key] = (map[key] || 0) + 1
  })
  return Object.entries(map)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

router.get('/stats', async (req, res) => {
  try {
    const filter = workspaceFilter(req.user)
    const [
      accounts,
      contacts,
      openLeads,
      openDeals,
      openCases,
      campaigns,
      recentAccounts,
      recentContacts,
      accountGeo,
      contactGeo,
      needsVerify,
      missingEmail,
    ] = await Promise.all([
      Account.countDocuments(filter),
      Contact.countDocuments(filter),
      Lead.countDocuments({
        ...filter,
        status: { $in: ['Open', 'Working'] },
        $or: [{ convertedAt: null }, { convertedAt: { $exists: false } }],
      }),
      Opportunity.countDocuments({
        ...filter,
        stage: { $nin: ['Closed Won', 'Closed Lost'] },
      }),
      Case.countDocuments({ ...filter, status: { $ne: 'Closed' } }),
      Campaign.countDocuments(filter),
      Account.find(filter)
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('name phone website region billingAddress updatedAt')
        .lean(),
      Contact.find(filter)
        .sort({ updatedAt: -1 })
        .limit(5)
        .populate('accountId', 'name')
        .select('firstName lastName email title accountId source needsVerify mailingAddress updatedAt')
        .lean(),
      Account.find(filter).select('region billingAddress.country').lean(),
      Contact.find(filter).select('mailingAddress.country').lean(),
      Contact.countDocuments({ ...filter, needsVerify: true }),
      Contact.countDocuments({
        ...filter,
        $or: [{ email: '' }, { email: null }, { email: { $exists: false } }],
      }),
    ])

    res.json({
      success: true,
      data: {
        counts: {
          accounts,
          contacts,
          openLeads,
          openDeals,
          openCases,
          campaigns,
          needsVerify,
          missingEmail,
        },
        byRegion: countByKey(accountGeo, (a) => a.region),
        byCountry: countByKey(accountGeo, (a) => a.billingAddress?.country),
        contactsByCountry: countByKey(contactGeo, (c) => c.mailingAddress?.country),
        recentAccounts,
        recentContacts: recentContacts.map((c) => ({
          ...c,
          fullName: [c.firstName, c.lastName].filter(Boolean).join(' ').trim(),
          accountName: c.accountId?.name || '',
          accountId: c.accountId?._id || c.accountId || null,
        })),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load CRM stats.' })
  }
})

router.get('/analytics', async (req, res) => {
  try {
    const filter = workspaceFilter(req.user)
    const opps = await Opportunity.find(filter).select('name stage amount closeDate updatedAt').lean()
    const byStage = {}
    let pipelineAmount = 0
    let wonAmount = 0
    let lostCount = 0
    let wonCount = 0
    opps.forEach((o) => {
      byStage[o.stage] = byStage[o.stage] || { count: 0, amount: 0 }
      byStage[o.stage].count += 1
      byStage[o.stage].amount += Number(o.amount) || 0
      if (o.stage === 'Closed Won') {
        wonAmount += Number(o.amount) || 0
        wonCount += 1
      } else if (o.stage === 'Closed Lost') {
        lostCount += 1
      } else {
        pipelineAmount += Number(o.amount) || 0
      }
    })
    const closed = wonCount + lostCount
    const winRate = closed ? Math.round((wonCount / closed) * 100) : 0
    const openLeads = await Lead.countDocuments({
      ...filter,
      status: { $in: ['Open', 'Working'] },
      $or: [{ convertedAt: null }, { convertedAt: { $exists: false } }],
    })
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const leadsThisWeek = await Lead.countDocuments({ ...filter, createdAt: { $gte: weekAgo } })
    const accountGeo = await Account.find(filter).select('region billingAddress.country').lean()

    res.json({
      success: true,
      data: {
        pipelineByStage: Object.entries(byStage).map(([stage, v]) => ({ stage, ...v })),
        totals: {
          openOpportunities: opps.filter((o) => !['Closed Won', 'Closed Lost'].includes(o.stage)).length,
          pipelineAmount,
          wonAmount,
          winRate,
          openLeads,
          leadsThisWeek,
        },
        byRegion: countByKey(accountGeo, (a) => a.region),
        byCountry: countByKey(accountGeo, (a) => a.billingAddress?.country),
        recentOpportunities: opps
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          .slice(0, 8)
          .map((o) => ({
            id: o._id,
            name: o.name,
            stage: o.stage,
            amount: o.amount,
            updatedAt: o.updatedAt,
          })),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load analytics.' })
  }
})

router.post('/contacts/dedupe-emails', async (req, res) => {
  try {
    const filter = workspaceFilter(req.user)
    const contacts = await Contact.find({
      ...filter,
      email: { $nin: [null, ''] },
    })
      .sort({ updatedAt: -1 })
      .select('_id email firstName lastName createdAt')
      .lean()

    const seen = new Map()
    const duplicateIds = []
    for (const c of contacts) {
      const key = String(c.email || '').trim().toLowerCase()
      if (!key) continue
      if (seen.has(key)) duplicateIds.push(c._id)
      else seen.set(key, c._id)
    }

    let deleted = 0
    if (req.body.delete === true && duplicateIds.length) {
      const result = await Contact.deleteMany({ ...filter, _id: { $in: duplicateIds } })
      deleted = result.deletedCount || 0
    }

    res.json({
      success: true,
      data: {
        duplicateCount: duplicateIds.length,
        deleted,
        dryRun: req.body.delete !== true,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Dedupe failed.' })
  }
})

module.exports = router
