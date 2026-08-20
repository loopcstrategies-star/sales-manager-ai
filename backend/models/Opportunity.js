const mongoose = require('mongoose')

const opportunityLineSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  productName: { type: String, trim: true, default: '', maxlength: 200 },
  solutionId: { type: String, trim: true, default: '', maxlength: 80 },
  quantity: { type: Number, default: 1, min: 0 },
  unitPrice: { type: Number, default: 0, min: 0 },
}, { _id: true })

const opportunitySchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
  industryId: { type: String, trim: true, default: '', maxlength: 80, index: true },
  industrySlug: { type: String, trim: true, default: '', maxlength: 80, index: true },
  businessType: { type: String, trim: true, default: '', maxlength: 120 },
  amount: { type: Number, default: 0, min: 0 },
  stage: {
    type: String,
    enum: ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'],
    default: 'Prospecting',
  },
  closeDate: { type: Date, default: null },
  nextStep: { type: String, trim: true, default: '', maxlength: 300 },
  nextStepDue: { type: Date, default: null },
  /** Override win probability 0–100; null = use stage default */
  probability: { type: Number, default: null, min: 0, max: 100 },
  lostReason: { type: String, trim: true, default: '', maxlength: 300 },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
  score: { type: Number, default: null, min: 0, max: 100 },
  scoreGrade: { type: String, trim: true, default: '', maxlength: 8 },
  scoreReasons: { type: [String], default: [] },
  strongestOpportunities: { type: [String], default: [] },
  missingInformation: { type: [String], default: [] },
  recommendedSolutionIds: { type: [String], default: [] },
  products: { type: [opportunityLineSchema], default: [] },
}, { timestamps: true })

opportunitySchema.index({ workspaceId: 1, stage: 1 })

module.exports = mongoose.model('Opportunity', opportunitySchema)
