const mongoose = require('mongoose')

const priceBookSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
  active: { type: Boolean, default: true },
}, { timestamps: true })

priceBookSchema.index({ workspaceId: 1, name: 1 })

module.exports = mongoose.model('PriceBook', priceBookSchema)
