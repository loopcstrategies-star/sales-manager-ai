const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Product = require('../models/Product')
const {
  workspaceFilter,
  escapeRegex,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  family: Joi.string().allow('').max(80),
  productCode: Joi.string().allow('').max(80),
  sku: Joi.string().allow('').max(80),
  active: Joi.boolean(),
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
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' }
      filter.$or = [
        { name: regex },
        { productCode: regex },
        { sku: regex },
        { family: regex },
        { description: regex },
      ]
    }
    const items = await Product.find(filter)
      .populate('ownerId', 'name')
      .sort({ name: 1 })
      .limit(500)
      .lean()
    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list products.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    const created = await Product.create({
      name: req.body.name,
      family: req.body.family || '',
      productCode: req.body.productCode || '',
      sku: req.body.sku || '',
      active: req.body.active !== false,
      description: req.body.description || '',
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create product.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const updated = await Product.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      {
        name: req.body.name,
        family: req.body.family || '',
        productCode: req.body.productCode || '',
        sku: req.body.sku || '',
        active: req.body.active !== false,
        description: req.body.description || '',
      },
      { new: true, runValidators: true }
    ).populate('ownerId', 'name')
    if (!updated) return res.status(404).json({ success: false, message: 'Product not found.' })
    res.json({ success: true, data: serialize(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update product.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Product.findOneAndDelete({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!deleted) return res.status(404).json({ success: false, message: 'Product not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete product.' })
  }
})

module.exports = router
