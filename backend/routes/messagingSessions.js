const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const MessagingSession = require('../models/MessagingSession')
const {
  workspaceFilter,
  escapeRegex,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  channel: Joi.string().allow('').max(80),
  messagingUser: Joi.string().allow('').max(120),
  platformType: Joi.string().allow('').max(80),
  status: Joi.string().valid('New', 'Active', 'Ended'),
  startTime: Joi.date().allow(null, ''),
  endTime: Joi.date().allow(null, ''),
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
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' }
      filter.$or = [
        { name: regex },
        { channel: regex },
        { messagingUser: regex },
        { platformType: regex },
      ]
    }

    const items = await MessagingSession.find(filter)
      .populate('ownerId', 'name')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()

    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list messaging sessions.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    const created = await MessagingSession.create({
      name: req.body.name,
      channel: req.body.channel || '',
      messagingUser: req.body.messagingUser || '',
      platformType: req.body.platformType || '',
      status: req.body.status || 'New',
      startTime: req.body.startTime || new Date(),
      endTime: req.body.endTime || null,
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create messaging session.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const existing = await MessagingSession.findOne({
      _id: req.params.id,
      ...workspaceFilter(req.user),
    })
    if (!existing) return res.status(404).json({ success: false, message: 'Messaging session not found.' })

    existing.name = req.body.name
    existing.channel = req.body.channel || ''
    existing.messagingUser = req.body.messagingUser || ''
    existing.platformType = req.body.platformType || ''
    existing.status = req.body.status || existing.status
    if (req.body.startTime !== undefined && req.body.startTime !== '') {
      existing.startTime = req.body.startTime
    }
    if (req.body.endTime !== undefined && req.body.endTime !== '') {
      existing.endTime = req.body.endTime
    } else if (req.body.status === 'Ended' && !existing.endTime) {
      existing.endTime = new Date()
    }
    await existing.save()
    await existing.populate('ownerId', 'name')
    res.json({ success: true, data: serialize(existing) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update messaging session.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await MessagingSession.findOneAndDelete({
      _id: req.params.id,
      ...workspaceFilter(req.user),
    })
    if (!deleted) return res.status(404).json({ success: false, message: 'Messaging session not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete messaging session.' })
  }
})

module.exports = router
