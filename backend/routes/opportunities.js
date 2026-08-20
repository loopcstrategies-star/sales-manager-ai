const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Opportunity = require('../models/Opportunity')
const Account = require('../models/Account')
const {
  workspaceFilter,
  escapeRegex,
  toObjectId,
  ownerAlias,
} = require('../services/crmHelpers')
const { attachIndustryMetadata, industryRecommendedSolutions } = require('../services/industryRecord')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(200),
  accountId: Joi.string().allow(null, ''),
  contactId: Joi.string().allow(null, ''),
  industryId: Joi.string().allow('').max(80),
  industrySlug: Joi.string().allow('').max(80),
  businessType: Joi.string().allow('').max(120),
  amount: Joi.number().min(0),
  stage: Joi.string().valid(
    'Prospecting',
    'Qualification',
    'Proposal',
    'Negotiation',
    'Closed Won',
    'Closed Lost'
  ),
  closeDate: Joi.date().allow(null, ''),
  nextStep: Joi.string().allow('').max(300),
  nextStepDue: Joi.date().allow(null, ''),
  probability: Joi.number().min(0).max(100).allow(null),
  lostReason: Joi.string().allow('').max(300),
  description: Joi.string().allow('').max(5000),
  products: Joi.array().items(Joi.object({
    productId: Joi.string().allow(null, ''),
    productName: Joi.string().allow('').max(200),
    solutionId: Joi.string().allow('').max(80),
    quantity: Joi.number().min(0),
    unitPrice: Joi.number().min(0),
    _id: Joi.any(),
  })).optional(),
})

const createSchema = bodySchema.keys({
  name: Joi.string().trim().min(1).max(200).required(),
})

function serialize(doc) {
  const obj = doc.toObject ? doc.toObject() : doc
  const owner = obj.ownerId && typeof obj.ownerId === 'object' ? obj.ownerId : null
  const account = obj.accountId && typeof obj.accountId === 'object' ? obj.accountId : null
  const contact = obj.contactId && typeof obj.contactId === 'object' ? obj.contactId : null
  const products = Array.isArray(obj.products) ? obj.products.map((p) => ({
    ...p,
    totalPrice: Number(p.quantity || 0) * Number(p.unitPrice || 0),
  })) : []
  return {
    ...obj,
    products,
    ownerId: owner?._id || obj.ownerId,
    ownerName: owner?.name || '',
    ownerAlias: ownerAlias(owner),
    accountId: account?._id || obj.accountId || null,
    accountName: account?.name || '',
    contactId: contact?._id || obj.contactId || null,
    contactName: contact
      ? [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim()
      : '',
  }
}

function normalizeProducts(products = []) {
  return (products || []).map((p) => ({
    productId: toObjectId(p.productId),
    productName: String(p.productName || '').slice(0, 200),
    solutionId: String(p.solutionId || '').slice(0, 80),
    quantity: Number(p.quantity) || 0,
    unitPrice: Number(p.unitPrice) || 0,
  }))
}

function amountFromProducts(products) {
  return products.reduce((sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.unitPrice) || 0), 0)
}

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const industry = String(req.query.industry || '').trim()
    const filter = { ...workspaceFilter(req.user) }
    if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' }
    if (industry) filter.industrySlug = industry

    const items = await Opportunity.find(filter)
      .populate('ownerId', 'name')
      .populate('accountId', 'name')
      .populate('contactId', 'firstName lastName')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()

    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list opportunities.' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const item = await Opportunity.findOne({ _id: req.params.id, ...workspaceFilter(req.user) })
      .populate('ownerId', 'name')
      .populate('accountId', 'name')
      .populate('contactId', 'firstName lastName')
    if (!item) return res.status(404).json({ success: false, message: 'Opportunity not found.' })
    res.json({ success: true, data: serialize(item) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load opportunity.' })
  }
})

router.post('/', validateBody(createSchema), async (req, res) => {
  try {
    let accountId = toObjectId(req.body.accountId)
    if (accountId) {
      const account = await Account.findOne({ _id: accountId, ...workspaceFilter(req.user) }).select('_id')
      if (!account) return res.status(400).json({ success: false, message: 'Account not found.' })
      accountId = account._id
    }
    const products = normalizeProducts(req.body.products)
    const amount = products.length ? amountFromProducts(products) : (Number(req.body.amount) || 0)
    const created = await Opportunity.create({
      ...req.body,
      accountId,
      contactId: toObjectId(req.body.contactId),
      products,
      amount,
      closeDate: req.body.closeDate || null,
      nextStep: String(req.body.nextStep || '').slice(0, 300),
      nextStepDue: req.body.nextStepDue || null,
      probability: req.body.probability != null && req.body.probability !== ''
        ? Number(req.body.probability)
        : null,
      lostReason: String(req.body.lostReason || '').slice(0, 300),
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    attachIndustryMetadata(created, req.body)
    created.recommendedSolutionIds = industryRecommendedSolutions(created.industrySlug)
    await created.save()
    await created.populate('ownerId', 'name')
    await created.populate('accountId', 'name')
    await created.populate('contactId', 'firstName lastName')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create opportunity.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const existing = await Opportunity.findOne({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!existing) return res.status(404).json({ success: false, message: 'Opportunity not found.' })

    const patch = { ...req.body }
    if (req.body.accountId !== undefined) {
      let accountId = toObjectId(req.body.accountId)
      if (accountId) {
        const account = await Account.findOne({ _id: accountId, ...workspaceFilter(req.user) }).select('_id')
        if (!account) return res.status(400).json({ success: false, message: 'Account not found.' })
        accountId = account._id
      }
      patch.accountId = accountId
    }
    if (req.body.contactId !== undefined) patch.contactId = toObjectId(req.body.contactId)
    if (req.body.products) {
      patch.products = normalizeProducts(req.body.products)
      patch.amount = amountFromProducts(patch.products)
    }
    if (req.body.closeDate !== undefined) patch.closeDate = req.body.closeDate || null
    if (req.body.nextStepDue !== undefined) patch.nextStepDue = req.body.nextStepDue || null
    if (req.body.probability !== undefined) {
      patch.probability = req.body.probability === null || req.body.probability === ''
        ? null
        : Number(req.body.probability)
    }

    const previousStage = existing.stage
    Object.assign(existing, patch)
    attachIndustryMetadata(existing, req.body)
    if (existing.industrySlug && (!Array.isArray(existing.recommendedSolutionIds) || !existing.recommendedSolutionIds.length)) {
      existing.recommendedSolutionIds = industryRecommendedSolutions(existing.industrySlug)
    }
    const stageChanged = patch.stage && patch.stage !== previousStage
    if (stageChanged) {
      const { nextBestActionForStage } = require('../services/industryScoring')
      const action = nextBestActionForStage(existing.stage)
      if (!existing.nextStep || existing.nextStep === nextBestActionForStage(previousStage).action) {
        existing.nextStep = action.action
      }
    }
    await existing.save()
    if (stageChanged) {
      const Task = require('../models/Task')
      const { nextBestActionForStage } = require('../services/industryScoring')
      const action = nextBestActionForStage(existing.stage)
      await Task.create({
        workspaceId: req.user.workspaceId,
        ownerId: req.user._id,
        subject: action.action,
        status: 'Not Started',
        priority: 'Normal',
        relatedType: 'Opportunity',
        relatedId: existing._id,
        description: `Suggested after stage change to ${existing.stage}.`,
      }).catch(() => null)
    }
    await existing.populate('ownerId', 'name')
    await existing.populate('accountId', 'name')
    await existing.populate('contactId', 'firstName lastName')
    res.json({ success: true, data: serialize(existing) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update opportunity.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Opportunity.findOneAndDelete({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!deleted) return res.status(404).json({ success: false, message: 'Opportunity not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete opportunity.' })
  }
})

router.post('/:id/recommendations/accept', async (req, res) => {
  try {
    const solutionId = String(req.body.solutionId || '').trim()
    if (!solutionId) return res.status(400).json({ success: false, message: 'solutionId is required.' })
    const existing = await Opportunity.findOne({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!existing) return res.status(404).json({ success: false, message: 'Opportunity not found.' })
    existing.selectedSolutionIds = Array.from(new Set([...(existing.selectedSolutionIds || []), solutionId]))
    existing.rejectedSolutionIds = (existing.rejectedSolutionIds || []).filter((id) => id !== solutionId)
    if (!existing.products.some((line) => line.solutionId === solutionId)) {
      existing.products.push({
        productId: null,
        productName: solutionId,
        solutionId,
        quantity: 1,
        unitPrice: 0,
      })
    }
    await existing.save()
    res.json({ success: true, data: serialize(existing) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to accept recommendation.' })
  }
})

router.post('/:id/recommendations/reject', async (req, res) => {
  try {
    const solutionId = String(req.body.solutionId || '').trim()
    if (!solutionId) return res.status(400).json({ success: false, message: 'solutionId is required.' })
    const existing = await Opportunity.findOne({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!existing) return res.status(404).json({ success: false, message: 'Opportunity not found.' })
    existing.rejectedSolutionIds = Array.from(new Set([...(existing.rejectedSolutionIds || []), solutionId]))
    existing.selectedSolutionIds = (existing.selectedSolutionIds || []).filter((id) => id !== solutionId)
    await existing.save()
    res.json({ success: true, data: serialize(existing) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to reject recommendation.' })
  }
})

router.post('/:id/qualify', async (req, res) => {
  try {
    const { getIndustry } = require('../services/industryCatalog')
    const { qualificationResult } = require('../services/duplicateDetect')
    const { nextBestActionForStage } = require('../services/industryScoring')
    const existing = await Opportunity.findOne({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!existing) return res.status(404).json({ success: false, message: 'Opportunity not found.' })
    const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {}
    const industry = getIndustry(existing.industrySlug)
    const questions = industry?.qualificationQuestions || []
    existing.qualificationAnswers = answers
    existing.qualificationResult = qualificationResult(answers, questions)
    if (!existing.nextStep) {
      existing.nextStep = nextBestActionForStage(existing.stage).action
    }
    await existing.save()
    res.json({ success: true, data: serialize(existing) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save qualification.' })
  }
})

router.get('/:id/next-action', async (req, res) => {
  try {
    const { nextBestActionForStage } = require('../services/industryScoring')
    const existing = await Opportunity.findOne({ _id: req.params.id, ...workspaceFilter(req.user) }).lean()
    if (!existing) return res.status(404).json({ success: false, message: 'Opportunity not found.' })
    const action = nextBestActionForStage(existing.stage)
    const Task = require('../models/Task')
    const suggestedTask = {
      subject: action.action,
      status: 'Not Started',
      priority: 'Normal',
      relatedType: 'Opportunity',
      relatedId: existing._id,
    }
    res.json({ success: true, data: { nextBestAction: action, suggestedTask } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to get next action.' })
  }
})

module.exports = router
