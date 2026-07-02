const express = require('express')
const { protect } = require('../middleware/auth')
const { getSalesAiConfig } = require('../services/orchestrator')

const router = express.Router()

router.get('/', protect, (_req, res) => {
  res.json({
    success: true,
    ...getSalesAiConfig(),
  })
})

module.exports = router
