const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Solution = require('../models/Solution')
const { workspaceFilter, escapeRegex, ownerAlias } = require('../services/crmHelpers')
const { ensureWorkspaceCatalog, slugify } = require('../services/catalogSeed')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  slug: Joi.string().allow('').max(120),
  category: Joi.string().allow('').max(80),
  description: Joi.string().allow('').max(5000),
  features: Joi.array().items(Joi.string().allow('').max(200)).optional(),
  industries: Joi.array().items(Joi.string().allow('').max(80)).optional(),
  businessTypes: Joi.array().items(Joi.string().allow('').max(120)).optional(),
  pricing: Joi.object({
    amount: Joi.number().min(0).optional(),
    cost: Joi.number().min(0).optional(),
    currency: Joi.string().allow('').max(8).optional(),
    model: Joi.string().allow('').max(40).optional(),
  }).optional(),
  salesNotes: Joi.string().allow('').max(5000),
  proposalTemplate: Joi.string().allow('').max(10000),
  deliveryNotes: Joi.string().allow('').max(5000),
  status: Joi.string().valid('active', 'archived', 'draft').optional(),
  catalogKey: Joi.string().allow('').max(80),
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
    await ensureWorkspaceCatalog(req.user)
    const filter = { ...workspaceFilter(req.user) }
    const q = String(req.query.q || '').trim()
    const category = String(req.query.category || '').trim()
    const industry = String(req.query.industry || '').trim()
    const status = String(req.query.status || 'active').trim()
    if (status !== 'all') filter.status = status
    if (category) filter.category = category
    if (industry) filter.industries = { $in: [industry, 'all'] }
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' }
      filter.$or = [{ name: regex }, { description: regex }, { category: regex }]
    }
    const items = await Solution.find(filter).populate('ownerId', 'name').sort({ name: 1 }).limit(500).lean()
    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list solutions.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    await ensureWorkspaceCatalog(req.user)
    const created = await Solution.create({
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
      catalogKey: req.body.catalogKey || '',
      name: req.body.name,
      slug: req.body.slug || slugify(req.body.name),
      category: req.body.category || 'other',
      description: req.body.description || '',
      features: Array.isArray(req.body.features) ? req.body.features.filter(Boolean) : [],
      industries: Array.isArray(req.body.industries) ? req.body.industries.filter(Boolean) : [],
      businessTypes: Array.isArray(req.body.businessTypes) ? req.body.businessTypes.filter(Boolean) : [],
      pricing: {
        amount: Number(req.body.pricing?.amount) || 0,
        cost: Number(req.body.pricing?.cost) || 0,
        currency: req.body.pricing?.currency || 'USD',
        model: req.body.pricing?.model || 'one-time',
      },
      salesNotes: req.body.salesNotes || '',
      proposalTemplate: req.body.proposalTemplate || '',
      deliveryNotes: req.body.deliveryNotes || '',
      status: req.body.status || 'active',
    })
    await created.populate('ownerId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create solution.' })
  }
})

router.post('/:id/duplicate', async (req, res) => {
  try {
    const source = await Solution.findOne({ _id: req.params.id, ...workspaceFilter(req.user) }).lean()
    if (!source) return res.status(404).json({ success: false, message: 'Solution not found.' })
    const created = await Solution.create({
      ...source,
      _id: undefined,
      name: `${source.name} (Copy)`,
      slug: slugify(`${source.name}-copy`),
      catalogKey: '',
      ownerId: req.user._id,
      workspaceId: req.user.workspaceId,
      status: 'draft',
    })
    await created.populate('ownerId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to duplicate solution.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const updated = await Solution.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      {
        name: req.body.name,
        slug: req.body.slug || slugify(req.body.name),
        category: req.body.category || 'other',
        description: req.body.description || '',
        features: Array.isArray(req.body.features) ? req.body.features.filter(Boolean) : [],
        industries: Array.isArray(req.body.industries) ? req.body.industries.filter(Boolean) : [],
        businessTypes: Array.isArray(req.body.businessTypes) ? req.body.businessTypes.filter(Boolean) : [],
        pricing: {
          amount: Number(req.body.pricing?.amount) || 0,
          cost: Number(req.body.pricing?.cost) || 0,
          currency: req.body.pricing?.currency || 'USD',
          model: req.body.pricing?.model || 'one-time',
        },
        salesNotes: req.body.salesNotes || '',
        proposalTemplate: req.body.proposalTemplate || '',
        deliveryNotes: req.body.deliveryNotes || '',
        status: req.body.status || 'active',
      },
      { new: true }
    ).populate('ownerId', 'name')
    if (!updated) return res.status(404).json({ success: false, message: 'Solution not found.' })
    res.json({ success: true, data: serialize(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update solution.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const updated = await Solution.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      { status: 'archived' },
      { new: true }
    )
    if (!updated) return res.status(404).json({ success: false, message: 'Solution not found.' })
    res.json({ success: true, data: serialize(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to archive solution.' })
  }
})

module.exports = router
