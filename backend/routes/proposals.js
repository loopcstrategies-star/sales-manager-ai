const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Proposal = require('../models/Proposal')
const Opportunity = require('../models/Opportunity')
const { workspaceFilter, ownerAlias, toObjectId } = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const lineSchema = Joi.object({
  productId: Joi.string().hex().length(24).allow(null, ''),
  solutionId: Joi.string().allow('').max(80),
  packageId: Joi.string().allow('').max(80),
  name: Joi.string().allow('').max(200),
  quantity: Joi.number().min(0),
  unitPrice: Joi.number().min(0),
  discount: Joi.number().min(0),
  tax: Joi.number().min(0),
})

const bodySchema = Joi.object({
  opportunityId: Joi.string().hex().length(24).required(),
  accountId: Joi.string().hex().length(24).allow(null, ''),
  contactId: Joi.string().hex().length(24).allow(null, ''),
  title: Joi.string().trim().min(1).max(200).required(),
  status: Joi.string().valid('Draft', 'Sent', 'Viewed', 'Negotiation', 'Accepted', 'Rejected', 'Expired'),
  lines: Joi.array().items(lineSchema).optional(),
  currency: Joi.string().allow('').max(8),
  validityDate: Joi.date().allow(null),
  paymentTerms: Joi.string().allow('').max(500),
  notes: Joi.string().allow('').max(5000),
})

function totals(lines = []) {
  let subtotal = 0
  let tax = 0
  lines.forEach((line) => {
    const qty = Number(line.quantity) || 0
    const price = Number(line.unitPrice) || 0
    const discount = Number(line.discount) || 0
    const lineTax = Number(line.tax) || 0
    subtotal += Math.max(0, qty * price - discount)
    tax += lineTax
  })
  return { subtotal, tax, total: subtotal + tax }
}

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
    const opportunityId = toObjectId(req.query.opportunityId)
    if (opportunityId) filter.opportunityId = opportunityId
    const items = await Proposal.find(filter).sort({ updatedAt: -1 }).limit(200).lean()
    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list proposals.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    const opportunity = await Opportunity.findOne({
      _id: req.body.opportunityId,
      ...workspaceFilter(req.user),
    }).lean()
    if (!opportunity) return res.status(404).json({ success: false, message: 'Opportunity not found.' })

    const lines = Array.isArray(req.body.lines) && req.body.lines.length
      ? req.body.lines
      : (opportunity.products || []).map((line) => ({
        productId: line.productId || null,
        solutionId: line.solutionId || '',
        packageId: '',
        name: line.productName || '',
        quantity: line.quantity || 1,
        unitPrice: line.unitPrice || 0,
        discount: 0,
        tax: 0,
      }))
    const amounts = totals(lines)
    const created = await Proposal.create({
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
      opportunityId: opportunity._id,
      accountId: req.body.accountId || opportunity.accountId || null,
      contactId: req.body.contactId || opportunity.contactId || null,
      title: req.body.title,
      status: req.body.status || 'Draft',
      lines,
      ...amounts,
      currency: req.body.currency || 'USD',
      validityDate: req.body.validityDate || null,
      paymentTerms: req.body.paymentTerms || '',
      notes: req.body.notes || '',
    })
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create proposal.' })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const existing = await Proposal.findOne({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!existing) return res.status(404).json({ success: false, message: 'Proposal not found.' })
    if (req.body.title) existing.title = String(req.body.title).slice(0, 200)
    if (req.body.status) existing.status = req.body.status
    if (Array.isArray(req.body.lines)) {
      existing.lines = req.body.lines
      const amounts = totals(req.body.lines)
      existing.subtotal = amounts.subtotal
      existing.tax = amounts.tax
      existing.total = amounts.total
    }
    if (req.body.paymentTerms !== undefined) existing.paymentTerms = String(req.body.paymentTerms || '').slice(0, 500)
    if (req.body.notes !== undefined) existing.notes = String(req.body.notes || '').slice(0, 5000)
    if (req.body.validityDate !== undefined) existing.validityDate = req.body.validityDate || null
    if (req.body.currency) existing.currency = String(req.body.currency).slice(0, 8)
    await existing.save()
    res.json({ success: true, data: serialize(existing) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update proposal.' })
  }
})

module.exports = router
