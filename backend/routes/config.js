const express = require('express')
const { protect } = require('../middleware/auth')
const { getSalesAiConfig } = require('../services/orchestrator')
const Workspace = require('../models/Workspace')

const router = express.Router()

router.get('/', protect, async (req, res) => {
  const config = getSalesAiConfig()
  const workspace = req.user.workspaceId
    ? await Workspace.findById(req.user.workspaceId).lean()
    : null
  const loopcConnected = Boolean(workspace?.loopcConnection?.apiKey && workspace?.loopcConnection?.tenant)

  res.json({
    success: true,
    ...config,
    loopc: {
      connected: loopcConnected,
      tenant: workspace?.loopcConnection?.tenant || '',
      connectUrl: loopcConnected ? null : '/settings',
    },
  })
})

module.exports = router
