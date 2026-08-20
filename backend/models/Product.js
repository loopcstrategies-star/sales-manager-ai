const mongoose = require('mongoose')

const productSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  family: { type: String, trim: true, default: '', maxlength: 80 },
  solutionId: { type: String, trim: true, default: '', maxlength: 80, index: true },
  solutionCategory: { type: String, trim: true, default: '', maxlength: 80 },
  targetIndustries: { type: [String], default: [] },
  packageTags: { type: [String], default: [] },
  productCode: { type: String, trim: true, default: '', maxlength: 80 },
  sku: { type: String, trim: true, default: '', maxlength: 80 },
  active: { type: Boolean, default: true },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
}, { timestamps: true })

productSchema.index({ workspaceId: 1, name: 1 })

module.exports = mongoose.model('Product', productSchema)
