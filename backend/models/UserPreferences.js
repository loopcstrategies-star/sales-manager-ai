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

const stageProbabilitiesSchema = new mongoose.Schema({
  Prospecting: { type: Number, min: 0, max: 100, default: 10 },
  Qualification: { type: Number, min: 0, max: 100, default: 25 },
  Proposal: { type: Number, min: 0, max: 100, default: 50 },
  Negotiation: { type: Number, min: 0, max: 100, default: 75 },
  'Closed Won': { type: Number, min: 0, max: 100, default: 100 },
  'Closed Lost': { type: Number, min: 0, max: 100, default: 0 },
}, { _id: false })

const salesPrefsSchema = new mongoose.Schema({
  emailTone: {
    type: String,
    enum: ['brief', 'professional', 'warm'],
    default: 'professional',
  },
  saveEmailAsTask: { type: Boolean, default: true },
  findContactsAutoSave: { type: Boolean, default: true },
  findContactsMax: { type: Number, min: 3, max: 15, default: 5 },
  findContactsNeedsVerify: { type: Boolean, default: true },
  batchFindCap: { type: Number, min: 10, max: 50, default: 25 },
  bulkQueries: { type: Number, min: 1, max: 8, default: 5 },
  perQuery: { type: Number, min: 1, max: 12, default: 8 },
  scheduledFindEnabled: { type: Boolean, default: false },
  scheduledFindHours: { type: Number, min: 6, max: 48, default: 24 },
  fillPipelineOnImport: { type: Boolean, default: true },
  defaultProspectRegion: { type: String, default: '', maxlength: 40 },
  convertCreateOpportunity: { type: Boolean, default: true },
  convertDefaultStage: {
    type: String,
    enum: ['Prospecting', 'Qualification', 'Proposal', 'Negotiation'],
    default: 'Prospecting',
  },
  enrichRefreshEnabled: { type: Boolean, default: true },
  enrichFillEmptyOnly: { type: Boolean, default: true },
  enrichStaleDays: { type: Number, min: 7, max: 90, default: 30 },
  autoTaskFromNextStep: { type: Boolean, default: true },
  stageProbabilities: { type: stageProbabilitiesSchema, default: () => ({}) },
}, { _id: false })

const userPreferencesSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  dashboard: { type: dashboardPrefsSchema, default: () => ({}) },
  sales: { type: salesPrefsSchema, default: () => ({}) },
}, { timestamps: true })

module.exports = mongoose.model('UserPreferences', userPreferencesSchema)
