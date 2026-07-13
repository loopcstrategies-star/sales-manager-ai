const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Opportunity = require('../models/Opportunity')
const Account = require('../models/Account')
const {
  workspaceFilter,
  escapeRegex,
  toObjectId,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  accountId: Joi.string().allow(null, ''),
  amount: Joi.number().min(0).default(0),
  stage: Joi.string().valid(
    'Prospecting',
    'Qualification',
    'Proposal',
    'Negotiation',
    'Closed Won',
    'Closed Lost'
  ),
  closeDate: Joi.date().allow(null, ''),
  description: Joi.string().allow('').max(5000),
})

function serialize(doc) {
  const obj = doc.toObject ? doc.toObject() : doc
  const owner = obj.ownerId && typeof obj.ownerId === 'object' ? obj.ownerId : null
  const account = obj.accountId && typeof obj.accountId === 'object' ? obj.accountId : null
  return {
    ...obj,
    ownerId: owner?._id || obj.ownerId,
    ownerName: owner?.name || '',
    ownerAlias: ownerAlias(owner),
    accountId: account?._id || obj.accountId || null,
    accountName: account?.name || '',
  }
}

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const filter = { ...workspaceFilter(req.user) }
    if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' }

    const items = await Opportunity.find(filter)
      .populate('ownerId', 'name')
      .populate('accountId', 'name')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()

    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list opportunities.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    let accountId = toObjectId(req.body.accountId)
    if (accountId) {
      const account = await Account.findOne({ _id: accountId, ...workspaceFilter(req.user) }).select('_id')
      if (!account) return res.status(400).json({ success: false, message: 'Account not found.' })
      accountId = account._id
    }
    const created = await Opportunity.create({
      ...req.body,
      accountId,
      closeDate: req.body.closeDate || null,
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    await created.populate('accountId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create opportunity.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    let accountId = toObjectId(req.body.accountId)
    if (accountId) {
      const account = await Account.findOne({ _id: accountId, ...workspaceFilter(req.user) }).select('_id')
      if (!account) return res.status(400).json({ success: false, message: 'Account not found.' })
      accountId = account._id
    }
    const updated = await Opportunity.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      { ...req.body, accountId, closeDate: req.body.closeDate || null },
      { new: true, runValidators: true }
    )
      .populate('ownerId', 'name')
      .populate('accountId', 'name')
    if (!updated) return res.status(404).json({ success: false, message: 'Opportunity not found.' })
    res.json({ success: true, data: serialize(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update opportunity.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Opportunity.findOneAndDelete({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!deleted) return res.status(404).json({ success: false, message: 'Opportunity not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete opportunity.' })
  }
})

module.exports = router
