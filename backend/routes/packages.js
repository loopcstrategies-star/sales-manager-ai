const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const SolutionPackage = require('../models/SolutionPackage')
const { workspaceFilter, escapeRegex, ownerAlias } = require('../services/crmHelpers')
const { ensureWorkspaceCatalog } = require('../services/catalogSeed')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().allow('').max(5000),
  industrySlug: Joi.string().allow('').max(80),
  solutionIds: Joi.array().items(Joi.string().allow('').max(80)).optional(),
  productIds: Joi.array().items(Joi.string().hex().length(24)).optional(),
  price: Joi.number().min(0).optional(),
  discount: Joi.number().min(0).max(100).optional(),
  currency: Joi.string().allow('').max(8),
  billingType: Joi.string().valid('one-time', 'monthly', 'yearly', 'custom').optional(),
  validityDays: Joi.number().min(0).optional(),
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
    const industry = String(req.query.industry || '').trim()
    const status = String(req.query.status || 'active').trim()
    if (status !== 'all') filter.status = status
    if (industry) filter.industrySlug = industry
    if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' }
    const items = await SolutionPackage.find(filter).populate('ownerId', 'name').sort({ name: 1 }).limit(500).lean()
    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list packages.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    await ensureWorkspaceCatalog(req.user)
    const created = await SolutionPackage.create({
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
      catalogKey: req.body.catalogKey || '',
      name: req.body.name,
      description: req.body.description || '',
      industrySlug: req.body.industrySlug || '',
      solutionIds: Array.isArray(req.body.solutionIds) ? req.body.solutionIds.filter(Boolean) : [],
      productIds: Array.isArray(req.body.productIds) ? req.body.productIds.filter(Boolean) : [],
      price: Number(req.body.price) || 0,
      discount: Number(req.body.discount) || 0,
      currency: req.body.currency || 'USD',
      billingType: req.body.billingType || 'one-time',
      validityDays: Number(req.body.validityDays) || 30,
      status: req.body.status || 'active',
    })
    await created.populate('ownerId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create package.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const updated = await SolutionPackage.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      {
        name: req.body.name,
        description: req.body.description || '',
        industrySlug: req.body.industrySlug || '',
        solutionIds: Array.isArray(req.body.solutionIds) ? req.body.solutionIds.filter(Boolean) : [],
        productIds: Array.isArray(req.body.productIds) ? req.body.productIds.filter(Boolean) : [],
        price: Number(req.body.price) || 0,
        discount: Number(req.body.discount) || 0,
        currency: req.body.currency || 'USD',
        billingType: req.body.billingType || 'one-time',
        validityDays: Number(req.body.validityDays) || 30,
        status: req.body.status || 'active',
      },
      { new: true }
    ).populate('ownerId', 'name')
    if (!updated) return res.status(404).json({ success: false, message: 'Package not found.' })
    res.json({ success: true, data: serialize(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update package.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const updated = await SolutionPackage.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      { status: 'archived' },
      { new: true }
    )
    if (!updated) return res.status(404).json({ success: false, message: 'Package not found.' })
    res.json({ success: true, data: serialize(updated) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to archive package.' })
  }
})

module.exports = router
