require('dotenv').config()

const mongoose = require('mongoose')
const createApp = require('./app')

const PORT = Number(process.env.PORT) || 5100
const mongoUri = String(process.env.MONGO_URI || '').trim()

if (!mongoUri) {
  console.error('[startup] MONGO_URI is required')
  process.exit(1)
}

if (!process.env.JWT_SECRET) {
  console.error('[startup] JWT_SECRET is required')
  process.exit(1)
}

const app = createApp()

mongoose.connect(mongoUri)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Sales Manager AI API listening on :${PORT}`)
    })
  })
  .catch((err) => {
    console.error('[startup] Mongo connect failed:', err.message)
    process.exit(1)
  })
