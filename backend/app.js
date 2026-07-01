const express = require('express')
const cors = require('cors')
const authRoutes = require('./routes/auth')
const chatRoutes = require('./routes/chat')
const configRoutes = require('./routes/config')
const integrationRoutes = require('./routes/integrations')

function createApp() {
  const app = express()

  const corsOrigin = String(process.env.CORS_ORIGIN || 'http://localhost:5173')
  app.use(cors({
    origin: corsOrigin.split(',').map((o) => o.trim()).filter(Boolean),
    credentials: true,
  }))
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, service: 'sales-manager-ai', ready: true })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/config', configRoutes)
  app.use('/api/chat', chatRoutes)
  app.use('/api/integrations', integrationRoutes)

  app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` })
  })

  app.use((err, _req, res, _next) => {
    console.error('[api] error:', err)
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Internal server error',
    })
  })

  return app
}

module.exports = createApp
