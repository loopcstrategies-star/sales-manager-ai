const mongoose = require('mongoose')

const digestSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  day: { type: Date, required: true },
  summary: { type: String, default: '', maxlength: 8000 },
  facts: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true })

digestSchema.index({ workspaceId: 1, ownerId: 1, day: 1 }, { unique: true })

module.exports = mongoose.model('Digest', digestSchema)
