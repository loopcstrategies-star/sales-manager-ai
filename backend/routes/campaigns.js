const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Campaign = require('../models/Campaign')
const {
  workspaceFilter,
  escapeRegex,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  status: Joi.string().valid('Planned', 'In Progress', 'Completed', 'Aborted'),
  type: Joi.string().valid('Email', 'Event', 'Social', 'Webinar', 'Other'),
  startDate: Joi.date().allow(null, ''),
  endDate: Joi.date().allow(null, ''),
  description: Joi.string().allow('').max(5000),
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
    const q = String(req.query.q || '').trim()
    const filter = { ...workspaceFilter(req.user) }
    if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' }

    const items = await Campaign.find(filter)
      .populate('ownerId', 'name')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()

    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list campaigns.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    const created = await Campaign.create({
      ...req.body,
      startDate: req.body.startDate || null,
      endDate: req.body.endDate || null,
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create campaign.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const updated = await Campaign.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      {
        ...req.body,
        startDate: req.body.startDate || null,
        endDate: req.body.endDate || null,
      },
      { new: true, runValidators: true }
    ).populate('ownerId', 'name')
    if (!updated) return res.status(404).json({ success: false, message: 'Campaign not found.' })
    res.json({ success: true, data: serialize(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update campaign.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Campaign.findOneAndDelete({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!deleted) return res.status(404).json({ success: false, message: 'Campaign not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete campaign.' })
  }
})

module.exports = router
