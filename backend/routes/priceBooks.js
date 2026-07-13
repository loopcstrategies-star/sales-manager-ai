const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const PriceBook = require('../models/PriceBook')
const {
  workspaceFilter,
  escapeRegex,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().allow('').max(5000),
  active: Joi.boolean(),
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
      filter.$or = [{ name: regex }, { description: regex }]
    }
    const items = await PriceBook.find(filter)
      .populate('ownerId', 'name')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()
    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list price books.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    const created = await PriceBook.create({
      name: req.body.name,
      description: req.body.description || '',
      active: req.body.active !== false,
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create price book.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const updated = await PriceBook.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      {
        name: req.body.name,
        description: req.body.description || '',
        active: req.body.active !== false,
      },
      { new: true, runValidators: true }
    ).populate('ownerId', 'name')
    if (!updated) return res.status(404).json({ success: false, message: 'Price book not found.' })
    res.json({ success: true, data: serialize(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update price book.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await PriceBook.findOneAndDelete({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!deleted) return res.status(404).json({ success: false, message: 'Price book not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete price book.' })
  }
})

module.exports = router
