/**
 * Inbound CRM webhooks (no session auth — shared secret only).
 *
 * POST /api/crm/webhooks/lead
 * Headers:
 *   X-CRM-Webhook-Secret: <CRM_WEBHOOK_SECRET>
 *   Content-Type: application/json
 *
 * Body example (website form / Zapier / Typeform):
 * {
 *   "lastName": "Smith",          // required
 *   "company": "Acme Corp",       // required
 *   "firstName": "Jane",
 *   "email": "jane@acme.com",
 *   "phone": "+1-555-0100",
 *   "title": "Buyer",
 *   "website": "https://acme.com",
 *   "industry": "Technology",
 *   "description": "Interested in demo",
 *   "leadSource": "Website",      // default: Webhook
 *   "workspaceId": "<optional ObjectId>" // else CRM_WEBHOOK_WORKSPACE_ID
 * }
 */
const express = require('express')
const Lead = require('../models/Lead')
const User = require('../models/User')

const router = express.Router()

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  if (left.length !== right.length) return false
  let out = 0
  for (let i = 0; i < left.length; i += 1) out |= left[i] ^ right[i]
  return out === 0
}

router.post('/lead', async (req, res) => {
  try {
    const expected = String(process.env.CRM_WEBHOOK_SECRET || '').trim()
    if (!expected) {
      return res.status(503).json({ success: false, message: 'CRM_WEBHOOK_SECRET is not configured.' })
    }
    const provided = String(
      req.headers['x-crm-webhook-secret']
      || req.headers['x-webhook-secret']
      || req.body?.secret
      || '',
    ).trim()
    if (!timingSafeEqual(provided, expected)) {
      return res.status(401).json({ success: false, message: 'Invalid webhook secret.' })
    }

    const lastName = String(req.body.lastName || req.body.last_name || '').trim()
    const company = String(req.body.company || req.body.companyName || '').trim()
    if (!lastName || !company) {
      return res.status(400).json({ success: false, message: 'lastName and company are required.' })
    }

    const workspaceId = String(
      req.body.workspaceId || process.env.CRM_WEBHOOK_WORKSPACE_ID || '',
    ).trim()
    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        message: 'workspaceId is required (body or CRM_WEBHOOK_WORKSPACE_ID).',
      })
    }

    let ownerId = req.body.ownerId || process.env.CRM_WEBHOOK_OWNER_ID || null
    if (!ownerId) {
      const owner = await User.findOne({ workspaceId }).select('_id').lean()
      ownerId = owner?._id
    }
    if (!ownerId) {
      return res.status(400).json({ success: false, message: 'No owner found for workspace.' })
    }

    const email = String(req.body.email || '').trim().toLowerCase()
    const payload = {
      lastName,
      company,
      firstName: String(req.body.firstName || req.body.first_name || '').trim(),
      email,
      phone: String(req.body.phone || '').trim(),
      title: String(req.body.title || '').trim(),
      website: String(req.body.website || '').trim(),
      industry: String(req.body.industry || '').trim(),
      description: String(req.body.description || req.body.message || '').trim(),
      leadSource: String(req.body.leadSource || req.body.source || 'Webhook').trim() || 'Webhook',
      status: 'Open',
      workspaceId,
      ownerId,
    }

    let lead
    if (email) {
      lead = await Lead.findOne({ workspaceId, email })
      if (lead) {
        Object.assign(lead, payload)
        await lead.save()
        return res.json({ success: true, data: { lead, created: false } })
      }
    }

    lead = await Lead.create(payload)

    // Auto-enrich inbound leads from web (best-effort, non-blocking for response timing)
    let enriched = false
    try {
      const { enrichFromQuery, applyLeadEnrichment } = require('../services/crmEnrichment')
      const { scoreAndSaveLead } = require('../services/leadScore')
      const query = [lead.company, lead.website, lead.email].filter(Boolean).join(' ')
      if (query) {
        const result = await enrichFromQuery(query)
        applyLeadEnrichment(lead, result.fields || {}, false)
        await lead.save()
        enriched = true
      }
      await scoreAndSaveLead(lead, { useLlm: false })
    } catch (enrichErr) {
      console.error('[webhook] auto-enrich failed:', enrichErr.message)
    }

    res.status(201).json({ success: true, data: { lead, created: true, enriched } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Webhook failed.' })
  }
})

module.exports = router
