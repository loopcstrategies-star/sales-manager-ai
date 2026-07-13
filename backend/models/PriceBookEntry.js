const mongoose = require('mongoose')

const priceBookEntrySchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  priceBookId: { type: mongoose.Schema.Types.ObjectId, ref: 'PriceBook', required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  listPrice: { type: Number, required: true, min: 0, default: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true })

priceBookEntrySchema.index({ workspaceId: 1, priceBookId: 1, productId: 1 }, { unique: true })

module.exports = mongoose.model('PriceBookEntry', priceBookEntrySchema)
