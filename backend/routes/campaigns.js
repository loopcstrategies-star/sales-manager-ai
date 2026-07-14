const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Campaign = require('../models/Campaign')
const Lead = require('../models/Lead')
const {
  workspaceFilter,
  escapeRegex,
  toObjectId,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const bodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  status: Joi.string().valid('Planned', 'In Progress', 'Completed', 'Aborted'),
  type: Joi.string().valid('Email', 'Event', 'Social', 'Webinar', 'Other'),
  startDate: Joi.date().allow(null, ''),
  endDate: Joi.date().allow(null, ''),
  description: Joi.string().allow('').max(5000),
})

const membersSchema = Joi.object({
  leadIds: Joi.array().items(Joi.string().trim().min(1)).min(1).max(200).required(),
})

function serialize(doc, memberCount = 0) {
  const obj = doc.toObject ? doc.toObject() : doc
  const owner = obj.ownerId && typeof obj.ownerId === 'object' ? obj.ownerId : null
  return {
    ...obj,
    ownerId: owner?._id || obj.ownerId,
    ownerName: owner?.name || '',
    ownerAlias: ownerAlias(owner),
    memberCount,
  }
}

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const filter = { ...workspaceFilter(req.user) }
    if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' }

    const items = await Campaign.find(filter)
      .populate('ownerId', 'name')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()

    const counts = await Lead.aggregate([
      { $match: { ...workspaceFilter(req.user), campaignIds: { $exists: true, $ne: [] } } },
      { $unwind: '$campaignIds' },
      { $group: { _id: '$campaignIds', count: { $sum: 1 } } },
    ])
    const countById = Object.fromEntries(counts.map((c) => [String(c._id), c.count]))

    res.json({
      success: true,
      data: items.map((item) => serialize(item, countById[String(item._id)] || 0)),
      count: items.length,
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list campaigns.' })
  }
})

router.post('/', validateBody(bodySchema), async (req, res) => {
  try {
    const created = await Campaign.create({
      ...req.body,
      startDate: req.body.startDate || null,
      endDate: req.body.endDate || null,
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    res.status(201).json({ success: true, data: serialize(created, 0) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create campaign.' })
  }
})

router.post('/:id/members', validateBody(membersSchema), async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' })

    const leadIds = (req.body.leadIds || []).map((id) => toObjectId(id)).filter(Boolean)
    const result = await Lead.updateMany(
      { ...workspaceFilter(req.user), _id: { $in: leadIds } },
      { $addToSet: { campaignIds: campaign._id } },
    )

    const memberCount = await Lead.countDocuments({
      ...workspaceFilter(req.user),
      campaignIds: campaign._id,
    })

    res.json({
      success: true,
      data: {
        campaignId: campaign._id,
        matched: result.matchedCount || 0,
        modified: result.modifiedCount || 0,
        memberCount,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to add campaign members.' })
  }
})

router.get('/:id/members', async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, ...workspaceFilter(req.user) }).lean()
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' })

    const leads = await Lead.find({
      ...workspaceFilter(req.user),
      campaignIds: campaign._id,
    })
      .select('firstName lastName company email status')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()

    res.json({
      success: true,
      data: {
        campaign,
        leads: leads.map((l) => ({
          ...l,
          fullName: [l.firstName, l.lastName].filter(Boolean).join(' ').trim(),
        })),
        count: leads.length,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list members.' })
  }
})

router.patch('/:id', validateBody(bodySchema), async (req, res) => {
  try {
    const updated = await Campaign.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      {
        ...req.body,
        startDate: req.body.startDate || null,
        endDate: req.body.endDate || null,
      },
      { new: true, runValidators: true },
    ).populate('ownerId', 'name')
    if (!updated) return res.status(404).json({ success: false, message: 'Campaign not found.' })
    const memberCount = await Lead.countDocuments({
      ...workspaceFilter(req.user),
      campaignIds: updated._id,
    })
    res.json({ success: true, data: serialize(updated, memberCount) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update campaign.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Campaign.findOneAndDelete({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!deleted) return res.status(404).json({ success: false, message: 'Campaign not found.' })
    await Lead.updateMany(
      { ...workspaceFilter(req.user), campaignIds: deleted._id },
      { $pull: { campaignIds: deleted._id } },
    )
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete campaign.' })
  }
})

module.exports = router
