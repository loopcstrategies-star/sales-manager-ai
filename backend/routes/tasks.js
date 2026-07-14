const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Task = require('../models/Task')
const {
  workspaceFilter,
  escapeRegex,
  toObjectId,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  subject: Joi.string().trim().min(1).max(200).required(),
  status: Joi.string().valid('Not Started', 'In Progress', 'Completed', 'Waiting', 'Deferred'),
  priority: Joi.string().valid('Low', 'Normal', 'High'),
  dueDate: Joi.date().allow(null, ''),
  description: Joi.string().allow('').max(5000),
  relatedType: Joi.string().valid('Lead', 'Contact', 'Account', 'Opportunity', 'Case', ''),
  relatedId: Joi.string().allow(null, ''),
})

function serialize(doc) {
  const obj = doc.toObject ? doc.toObject() : doc
  const owner = obj.ownerId && typeof obj.ownerId === 'object' ? obj.ownerId : null
  return {
    ...obj,
    ownerId: owner?._id || obj.ownerId,
    ownerName: owner?.name || '',
    ownerAlias: ownerAlias(owner),
  }
}

router.get('/', async (req, res) => {
  try {
    const filter = { ...workspaceFilter(req.user) }
    const relatedType = String(req.query.relatedType || '').trim()
    const relatedId = toObjectId(req.query.relatedId)
    const q = String(req.query.q || '').trim()
    const mine = String(req.query.mine || '').trim()
    const status = String(req.query.status || '').trim().toLowerCase()
    const overdue = String(req.query.overdue || '').trim()

    if (relatedType) filter.relatedType = relatedType
    if (relatedId) filter.relatedId = relatedId
    if (q) filter.subject = { $regex: escapeRegex(q), $options: 'i' }
    if (mine === '1' || mine === 'true') filter.ownerId = req.user._id
    if (status === 'open') filter.status = { $ne: 'Completed' }
    else if (status === 'completed') filter.status = 'Completed'
    if (overdue === '1' || overdue === 'true') {
      filter.status = { $ne: 'Completed' }
      filter.dueDate = { $lt: new Date(), $ne: null }
    }

    const items = await Task.find(filter)
      .populate('ownerId', 'name')
      .sort({ dueDate: 1, updatedAt: -1 })
      .limit(200)
      .lean()

    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list tasks.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    const created = await Task.create({
      ...req.body,
      relatedId: toObjectId(req.body.relatedId),
      dueDate: req.body.dueDate || null,
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create task.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const updated = await Task.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      {
        ...req.body,
        relatedId: toObjectId(req.body.relatedId),
        dueDate: req.body.dueDate || null,
      },
      { new: true, runValidators: true },
    ).populate('ownerId', 'name')
    if (!updated) return res.status(404).json({ success: false, message: 'Task not found.' })
    res.json({ success: true, data: serialize(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update task.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Task.findOneAndDelete({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!deleted) return res.status(404).json({ success: false, message: 'Task not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete task.' })
  }
})

module.exports = router
