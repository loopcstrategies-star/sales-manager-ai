const express = require('express')
const { protect } = require('../middleware/auth')
const Account = require('../models/Account')
const Contact = require('../models/Contact')
const Opportunity = require('../models/Opportunity')
const Case = require('../models/Case')
const Campaign = require('../models/Campaign')
const Lead = require('../models/Lead')
const User = require('../models/User')
const { workspaceFilter, toObjectId } = require('../services/crmHelpers')
const { isStubContact } = require('../services/contactFind')
const {
  draftOutreachEmail,
  STAGE_PROBABILITY,
  probabilityForOpportunity,
  weightedAmount,
} = require('../services/emailDraft')
const Task = require('../models/Task')
const { getUserPreferences } = require('../services/userPreferences')

const router = express.Router()
router.use(protect)

const CLOSED = new Set(['Closed Won', 'Closed Lost'])

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

function sumByKey(docs, getKey, getAmount) {
  const map = {}
  docs.forEach((doc) => {
    const key = String(getKey(doc) || '').trim() || 'Unknown'
    if (!map[key]) map[key] = { label: key, count: 0, amount: 0 }
    map[key].count += 1
    map[key].amount += Number(getAmount(doc)) || 0
  })
  return Object.values(map).sort((a, b) => b.amount - a.amount || b.count - a.count)
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
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
      contactMeta,
      accountIds,
      realEmailedAccountIds,
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
      Contact.find(filter).select('source needsVerify email firstName lastName accountId').lean(),
      Account.find(filter).select('_id').lean(),
      Contact.distinct('accountId', {
        ...filter,
        email: { $nin: [null, ''] },
        $or: [
          { firstName: { $nin: [null, ''] } },
          { lastName: { $not: /^main$/i } },
        ],
      }),
    ])

    const sourceMix = countByKey(contactMeta, (c) => c.source || 'manual')
    const stubCount = contactMeta.filter((c) => isStubContact(c)).length
    const realAccountSet = new Set(realEmailedAccountIds.map((id) => String(id)))
    const thinAccounts = accountIds.filter((a) => !realAccountSet.has(String(a._id))).length
    const withEmail = contactMeta.filter((c) => String(c.email || '').includes('@')).length
    const verifyPct = contacts ? Math.round((needsVerify / contacts) * 100) : 0
    const avgContactsPerAccount = accounts
      ? Math.round((contacts / accounts) * 10) / 10
      : 0

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
          thinAccounts,
          stubContacts: stubCount,
          contactsWithEmail: withEmail,
          avgContactsPerAccount,
          verifyPct,
        },
        contactSourceMix: sourceMix,
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
    const prefs = await getUserPreferences(req.user._id)
    const stageProb = prefs.sales?.stageProbabilities || STAGE_PROBABILITY
    const opps = await Opportunity.find(filter)
      .select('name stage amount closeDate updatedAt ownerId accountId probability')
      .populate('accountId', 'name region billingAddress')
      .lean()

    const byStage = {}
    let pipelineAmount = 0
    let weightedPipeline = 0
    let wonAmount = 0
    let lostCount = 0
    let wonCount = 0
    const openOpps = []
    opps.forEach((o) => {
      byStage[o.stage] = byStage[o.stage] || { count: 0, amount: 0, weighted: 0 }
      byStage[o.stage].count += 1
      byStage[o.stage].amount += Number(o.amount) || 0
      if (o.stage === 'Closed Won') {
        wonAmount += Number(o.amount) || 0
        wonCount += 1
      } else if (o.stage === 'Closed Lost') {
        lostCount += 1
      } else {
        const w = weightedAmount(o, stageProb)
        pipelineAmount += Number(o.amount) || 0
        weightedPipeline += w
        byStage[o.stage].weighted += w
        openOpps.push({ ...o, probability: probabilityForOpportunity(o, stageProb), weighted: w })
      }
    })
    const closed = wonCount + lostCount
    const winRate = closed ? Math.round((wonCount / closed) * 100) : 0
    const avgDealSize = openOpps.length
      ? Math.round(pipelineAmount / openOpps.length)
      : 0

    const now = new Date()
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)
    let overdue = 0
    let overdueAmount = 0
    let closingThisMonth = 0
    let closingThisMonthAmount = 0
    let closingThisMonthWeighted = 0
    const forecastByMonthMap = {}
    openOpps.forEach((o) => {
      if (!o.closeDate) return
      const cd = new Date(o.closeDate)
      if (cd < monthStart) {
        overdue += 1
        overdueAmount += Number(o.amount) || 0
      } else if (cd >= monthStart && cd <= monthEnd) {
        closingThisMonth += 1
        closingThisMonthAmount += Number(o.amount) || 0
        closingThisMonthWeighted += o.weighted || 0
      }
      const key = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}`
      if (!forecastByMonthMap[key]) {
        forecastByMonthMap[key] = { month: key, count: 0, amount: 0, weighted: 0 }
      }
      forecastByMonthMap[key].count += 1
      forecastByMonthMap[key].amount += Number(o.amount) || 0
      forecastByMonthMap[key].weighted += o.weighted || 0
    })
    const forecastByMonth = Object.values(forecastByMonthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(0, 12)

    const pipelineByCountry = sumByKey(
      openOpps,
      (o) => o.accountId?.billingAddress?.country || o.accountId?.region || 'Unknown',
      (o) => o.amount,
    ).slice(0, 12)

    const ownerMap = {}
    opps.forEach((o) => {
      const oid = String(o.ownerId || 'unknown')
      if (!ownerMap[oid]) {
        ownerMap[oid] = {
          ownerId: oid,
          openCount: 0,
          openAmount: 0,
          wonCount: 0,
          wonAmount: 0,
        }
      }
      if (o.stage === 'Closed Won') {
        ownerMap[oid].wonCount += 1
        ownerMap[oid].wonAmount += Number(o.amount) || 0
      } else if (!CLOSED.has(o.stage)) {
        ownerMap[oid].openCount += 1
        ownerMap[oid].openAmount += Number(o.amount) || 0
      }
    })
    const ownerIds = Object.keys(ownerMap).filter((id) => id !== 'unknown')
    const users = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds } }).select('name').lean()
      : []
    const nameById = Object.fromEntries(users.map((u) => [String(u._id), u.name || 'User']))
    const ownerLeaderboard = Object.values(ownerMap)
      .map((row) => ({
        ...row,
        ownerName: nameById[row.ownerId] || 'Unknown',
      }))
      .sort((a, b) => b.openAmount - a.openAmount || b.wonAmount - a.wonAmount)
      .slice(0, 10)

    const [openLeads, leadsThisWeek, contactMeta, needsVerify, missingEmail, contacts] = await Promise.all([
      Lead.countDocuments({
        ...filter,
        status: { $in: ['Open', 'Working'] },
        $or: [{ convertedAt: null }, { convertedAt: { $exists: false } }],
      }),
      Lead.countDocuments({
        ...filter,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
      Contact.find(filter).select('source needsVerify email mailingAddress.country').lean(),
      Contact.countDocuments({ ...filter, needsVerify: true }),
      Contact.countDocuments({
        ...filter,
        $or: [{ email: '' }, { email: null }, { email: { $exists: false } }],
      }),
      Contact.countDocuments(filter),
    ])

    const accountGeo = await Account.find(filter).select('region billingAddress.country').lean()

    res.json({
      success: true,
      data: {
        pipelineByStage: Object.entries(byStage).map(([stage, v]) => ({ stage, ...v })),
        totals: {
          openOpportunities: openOpps.length,
          pipelineAmount,
          weightedPipeline,
          wonAmount,
          winRate,
          openLeads,
          leadsThisWeek,
          avgDealSize,
          overdue,
          overdueAmount,
          closingThisMonth,
          closingThisMonthAmount,
          closingThisMonthWeighted,
        },
        stageProbabilities: stageProb,
        forecastByMonth,
        contactQuality: {
          total: contacts,
          needsVerify,
          missingEmail,
          verifyPct: contacts ? Math.round((needsVerify / contacts) * 100) : 0,
          sourceMix: countByKey(contactMeta, (c) => c.source || 'manual'),
          byCountry: countByKey(contactMeta, (c) => c.mailingAddress?.country).slice(0, 12),
        },
        pipelineByCountry,
        ownerLeaderboard,
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
            probability: probabilityForOpportunity(o, stageProb),
            updatedAt: o.updatedAt,
          })),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load analytics.' })
  }
})

router.get('/service-analytics', async (req, res) => {
  try {
    const filter = workspaceFilter(req.user)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const cases = await Case.find(filter)
      .select('subject status priority caseNumber ownerId createdAt updatedAt')
      .populate('ownerId', 'name')
      .lean()

    const byStatus = {}
    const byPriority = {}
    const ownerMap = {}
    let openCount = 0
    let closedCount = 0
    let openedThisWeek = 0
    let escalated = 0

    cases.forEach((c) => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1
      byPriority[c.priority || 'Medium'] = (byPriority[c.priority || 'Medium'] || 0) + 1
      if (c.status === 'Closed') closedCount += 1
      else openCount += 1
      if (c.status === 'Escalated') escalated += 1
      if (c.createdAt && new Date(c.createdAt) >= weekAgo) openedThisWeek += 1

      const oid = String(c.ownerId?._id || c.ownerId || 'unknown')
      if (!ownerMap[oid]) {
        ownerMap[oid] = {
          ownerId: oid,
          ownerName: c.ownerId?.name || 'Unknown',
          open: 0,
          closed: 0,
        }
      }
      if (c.status === 'Closed') ownerMap[oid].closed += 1
      else ownerMap[oid].open += 1
    })

    const recentOpen = cases
      .filter((c) => c.status !== 'Closed')
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 10)
      .map((c) => ({
        id: c._id,
        subject: c.subject,
        caseNumber: c.caseNumber || '',
        status: c.status,
        priority: c.priority,
        updatedAt: c.updatedAt,
      }))

    res.json({
      success: true,
      data: {
        totals: {
          total: cases.length,
          open: openCount,
          closed: closedCount,
          escalated,
          openedThisWeek,
        },
        byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
        byPriority: Object.entries(byPriority).map(([priority, count]) => ({ priority, count })),
        ownerLeaderboard: Object.values(ownerMap).sort((a, b) => b.open - a.open),
        recentOpen,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load service analytics.' })
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

router.post('/email-draft', async (req, res) => {
  try {
    const filter = workspaceFilter(req.user)
    const salesPrefs = (await getUserPreferences(req.user._id)).sales
    const objectType = String(req.body.objectType || '').trim().toLowerCase()
    const id = toObjectId(req.body.id)
    const tone = String(
      req.body.tone != null && req.body.tone !== ''
        ? req.body.tone
        : salesPrefs.emailTone || 'professional',
    ).trim()
    const saveAsTask = req.body.saveAsTask !== undefined
      ? Boolean(req.body.saveAsTask)
      : salesPrefs.saveEmailAsTask !== false

    if (!id || !['leads', 'contacts', 'lead', 'contact'].includes(objectType)) {
      return res.status(400).json({ success: false, message: 'objectType (leads|contacts) and id are required.' })
    }

    let person = {}
    let company = ''
    let context = ''
    let relatedType = 'Contact'
    let relatedId = id

    if (objectType === 'leads' || objectType === 'lead') {
      const lead = await Lead.findOne({ ...filter, _id: id }).lean()
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' })
      person = lead
      company = lead.company || ''
      context = [lead.industry, lead.leadSource, lead.description].filter(Boolean).join(' · ')
      relatedType = 'Lead'
    } else {
      const contact = await Contact.findOne({ ...filter, _id: id }).populate('accountId', 'name').lean()
      if (!contact) return res.status(404).json({ success: false, message: 'Contact not found.' })
      person = contact
      company = contact.accountId?.name || ''
      context = [contact.title, contact.description].filter(Boolean).join(' · ')
      relatedType = 'Contact'
    }

    const draft = await draftOutreachEmail({
      kind: relatedType.toLowerCase(),
      person,
      company,
      context,
      tone,
    })
    if (!draft.ok) {
      return res.status(502).json({ success: false, message: draft.error || 'Draft failed.', data: draft })
    }

    let task = null
    if (saveAsTask) {
      task = await Task.create({
        subject: `Email draft: ${draft.subject || 'Outreach'}`.slice(0, 200),
        status: 'Not Started',
        priority: 'Normal',
        description: `To: ${draft.to || '(no email)'}\nSubject: ${draft.subject}\n\n${draft.body}`.slice(0, 5000),
        relatedType,
        relatedId,
        workspaceId: req.user.workspaceId,
        ownerId: req.user._id,
      })
    }

    res.json({
      success: true,
      data: {
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
        taskId: task?._id || null,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Email draft failed.' })
  }
})

router.post('/contacts/mark-verified', async (req, res) => {
  try {
    const filter = { ...workspaceFilter(req.user), needsVerify: true }
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : null
    if (ids?.length) {
      filter._id = { $in: ids }
    }
    const result = await Contact.updateMany(filter, { $set: { needsVerify: false } })
    res.json({
      success: true,
      data: { modified: result.modifiedCount || 0 },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Mark verified failed.' })
  }
})

module.exports = router
