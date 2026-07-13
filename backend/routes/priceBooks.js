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

const entrySchema = Joi.object({
  productId: Joi.string().required(),
  listPrice: Joi.number().min(0).required(),
  active: Joi.boolean(),
})

router.get('/:id/entries', async (req, res) => {
  try {
    const PriceBookEntry = require('../models/PriceBookEntry')
    const Product = require('../models/Product')
    const book = await PriceBook.findOne({ _id: req.params.id, ...workspaceFilter(req.user) }).select('_id')
    if (!book) return res.status(404).json({ success: false, message: 'Price book not found.' })
    const entries = await PriceBookEntry.find({
      ...workspaceFilter(req.user),
      priceBookId: book._id,
    }).lean()
    const productIds = entries.map((e) => e.productId).filter(Boolean)
    const products = await Product.find({ _id: { $in: productIds } }).select('name productCode sku').lean()
    const byId = Object.fromEntries(products.map((p) => [String(p._id), p]))
    res.json({
      success: true,
      data: entries.map((e) => ({
        ...e,
        productName: byId[String(e.productId)]?.name || '',
        productCode: byId[String(e.productId)]?.productCode || '',
      })),
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list entries.' })
  }
})

router.post('/:id/entries', validateBody(entrySchema), async (req, res) => {
  try {
    const PriceBookEntry = require('../models/PriceBookEntry')
    const Product = require('../models/Product')
    const { toObjectId } = require('../services/crmHelpers')
    const book = await PriceBook.findOne({ _id: req.params.id, ...workspaceFilter(req.user) }).select('_id')
    if (!book) return res.status(404).json({ success: false, message: 'Price book not found.' })
    const productId = toObjectId(req.body.productId)
    const product = await Product.findOne({ _id: productId, ...workspaceFilter(req.user) })
    if (!product) return res.status(400).json({ success: false, message: 'Product not found.' })
    const entry = await PriceBookEntry.findOneAndUpdate(
      { workspaceId: req.user.workspaceId, priceBookId: book._id, productId },
      {
        listPrice: Number(req.body.listPrice) || 0,
        active: req.body.active !== false,
        workspaceId: req.user.workspaceId,
        priceBookId: book._id,
        productId,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    res.status(201).json({
      success: true,
      data: { ...entry.toObject(), productName: product.name, productCode: product.productCode },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save entry.' })
  }
})

router.delete('/:id/entries/:entryId', async (req, res) => {
  try {
    const PriceBookEntry = require('../models/PriceBookEntry')
    const deleted = await PriceBookEntry.findOneAndDelete({
      _id: req.params.entryId,
      priceBookId: req.params.id,
      ...workspaceFilter(req.user),
    })
    if (!deleted) return res.status(404).json({ success: false, message: 'Entry not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete entry.' })
  }
})

module.exports = router
