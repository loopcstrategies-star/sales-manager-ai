const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const CalendarEvent = require('../models/CalendarEvent')
const {
  workspaceFilter,
  escapeRegex,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  title: Joi.string().trim().min(1).max(300).required(),
  startAt: Joi.date().required(),
  endAt: Joi.date().required(),
  allDay: Joi.boolean(),
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
    const from = req.query.from ? new Date(String(req.query.from)) : null
    const to = req.query.to ? new Date(String(req.query.to)) : null
    const filter = { ...workspaceFilter(req.user) }

    if (from && !Number.isNaN(from.getTime()) && to && !Number.isNaN(to.getTime())) {
      filter.startAt = { $lt: to }
      filter.endAt = { $gt: from }
    }
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' }
      filter.$or = [{ title: regex }, { description: regex }]
    }

    const items = await CalendarEvent.find(filter)
      .populate('ownerId', 'name')
      .sort({ startAt: 1 })
      .limit(500)
      .lean()

    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list calendar events.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    const created = await CalendarEvent.create({
      title: req.body.title,
      startAt: req.body.startAt,
      endAt: req.body.endAt,
      allDay: Boolean(req.body.allDay),
      description: req.body.description || '',
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create calendar event.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const updated = await CalendarEvent.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      {
        title: req.body.title,
        startAt: req.body.startAt,
        endAt: req.body.endAt,
        allDay: Boolean(req.body.allDay),
        description: req.body.description || '',
      },
      { new: true, runValidators: true }
    ).populate('ownerId', 'name')
    if (!updated) return res.status(404).json({ success: false, message: 'Calendar event not found.' })
    res.json({ success: true, data: serialize(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update calendar event.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await CalendarEvent.findOneAndDelete({
      _id: req.params.id,
      ...workspaceFilter(req.user),
    })
    if (!deleted) return res.status(404).json({ success: false, message: 'Calendar event not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete calendar event.' })
  }
})

module.exports = router
