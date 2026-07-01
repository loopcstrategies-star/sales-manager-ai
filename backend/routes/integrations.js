const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const Workspace = require('../models/Workspace')
const { testConnection } = require('../services/loopcConnector')

const router = express.Router()
router.use(protect)

const connectSchema = Joi.object({
  tenant: Joi.string().trim().min(2).max(40).default('loopc'),
  apiKey: Joi.string().trim().min(16).max(256).required(),
})

router.post('/loopc/connect', validateBody(connectSchema), async (req, res) => {
  try {
    if (!req.user.workspaceId) {
      return res.status(400).json({ success: false, message: 'No workspace found.' })
    }

    await testConnection(req.body.tenant, req.body.apiKey)

    const workspace = await Workspace.findById(req.user.workspaceId)
    workspace.loopcConnection = {
      tenant: req.body.tenant,
      apiKey: req.body.apiKey,
      connectedAt: new Date(),
      scopes: ['read:crm', 'read:inbox', 'read:metals'],
    }
    await workspace.save()

    res.json({
      success: true,
      message: 'LoopC Ops connected.',
      tenant: req.body.tenant,
    })
  } catch (err) {
    res.status(err.statusCode || 400).json({
      success: false,
      message: err.message || 'Could not connect to LoopC Ops.',
    })
  }
})

router.delete('/loopc/connect', async (req, res) => {
  if (!req.user.workspaceId) {
    return res.status(400).json({ success: false, message: 'No workspace found.' })
  }
  await Workspace.findByIdAndUpdate(req.user.workspaceId, {
    loopcConnection: { tenant: '', apiKey: '', connectedAt: null, scopes: [] },
  })
  res.json({ success: true, message: 'LoopC Ops disconnected.' })
})

module.exports = router
