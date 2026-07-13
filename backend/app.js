const path = require('path')
const express = require('express')
const cors = require('cors')
const authRoutes = require('./routes/auth')
const chatRoutes = require('./routes/chat')
const configRoutes = require('./routes/config')
const dashboardRoutes = require('./routes/dashboard')
const settingsRoutes = require('./routes/settings')
const accountsRoutes = require('./routes/accounts')
const contactsRoutes = require('./routes/contacts')
const opportunitiesRoutes = require('./routes/opportunities')
const casesRoutes = require('./routes/cases')
const campaignsRoutes = require('./routes/campaigns')
const leadsRoutes = require('./routes/leads')
const messagingSessionsRoutes = require('./routes/messagingSessions')
const knowledgeArticlesRoutes = require('./routes/knowledgeArticles')
const productsRoutes = require('./routes/products')
const priceBooksRoutes = require('./routes/priceBooks')
const calendarEventsRoutes = require('./routes/calendarEvents')
const uploadsRoutes = require('./routes/uploads')
const tasksRoutes = require('./routes/tasks')
const crmRoutes = require('./routes/crm')
const crmImportRoutes = require('./routes/crmImport')
const crmEnrichRoutes = require('./routes/crmEnrich')
const crmWebhooksRoutes = require('./routes/crmWebhooks')

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
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

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
  app.use('/api/accounts', accountsRoutes)
  app.use('/api/contacts', contactsRoutes)
  app.use('/api/opportunities', opportunitiesRoutes)
  app.use('/api/cases', casesRoutes)
  app.use('/api/campaigns', campaignsRoutes)
  app.use('/api/leads', leadsRoutes)
  app.use('/api/messaging-sessions', messagingSessionsRoutes)
  app.use('/api/knowledge-articles', knowledgeArticlesRoutes)
  app.use('/api/products', productsRoutes)
  app.use('/api/price-books', priceBooksRoutes)
  app.use('/api/calendar-events', calendarEventsRoutes)
  app.use('/api/tasks', tasksRoutes)
  app.use('/api/uploads', uploadsRoutes)
  app.use('/api/crm/webhooks', crmWebhooksRoutes)
  app.use('/api/crm', crmImportRoutes)
  app.use('/api/crm', crmEnrichRoutes)
  app.use('/api/crm', crmRoutes)

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
