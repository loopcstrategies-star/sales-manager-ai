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
  status: Joi.string().valid('Open', 'Working', 'Qualified', 'Unqualified'),
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
