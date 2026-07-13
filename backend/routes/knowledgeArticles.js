const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const KnowledgeArticle = require('../models/KnowledgeArticle')
const {
  workspaceFilter,
  escapeRegex,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  title: Joi.string().trim().min(1).max(300).required(),
  urlName: Joi.string().trim().min(1).max(300).required(),
  body: Joi.string().allow('').max(50000),
  summary: Joi.string().allow('').max(500),
  publicationStatus: Joi.string().valid('Draft', 'Published'),
  validationStatus: Joi.string().valid('Not Validated', 'Validated'),
  visibleInternal: Joi.boolean(),
  visibleCustomer: Joi.boolean(),
})

function serialize(doc) {
  const obj = doc.toObject ? doc.toObject() : doc
  const owner = obj.ownerId && typeof obj.ownerId === 'object' ? obj.ownerId : null
  return {
    ...obj,
    articleNumber: obj.articleNumber || '',
    ownerId: owner?._id || obj.ownerId,
    ownerName: owner?.name || '',
    ownerAlias: ownerAlias(owner),
  }
}

async function nextArticleNumber(workspaceId) {
  const latest = await KnowledgeArticle.findOne({
    workspaceId,
    articleNumber: { $exists: true, $ne: '' },
  })
    .sort({ articleNumber: -1 })
    .select('articleNumber')
    .lean()
  const current = latest?.articleNumber ? parseInt(latest.articleNumber, 10) : 1000
  const next = Number.isFinite(current) ? current + 1 : 1001
  return String(Math.max(next, 1001)).padStart(8, '0')
}

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const filter = { ...workspaceFilter(req.user) }
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' }
      filter.$or = [
        { title: regex },
        { urlName: regex },
        { summary: regex },
        { articleNumber: regex },
      ]
    }

    const items = await KnowledgeArticle.find(filter)
      .populate('ownerId', 'name')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()

    res.json({ success: true, data: items.map(serialize), count: items.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list knowledge articles.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    const publicationStatus = req.body.publicationStatus || 'Draft'
    const articleNumber = await nextArticleNumber(req.user.workspaceId)
    const created = await KnowledgeArticle.create({
      title: req.body.title,
      urlName: req.body.urlName,
      body: req.body.body || '',
      summary: req.body.summary || String(req.body.body || '').slice(0, 160),
      publicationStatus,
      validationStatus: req.body.validationStatus || 'Not Validated',
      visibleInternal: req.body.visibleInternal !== false,
      visibleCustomer: Boolean(req.body.visibleCustomer),
      publishedAt: publicationStatus === 'Published' ? new Date() : null,
      articleNumber,
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    res.status(201).json({ success: true, data: serialize(created) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create knowledge article.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const existing = await KnowledgeArticle.findOne({
      _id: req.params.id,
      ...workspaceFilter(req.user),
    })
    if (!existing) return res.status(404).json({ success: false, message: 'Knowledge article not found.' })

    const publicationStatus = req.body.publicationStatus || existing.publicationStatus
    const publishedAt = publicationStatus === 'Published'
      ? (existing.publishedAt || new Date())
      : null

    existing.title = req.body.title
    existing.urlName = req.body.urlName
    existing.body = req.body.body || ''
    existing.summary = req.body.summary || String(req.body.body || '').slice(0, 160)
    existing.publicationStatus = publicationStatus
    existing.validationStatus = req.body.validationStatus || existing.validationStatus
    existing.visibleInternal = req.body.visibleInternal !== false
    existing.visibleCustomer = Boolean(req.body.visibleCustomer)
    existing.publishedAt = publishedAt
    await existing.save()
    await existing.populate('ownerId', 'name')
    res.json({ success: true, data: serialize(existing) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update knowledge article.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await KnowledgeArticle.findOneAndDelete({
      _id: req.params.id,
      ...workspaceFilter(req.user),
    })
    if (!deleted) return res.status(404).json({ success: false, message: 'Knowledge article not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete knowledge article.' })
  }
})

module.exports = router
