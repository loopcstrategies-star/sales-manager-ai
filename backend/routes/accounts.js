const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Account = require('../models/Account')
const {
  workspaceFilter,
  escapeRegex,
  toObjectId,
  addressJoi,
  customFieldsJoi,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const accountBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  website: Joi.string().allow('').max(300),
  type: Joi.string().allow('').max(80),
  description: Joi.string().allow('').max(5000),
  parentAccountId: Joi.string().allow(null, ''),
  phone: Joi.string().allow('').max(60),
  label: Joi.string().allow('').max(80),
  region: Joi.string().allow('').max(80),
  billingAddress: addressJoi(Joi),
  shippingAddress: addressJoi(Joi),
  customFields: customFieldsJoi(Joi),
})

const bulkLabelSchema = Joi.object({
  ids: Joi.array().items(Joi.string().trim().min(1)).min(1).max(200).required(),
  label: Joi.string().allow('').max(80).required(),
})

function serializeAccount(doc) {
  const obj = doc.toObject ? doc.toObject() : doc
  const owner = obj.ownerId && typeof obj.ownerId === 'object' ? obj.ownerId : null
  const parent = obj.parentAccountId && typeof obj.parentAccountId === 'object' ? obj.parentAccountId : null
  return {
    ...obj,
    ownerId: owner?._id || obj.ownerId,
    ownerName: owner?.name || '',
    ownerAlias: ownerAlias(owner),
    parentAccountId: parent?._id || obj.parentAccountId || null,
    parentAccountName: parent?.name || '',
  }
}

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const label = String(req.query.label || '').trim()
    const filter = { ...workspaceFilter(req.user) }
    if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' }
    if (label) filter.label = label

    const items = await Account.find(filter)
      .populate('ownerId', 'name')
      .populate('parentAccountId', 'name')
      .sort({ name: 1 })
      .limit(500)
      .lean()

    res.json({
      success: true,
      data: items.map((item) => serializeAccount(item)),
      count: items.length,
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list accounts.' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const item = await Account.findOne({ _id: req.params.id, ...workspaceFilter(req.user) })
      .populate('ownerId', 'name')
      .populate('parentAccountId', 'name')
    if (!item) return res.status(404).json({ success: false, message: 'Account not found.' })
    res.json({ success: true, data: serializeAccount(item) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load account.' })
  }
})

router.post('/', validateBody(accountBodySchema), async (req, res) => {
  try {
    const created = await Account.create({
      ...req.body,
      parentAccountId: toObjectId(req.body.parentAccountId),
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    await created.populate('parentAccountId', 'name')
    res.status(201).json({ success: true, data: serializeAccount(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create account.' })
  }
})

router.post('/bulk-label', validateBody(bulkLabelSchema), async (req, res) => {
  try {
    const ids = (req.body.ids || []).map((id) => toObjectId(id)).filter(Boolean)
    const label = String(req.body.label || '').trim().slice(0, 80)
    const result = await Account.updateMany(
      { ...workspaceFilter(req.user), _id: { $in: ids } },
      { $set: { label } },
    )
    res.json({
      success: true,
      data: { matched: result.matchedCount || 0, modified: result.modifiedCount || 0, label },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to assign labels.' })
  }
})

router.patch('/:id', validateBody(accountBodySchema), async (req, res) => {
  try {
    const updated = await Account.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      {
        ...req.body,
        parentAccountId: toObjectId(req.body.parentAccountId),
      },
      { new: true, runValidators: true }
    )
      .populate('ownerId', 'name')
      .populate('parentAccountId', 'name')
    if (!updated) return res.status(404).json({ success: false, message: 'Account not found.' })
    res.json({ success: true, data: serializeAccount(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update account.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Account.findOneAndDelete({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!deleted) return res.status(404).json({ success: false, message: 'Account not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete account.' })
  }
})

module.exports = router
