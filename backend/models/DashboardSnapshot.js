const mongoose = require('mongoose')

const dashboardCardSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  summary: { type: String, required: true },
  category: { type: String, enum: ['metals', 'general'], required: true },
  type: { type: String, enum: ['headline', 'analysis'], default: 'analysis' },
  sourceUrl: { type: String, default: '' },
  sourceName: { type: String, default: '' },
  publishedAt: { type: Date },
  tags: { type: [String], default: [] },
  imageUrl: { type: String, default: '' },
}, { _id: false })

const priceTileSchema = new mongoose.Schema({
  metal: { type: String, required: true },
  symbol: { type: String, default: '' },
  price: { type: Number },
  changePct: { type: Number },
  currency: { type: String, default: 'USD' },
  unit: { type: String, default: 'oz' },
}, { _id: false })

const dashboardSnapshotSchema = new mongoose.Schema({
  scope: { type: String, required: true, unique: true, default: 'global' },
  region: { type: String, default: '' },
  cards: { type: [dashboardCardSchema], default: [] },
  priceTiles: { type: [priceTileSchema], default: [] },
  refreshedAt: { type: Date, required: true },
  searchProvider: { type: String, default: 'tavily' },
  meta: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true })

module.exports = mongoose.model('DashboardSnapshot', dashboardSnapshotSchema)
