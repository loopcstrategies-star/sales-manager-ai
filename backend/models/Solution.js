const mongoose = require('mongoose')

const solutionSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  catalogKey: { type: String, trim: true, default: '', maxlength: 80, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, trim: true, default: '', maxlength: 120, index: true },
  category: { type: String, trim: true, default: 'other', maxlength: 80, index: true },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
  features: { type: [String], default: [] },
  industries: { type: [String], default: [] },
  businessTypes: { type: [String], default: [] },
  pricing: {
    amount: { type: Number, default: 0, min: 0 },
    cost: { type: Number, default: 0, min: 0 },
    currency: { type: String, trim: true, default: 'USD', maxlength: 8 },
    model: { type: String, trim: true, default: 'one-time', maxlength: 40 },
  },
  salesNotes: { type: String, trim: true, default: '', maxlength: 5000 },
  proposalTemplate: { type: String, trim: true, default: '', maxlength: 10000 },
  deliveryNotes: { type: String, trim: true, default: '', maxlength: 5000 },
  status: {
    type: String,
    enum: ['active', 'archived', 'draft'],
    default: 'active',
    index: true,
  },
}, { timestamps: true })

solutionSchema.index({ workspaceId: 1, name: 1 })
solutionSchema.index({ workspaceId: 1, catalogKey: 1 })

module.exports = mongoose.model('Solution', solutionSchema)
