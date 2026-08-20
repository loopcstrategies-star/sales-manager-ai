const mongoose = require('mongoose')

const solutionPackageSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  catalogKey: { type: String, trim: true, default: '', maxlength: 80, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
  industrySlug: { type: String, trim: true, default: '', maxlength: 80, index: true },
  solutionIds: { type: [String], default: [] },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  price: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0, max: 100 },
  currency: { type: String, trim: true, default: 'USD', maxlength: 8 },
  billingType: {
    type: String,
    enum: ['one-time', 'monthly', 'yearly', 'custom'],
    default: 'one-time',
  },
  validityDays: { type: Number, default: 30, min: 0 },
  status: {
    type: String,
    enum: ['active', 'archived', 'draft'],
    default: 'active',
    index: true,
  },
}, { timestamps: true })

solutionPackageSchema.index({ workspaceId: 1, name: 1 })

module.exports = mongoose.model('SolutionPackage', solutionPackageSchema)
