const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Lead = require('../models/Lead')
const {
  workspaceFilter,
  escapeRegex,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const OPEN_STATUSES = ['Open', 'Working']

const addressSchema = Joi.object({
  country: Joi.string().allow('').max(100),
  street: Joi.string().allow('').max(500),
  city: Joi.string().allow('').max(100),
  zip: Joi.string().allow('').max(40),
  state: Joi.string().allow('').max(100),
}).default({})

const bodySchema = Joi.object({
  salutation: Joi.string().allow('').max(40),
  firstName: Joi.string().allow('').max(100),
  lastName: Joi.string().trim().min(1).max(100).required(),
  company: Joi.string().trim().min(1).max(200).required(),
  title: Joi.string().allow('').max(120),
  website: Joi.string().allow('').max(300),
  phone: Joi.string().allow('').max(60),
  email: Joi.string().trim().allow('').max(200),
  status: Joi.string().valid('Open', 'Working', 'Qualified', 'Unqualified', 'Converted'),
  address: addressSchema,
  emailOptOut: Joi.boolean(),
  numberOfEmployees: Joi.string().allow('').max(40),
  annualRevenue: Joi.string().allow('').max(60),
  leadSource: Joi.string().allow('').max(80),
  industry: Joi.string().allow('').max(80),
  description: Joi.string().allow('').max(5000),
})

function serialize(doc) {
  const obj = doc.toObject ? doc.toObject({ virtuals: true }) : { ...doc }
  const owner = obj.ownerId && typeof obj.ownerId === 'object' ? obj.ownerId : null
  const fullName = obj.fullName
    || [obj.firstName, obj.lastName].filter(Boolean).join(' ').trim()
  const address = obj.address || {}
  const state = address.state || obj.state || ''
  return {
    ...obj,
    address: {
      country: address.country || '',
      street: address.street || '',
      city: address.city || '',
      zip: address.zip || '',
      state,
    },
    state,
    fullName,
    ownerId: owner?._id || obj.ownerId,
    ownerName: owner?.name || '',
    ownerAlias: ownerAlias(owner),
  }
}

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const view = String(req.query.view || 'open').trim().toLowerCase()
    const filter = { ...workspaceFilter(req.user) }

    if (view === 'open') {
      filter.status = { $in: OPEN_STATUSES }
      filter.$and = [
        ...(filter.$and || []),
        { $or: [{ convertedAt: null }, { convertedAt: { $exists: false } }] },
      ]
    } else if (view === 'converted') {
      filter.status = 'Converted'
    } else if (view !== 'all') {
      filter.status = view.charAt(0).toUpperCase() + view.slice(1)
    }

    if (q) {
      filter.$or = [
        { firstName: { $regex: escapeRegex(q), $options: 'i' } },
        { lastName: { $regex: escapeRegex(q), $options: 'i' } },
        { company: { $regex: escapeRegex(q), $options: 'i' } },
        { email: { $regex: escapeRegex(q), $options: 'i' } },
        { phone: { $regex: escapeRegex(q), $options: 'i' } },
      ]
    }

    const items = await Lead.find(filter)
      .populate('ownerId', 'name')
      .sort({ company: 1, lastName: 1, firstName: 1 })
      .limit(500)
      .lean()

    res.json({
      success: true,
      data: items.map((item) => serialize(item)),
      count: items.length,
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list leads.' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const item = await Lead.findOne({ _id: req.params.id, ...workspaceFilter(req.user) })
      .populate('ownerId', 'name')
    if (!item) return res.status(404).json({ success: false, message: 'Lead not found.' })
    res.json({ success: true, data: serialize(item) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load lead.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    const created = await Lead.create({
      ...req.body,
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create lead.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const updated = await Lead.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      req.body,
      { new: true, runValidators: true }
    ).populate('ownerId', 'name')
    if (!updated) return res.status(404).json({ success: false, message: 'Lead not found.' })
    res.json({ success: true, data: serialize(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update lead.' })
  }
})

const convertSchema = Joi.object({
  createOpportunity: Joi.boolean(),
  opportunityName: Joi.string().allow('').max(200),
  amount: Joi.number().min(0).default(0),
  accountId: Joi.string().allow(null, ''),
  stage: Joi.string().valid('Prospecting', 'Qualification', 'Proposal', 'Negotiation').allow(''),
})

router.post('/:id/convert', validateBody(convertSchema), async (req, res) => {
  try {
    const Account = require('../models/Account')
    const Contact = require('../models/Contact')
    const Opportunity = require('../models/Opportunity')
    const { toObjectId } = require('../services/crmHelpers')
    const { getUserPreferences } = require('../services/userPreferences')

    const lead = await Lead.findOne({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' })
    if (lead.status === 'Converted' || lead.convertedAt) {
      return res.status(400).json({ success: false, message: 'Lead is already converted.' })
    }

    const salesPrefs = (await getUserPreferences(req.user._id)).sales
    const createOpportunity = req.body.createOpportunity !== undefined
      ? Boolean(req.body.createOpportunity)
      : salesPrefs.convertCreateOpportunity !== false
    const defaultStage = req.body.stage
      || salesPrefs.convertDefaultStage
      || 'Prospecting'

    const filter = workspaceFilter(req.user)
    let account = null
    const accountId = toObjectId(req.body.accountId)
    if (accountId) {
      account = await Account.findOne({ _id: accountId, ...filter })
      if (!account) return res.status(400).json({ success: false, message: 'Account not found.' })
    } else {
      const company = String(lead.company || '').trim()
      account = await Account.findOne({
        ...filter,
        name: new RegExp(`^${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      })
      if (!account) {
        account = await Account.create({
          name: company.slice(0, 200),
          website: lead.website || '',
          phone: lead.phone || '',
          description: lead.description || '',
          type: lead.industry || 'Prospect',
          billingAddress: lead.address || {},
          workspaceId: req.user.workspaceId,
          ownerId: req.user._id,
        })
      }
    }

    let contact = null
    if (lead.email) {
      contact = await Contact.findOne({ ...filter, email: String(lead.email).toLowerCase() })
    }
    if (!contact) {
      contact = await Contact.create({
        salutation: lead.salutation || '',
        firstName: lead.firstName || '',
        lastName: lead.lastName,
        accountId: account._id,
        title: lead.title || '',
        phone: lead.phone || '',
        email: lead.email || '',
        mailingAddress: lead.address || {},
        emailOptOut: Boolean(lead.emailOptOut),
        description: lead.description || '',
        workspaceId: req.user.workspaceId,
        ownerId: req.user._id,
      })
    } else if (!contact.accountId) {
      contact.accountId = account._id
      await contact.save()
    }

    let opportunity = null
    if (createOpportunity) {
      const oppName = String(req.body.opportunityName || '').trim()
        || `${account.name} — Opportunity`
      opportunity = await Opportunity.create({
        name: oppName.slice(0, 200),
        accountId: account._id,
        contactId: contact._id,
        amount: Number(req.body.amount) || 0,
        stage: defaultStage,
        description: lead.description || '',
        workspaceId: req.user.workspaceId,
        ownerId: req.user._id,
      })
    }

    lead.status = 'Converted'
    lead.convertedAt = new Date()
    lead.convertedAccountId = account._id
    lead.convertedContactId = contact._id
    lead.convertedOpportunityId = opportunity?._id || null
    await lead.save()

    res.json({
      success: true,
      data: {
        lead: serialize(lead),
        account,
        contact,
        opportunity,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Convert failed.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Lead.findOneAndDelete({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!deleted) return res.status(404).json({ success: false, message: 'Lead not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete lead.' })
  }
})

module.exports = router
