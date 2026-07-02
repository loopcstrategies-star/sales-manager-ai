const mongoose = require('mongoose')

const dashboardCardSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  summary: { type: String, required: true },
  category: { type: String, enum: ['metals', 'general'], required: true },
  sourceUrl: { type: String, default: '' },
  sourceName: { type: String, default: '' },
}, { _id: false })

const dashboardSnapshotSchema = new mongoose.Schema({
  scope: { type: String, required: true, unique: true, default: 'global' },
  cards: { type: [dashboardCardSchema], default: [] },
  refreshedAt: { type: Date, required: true },
  searchProvider: { type: String, default: 'tavily' },
  meta: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true })

module.exports = mongoose.model('DashboardSnapshot', dashboardSnapshotSchema)
