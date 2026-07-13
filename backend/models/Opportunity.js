const mongoose = require('mongoose')

const opportunityLineSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  productName: { type: String, trim: true, default: '', maxlength: 200 },
  quantity: { type: Number, default: 1, min: 0 },
  unitPrice: { type: Number, default: 0, min: 0 },
}, { _id: true })

const opportunitySchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
  amount: { type: Number, default: 0, min: 0 },
  stage: {
    type: String,
    enum: ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'],
    default: 'Prospecting',
  },
  closeDate: { type: Date, default: null },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
  products: { type: [opportunityLineSchema], default: [] },
}, { timestamps: true })

opportunitySchema.index({ workspaceId: 1, stage: 1 })

module.exports = mongoose.model('Opportunity', opportunitySchema)
