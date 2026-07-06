const mongoose = require('mongoose')

const dashboardPrefsSchema = new mongoose.Schema({
  showPriceTiles: { type: Boolean, default: true },
  showTicker: { type: Boolean, default: true },
  showHeadlinesRow: { type: Boolean, default: true },
  showHero: { type: Boolean, default: true },
  showImages: { type: Boolean, default: true },
  compactCards: { type: Boolean, default: false },
  defaultRegion: { type: String, default: '' },
  sections: {
    metals: { type: Boolean, default: true },
    general: { type: Boolean, default: true },
  },
  topicFilter: { type: String, default: 'all' },
  customTopics: { type: [String], default: [] },
  sortOrder: { type: String, enum: ['headlines', 'newest'], default: 'headlines' },
  pollMinutes: { type: Number, enum: [1, 5, 10, 15], default: 5 },
}, { _id: false })

const userPreferencesSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  dashboard: { type: dashboardPrefsSchema, default: () => ({}) },
}, { timestamps: true })

module.exports = mongoose.model('UserPreferences', userPreferencesSchema)
