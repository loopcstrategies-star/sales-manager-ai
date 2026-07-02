const mongoose = require('mongoose')

const searchCacheSchema = new mongoose.Schema({
  cacheKey: { type: String, required: true, unique: true, index: true },
  query: { type: String, required: true },
  provider: { type: String, required: true },
  searchDepth: { type: String, default: 'basic' },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true })

module.exports = mongoose.model('SearchCache', searchCacheSchema)
