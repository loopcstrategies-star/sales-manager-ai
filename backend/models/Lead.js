const mongoose = require('mongoose')

const addressSchema = new mongoose.Schema({
  country: { type: String, trim: true, default: '' },
  street: { type: String, trim: true, default: '' },
  city: { type: String, trim: true, default: '' },
  zip: { type: String, trim: true, default: '' },
  state: { type: String, trim: true, default: '' },
}, { _id: false })

const leadSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  salutation: { type: String, trim: true, default: '', maxlength: 40 },
  firstName: { type: String, trim: true, default: '', maxlength: 100 },
  lastName: { type: String, required: true, trim: true, maxlength: 100 },
  company: { type: String, required: true, trim: true, maxlength: 200 },
  title: { type: String, trim: true, default: '', maxlength: 120 },
  website: { type: String, trim: true, default: '', maxlength: 300 },
  phone: { type: String, trim: true, default: '', maxlength: 60 },
  email: { type: String, trim: true, default: '', lowercase: true, maxlength: 200 },
  status: {
    type: String,
    enum: ['Open', 'Working', 'Qualified', 'Unqualified', 'Converted'],
    default: 'Open',
  },
  address: { type: addressSchema, default: () => ({}) },
  /** @deprecated Prefer address.state; kept for older documents */
  state: { type: String, trim: true, default: '', maxlength: 100 },
  emailOptOut: { type: Boolean, default: false },
  numberOfEmployees: { type: String, trim: true, default: '', maxlength: 40 },
  annualRevenue: { type: String, trim: true, default: '', maxlength: 60 },
  leadSource: { type: String, trim: true, default: '', maxlength: 80 },
  industry: { type: String, trim: true, default: '', maxlength: 80 },
  industryId: { type: String, trim: true, default: '', maxlength: 80, index: true },
  industrySlug: { type: String, trim: true, default: '', maxlength: 80, index: true },
  businessType: { type: String, trim: true, default: '', maxlength: 120 },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
  lastEnrichedAt: { type: Date, default: null },
  aiScore: { type: Number, default: null, min: 0, max: 100 },
  aiScoreReasons: { type: String, trim: true, default: '', maxlength: 500 },
  aiScoredAt: { type: Date, default: null },
  researchSummary: {
    verifiedData: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    inferredData: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    unknownData: { type: [String], default: [] },
    source: { type: String, trim: true, default: '', maxlength: 200 },
    confidence: { type: Number, default: 0, min: 0, max: 100 },
    researchedAt: { type: Date, default: null },
  },
  qualificationAnswers: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  qualificationResult: {
    type: String,
    enum: ['', 'Qualified', 'Potential', 'Needs Research', 'Low Priority'],
    default: '',
  },
  convertedAt: { type: Date, default: null },
  convertedAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  convertedContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
  convertedOpportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', default: null },
  /** Campaigns this lead belongs to */
  campaignIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: undefined }],
}, { timestamps: true })

leadSchema.index({ workspaceId: 1, company: 1 })
leadSchema.index({ workspaceId: 1, status: 1 })
leadSchema.index({ workspaceId: 1, campaignIds: 1 })
leadSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.lastName].filter(Boolean).join(' ').trim()
})
leadSchema.set('toJSON', { virtuals: true })
leadSchema.set('toObject', { virtuals: true })

module.exports = mongoose.model('Lead', leadSchema)
