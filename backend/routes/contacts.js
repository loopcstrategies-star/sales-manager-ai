const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Contact = require('../models/Contact')
const Account = require('../models/Account')
const {
  workspaceFilter,
  escapeRegex,
  toObjectId,
  addressJoi,
  customFieldsJoi,
  ownerAlias,
} = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

const contactBodySchema = Joi.object({
  salutation: Joi.string().allow('').max(40),
  firstName: Joi.string().allow('').max(100),
  lastName: Joi.string().trim().min(1).max(100).required(),
  accountId: Joi.string().trim().min(1).required(),
  title: Joi.string().allow('').max(120),
  reportsToId: Joi.string().allow(null, ''),
  description: Joi.string().allow('').max(5000),
  phone: Joi.string().allow('').max(60),
  email: Joi.string().trim().allow('').max(200),
  mailingAddress: addressJoi(Joi),
  emailOptOut: Joi.boolean(),
  photoUrl: Joi.string().allow('').max(500),
  customFields: customFieldsJoi(Joi),
  source: Joi.string().valid('manual', 'csv', 'web_llm', 'hunter').optional(),
  needsVerify: Joi.boolean().optional(),
})

function serializeContact(doc) {
  const obj = doc.toObject ? doc.toObject({ virtuals: true }) : { ...doc }
  const owner = obj.ownerId && typeof obj.ownerId === 'object' ? obj.ownerId : null
  const account = obj.accountId && typeof obj.accountId === 'object' ? obj.accountId : null
  const reportsTo = obj.reportsToId && typeof obj.reportsToId === 'object' ? obj.reportsToId : null
  const fullName = obj.fullName
    || [obj.firstName, obj.lastName].filter(Boolean).join(' ').trim()
  return {
    ...obj,
    fullName,
    ownerId: owner?._id || obj.ownerId,
    ownerName: owner?.name || '',
    ownerAlias: ownerAlias(owner),
    accountId: account?._id || obj.accountId || null,
    accountName: account?.name || '',
    reportsToId: reportsTo?._id || obj.reportsToId || null,
    reportsToName: reportsTo
      ? [reportsTo.firstName, reportsTo.lastName].filter(Boolean).join(' ').trim()
      : '',
  }
}

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const needsVerify = String(req.query.needsVerify || '').trim()
    const source = String(req.query.source || '').trim()
    const filter = { ...workspaceFilter(req.user) }
    if (needsVerify === '1' || needsVerify === 'true') filter.needsVerify = true
    if (source) filter.source = source
    if (q) {
      filter.$or = [
        { firstName: { $regex: escapeRegex(q), $options: 'i' } },
        { lastName: { $regex: escapeRegex(q), $options: 'i' } },
        { email: { $regex: escapeRegex(q), $options: 'i' } },
        { title: { $regex: escapeRegex(q), $options: 'i' } },
      ]
    }

    const items = await Contact.find(filter)
      .populate('ownerId', 'name')
      .populate('accountId', 'name')
      .populate('reportsToId', 'firstName lastName')
      .sort({ lastName: 1, firstName: 1 })
      .limit(500)
      .lean()

    res.json({
      success: true,
      data: items.map((item) => serializeContact(item)),
      count: items.length,
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list contacts.' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const item = await Contact.findOne({ _id: req.params.id, ...workspaceFilter(req.user) })
      .populate('ownerId', 'name')
      .populate('accountId', 'name')
      .populate('reportsToId', 'firstName lastName')
    if (!item) return res.status(404).json({ success: false, message: 'Contact not found.' })
    res.json({ success: true, data: serializeContact(item) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load contact.' })
  }
})

async function assertAccountInWorkspace(accountId, user) {
  if (!accountId) {
    const err = new Error('Account is required.')
    err.statusCode = 400
    throw err
  }
  const account = await Account.findOne({ _id: accountId, ...workspaceFilter(user) }).select('_id')
  if (!account) {
    const err = new Error('Account not found in workspace.')
    err.statusCode = 400
    throw err
  }
  return account._id
}

router.post('/', validateBody(contactBodySchema), async (req, res) => {
  try {
    const accountId = await assertAccountInWorkspace(toObjectId(req.body.accountId), req.user)
    const reportsToId = toObjectId(req.body.reportsToId)
    const created = await Contact.create({
      ...req.body,
      accountId,
      reportsToId,
      source: req.body.source || 'manual',
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    await created.populate('ownerId', 'name')
    await created.populate('accountId', 'name')
    await created.populate('reportsToId', 'firstName lastName')
    res.status(201).json({ success: true, data: serializeContact(created) })
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to create contact.' })
  }
})

router.patch('/:id', validateBody(contactBodySchema), async (req, res) => {
  try {
    const accountId = await assertAccountInWorkspace(toObjectId(req.body.accountId), req.user)
    const updated = await Contact.findOneAndUpdate(
      { _id: req.params.id, ...workspaceFilter(req.user) },
      {
        ...req.body,
        accountId,
        reportsToId: toObjectId(req.body.reportsToId),
      },
      { new: true, runValidators: true }
    )
      .populate('ownerId', 'name')
      .populate('accountId', 'name')
      .populate('reportsToId', 'firstName lastName')
    if (!updated) return res.status(404).json({ success: false, message: 'Contact not found.' })
    res.json({ success: true, data: serializeContact(updated) })
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to update contact.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Contact.findOneAndDelete({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!deleted) return res.status(404).json({ success: false, message: 'Contact not found.' })
    res.json({ success: true, data: { id: deleted._id } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete contact.' })
  }
})

module.exports = router
