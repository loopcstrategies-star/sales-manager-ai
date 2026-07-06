const express = require('express')
const cors = require('cors')
const authRoutes = require('./routes/auth')
const chatRoutes = require('./routes/chat')
const configRoutes = require('./routes/config')
const dashboardRoutes = require('./routes/dashboard')
const settingsRoutes = require('./routes/settings')

function createApp() {
  const app = express()

  if (
    process.env.TRUST_PROXY === 'true'
    || process.env.RAILWAY_ENVIRONMENT
    || process.env.NODE_ENV === 'production'
  ) {
    app.set('trust proxy', 1)
  }

  const corsOrigin = String(process.env.CORS_ORIGIN || 'http://localhost:5173')
  app.use(cors({
    origin: corsOrigin.split(',').map((o) => o.trim()).filter(Boolean),
    credentials: true,
  }))
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_req, res) => {
    const mongoose = require('mongoose')
    const dbReady = mongoose.connection.readyState === 1
    res.status(200).json({
      success: true,
      service: 'sales-manager-ai',
      ready: dbReady,
      db: dbReady ? 'connected' : 'pending',
    })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/config', configRoutes)
  app.use('/api/chat', chatRoutes)
  app.use('/api/dashboard', dashboardRoutes)
  app.use('/api/settings', settingsRoutes)

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
