require('dotenv').config()

const mongoose = require('mongoose')
const createApp = require('./app')

const PORT = Number(process.env.PORT) || 5100
const mongoUri = String(process.env.MONGO_URI || '').trim()

if (!process.env.JWT_SECRET) {
  console.error('[startup] JWT_SECRET is required')
  process.exit(1)
}

if (!mongoUri) {
  console.warn('[startup] MONGO_URI missing — API starts but DB routes will fail until configured')
}

const app = createApp()

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sales Manager AI API listening on :${PORT}`)
})

if (mongoUri) {
  mongoose.connect(mongoUri)
    .then(() => console.log('[startup] MongoDB connected'))
    .catch((err) => console.error('[startup] Mongo connect failed:', err.message))
}
