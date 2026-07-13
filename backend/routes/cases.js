const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Case = require('../models/Case')
const {
  workspaceFilter,
  escapeRegex,
  toObjectId,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  subject: Joi.string().trim().min(1).max(300).required(),
  contactId: Joi.string().allow(null, ''),
  accountId: Joi.string().allow(null, ''),
  status: Joi.string().valid('New', 'Working', 'Escalated', 'Closed'),
  priority: Joi.string().valid('Low', 'Medium', 'High'),
  description: Joi.string().allow('').max(5000),
})

function serialize(doc) {
  const obj = doc.toObject ? doc.toObject() : doc
  const owner = obj.ownerId && typeof obj.ownerId === 'object' ? obj.ownerId : null
  const contact = obj.contactId && typeof obj.contactId === 'object' ? obj.contactId : null
  const account = obj.accountId && typeof obj.accountId === 'object' ? obj.accountId : null
  return {
    ...obj,
    ownerId: owner?._id || obj.ownerId,
    ownerName: owner?.name || '',
    ownerAlias: ownerAlias(owner),
    contactId: contact?._id || obj.contactId || null,
    contactName: contact
      ? [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim()
      : '',
    accountId: account?._id || obj.accountId || null,
    accountName: account?.name || '',
  }
}

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const filter = { ...workspaceFilter(req.user) }
    if (q) filter.subject = { $regex: escapeRegex(q), $options: 'i' }

    const items = await Case.find(filter)
      .populate('ownerId', 'name')
      .populate('contactId', 'firstName lastName')
      .populate('accountId', 'name')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()

    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list cases.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    const created = await Case.create({
      ...req.body,
      contactId: toObjectId(req.body.contactId),
      accountId: toObjectId(req.body.accountId),
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    await created.populate('contactId', 'firstName lastName')
    await created.populate('accountId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create case.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const updated = await Case.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      {
        ...req.body,
        contactId: toObjectId(req.body.contactId),
        accountId: toObjectId(req.body.accountId),
      },
      { new: true, runValidators: true }
    )
      .populate('ownerId', 'name')
      .populate('contactId', 'firstName lastName')
      .populate('accountId', 'name')
    if (!updated) return res.status(404).json({ success: false, message: 'Case not found.' })
    res.json({ success: true, data: serialize(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update case.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Case.findOneAndDelete({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!deleted) return res.status(404).json({ success: false, message: 'Case not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete case.' })
  }
})

module.exports = router
