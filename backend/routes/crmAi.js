const express = require('express')
const { protect } = require('../middleware/auth')
const { toObjectId, workspaceFilter } = require('../services/crmHelpers')
const { summarizeRecord } = require('../services/recordSummary')
const { createOrRefreshDigest } = require('../services/dailyDigest')
const Digest = require('../models/Digest')
const { scoreAndSaveLead, scoreWorkspaceLeads } = require('../services/leadScore')
const Lead = require('../models/Lead')
const Contact = require('../models/Contact')
const Task = require('../models/Task')
const { sendCrmEmail, isSendConfigured } = require('../services/sendEmail')
const { draftOutreachEmail } = require('../services/emailDraft')
const { getUserPreferences } = require('../services/userPreferences')
const { alertStaleDealsForWorkspace } = require('../jobs/staleDeals')

const router = express.Router()
router.use(protect)

router.post('/ai/summarize', async (req, res) => {
  try {
    const objectType = String(req.body.objectType || '').trim().toLowerCase()
    const id = String(req.body.id || '').trim()
    const data = await summarizeRecord({ user: req.user, objectType, id })
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || 'Summarize failed.' })
  }
})

router.post('/ai/summarize/create-task', async (req, res) => {
  try {
    const objectType = String(req.body.objectType || '').trim().toLowerCase()
    const id = toObjectId(req.body.id)
    const nextAction = String(req.body.nextAction || 'Follow up').trim().slice(0, 200)
    if (!id) return res.status(400).json({ success: false, message: 'id required' })
    const relatedMap = {
      leads: 'Lead',
      accounts: 'Account',
      contacts: 'Contact',
      opportunities: 'Opportunity',
    }
    const relatedType = relatedMap[objectType] || ''
    const due = new Date()
    due.setDate(due.getDate() + 2)
    const task = await Task.create({
      subject: nextAction,
      status: 'Not Started',
      priority: 'High',
      dueDate: due,
      description: 'Created from AI suggested next action.',
      relatedType,
      relatedId: id,
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    res.status(201).json({ success: true, data: { taskId: task._id, subject: task.subject } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Task create failed.' })
  }
})

router.get('/digest', async (req, res) => {
  try {
    const refresh = String(req.query.refresh || '') === '1'
    let doc = null
    if (!refresh) {
      const day = new Date()
      day.setHours(0, 0, 0, 0)
      doc = await Digest.findOne({
        workspaceId: req.user.workspaceId,
        ownerId: req.user._id,
        day,
      }).lean()
    }
    if (!doc || refresh) {
      doc = await createOrRefreshDigest(req.user)
      doc = doc.toObject ? doc.toObject() : doc
    }
    res.json({ success: true, data: doc })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Digest failed.' })
  }
})

router.post('/leads/score', async (req, res) => {
  try {
    const id = toObjectId(req.body.id)
    const useLlm = req.body.useLlm === true
    if (id) {
      const lead = await Lead.findOne({ ...workspaceFilter(req.user), _id: id })
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' })
      const data = await scoreAndSaveLead(lead, { useLlm })
      return res.json({ success: true, data })
    }
    const data = await scoreWorkspaceLeads(req.user, {
      cap: Math.min(80, Number(req.body.cap) || 40),
      useLlm,
    })
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Scoring failed.' })
  }
})

router.post('/stale-deals/scan', async (req, res) => {
  try {
    const staleDays = Math.max(7, Number(req.body.staleDays) || Number(process.env.CRM_STALE_DEAL_DAYS) || 14)
    const data = await alertStaleDealsForWorkspace(
      req.user.workspaceId,
      req.user._id,
      staleDays,
    )
    res.json({ success: true, data: { ...data, staleDays } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Stale scan failed.' })
  }
})

router.post('/email-send', async (req, res) => {
  try {
    const objectType = String(req.body.objectType || '').trim().toLowerCase()
    const id = toObjectId(req.body.id)
    let to = String(req.body.to || '').trim()
    let subject = String(req.body.subject || '').trim()
    let body = String(req.body.body || '').trim()
    let relatedType = ''
    let relatedId = id

    if (id && ['leads', 'contacts', 'lead', 'contact'].includes(objectType)) {
      if (objectType.startsWith('lead')) {
        const lead = await Lead.findOne({ ...workspaceFilter(req.user), _id: id }).lean()
        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' })
        to = to || lead.email || ''
        relatedType = 'Lead'
        if ((!subject || !body) && to) {
          const salesPrefs = (await getUserPreferences(req.user._id)).sales
          const draft = await draftOutreachEmail({
            person: lead,
            company: lead.company,
            context: [lead.industry, lead.description].filter(Boolean).join(' · '),
            tone: salesPrefs.emailTone || 'professional',
          })
          if (draft.ok) {
            subject = subject || draft.subject
            body = body || draft.body
          }
        }
      } else {
        const contact = await Contact.findOne({ ...workspaceFilter(req.user), _id: id })
          .populate('accountId', 'name')
          .lean()
        if (!contact) return res.status(404).json({ success: false, message: 'Contact not found.' })
        to = to || contact.email || ''
        relatedType = 'Contact'
        if ((!subject || !body) && to) {
          const salesPrefs = (await getUserPreferences(req.user._id)).sales
          const draft = await draftOutreachEmail({
            person: contact,
            company: contact.accountId?.name || '',
            context: [contact.title, contact.description].filter(Boolean).join(' · '),
            tone: salesPrefs.emailTone || 'professional',
          })
          if (draft.ok) {
            subject = subject || draft.subject
            body = body || draft.body
          }
        }
      }
    }

    const result = await sendCrmEmail({
      user: req.user,
      to,
      subject,
      body,
      relatedType,
      relatedId,
      logAsTask: true,
    })
    if (!result.ok) {
      return res.status(502).json({
        success: false,
        message: result.error || 'Send failed.',
        data: { ...result, sendConfigured: isSendConfigured() },
      })
    }
    res.json({
      success: true,
      data: { ...result, sendConfigured: isSendConfigured() },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Send email failed.' })
  }
})

module.exports = router
