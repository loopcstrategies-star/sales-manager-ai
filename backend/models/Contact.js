const mongoose = require('mongoose')

const customFieldSchema = new mongoose.Schema({
  label: { type: String, trim: true, maxlength: 80 },
  value: { type: String, trim: true, maxlength: 500 },
}, { _id: false })

const addressSchema = new mongoose.Schema({
  country: { type: String, trim: true, default: '' },
  street: { type: String, trim: true, default: '' },
  city: { type: String, trim: true, default: '' },
  zip: { type: String, trim: true, default: '' },
  state: { type: String, trim: true, default: '' },
}, { _id: false })

const contactSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  salutation: { type: String, trim: true, default: '', maxlength: 40 },
  firstName: { type: String, trim: true, default: '', maxlength: 100 },
  lastName: { type: String, required: true, trim: true, maxlength: 100 },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  industryId: { type: String, trim: true, default: '', maxlength: 80, index: true },
  industrySlug: { type: String, trim: true, default: '', maxlength: 80, index: true },
  businessType: { type: String, trim: true, default: '', maxlength: 120 },
  title: { type: String, trim: true, default: '', maxlength: 120 },
  reportsToId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
  phone: { type: String, trim: true, default: '', maxlength: 60 },
  email: { type: String, trim: true, default: '', lowercase: true, maxlength: 200 },
  mailingAddress: { type: addressSchema, default: () => ({}) },
  emailOptOut: { type: Boolean, default: false },
  photoUrl: { type: String, trim: true, default: '', maxlength: 500 },
  customFields: { type: [customFieldSchema], default: [] },
  lastEnrichedAt: { type: Date, default: null },
  /** How this contact entered CRM: manual | csv | web_llm | hunter */
  source: {
    type: String,
    trim: true,
    enum: ['manual', 'csv', 'web_llm', 'hunter'],
    default: 'manual',
    maxlength: 20,
  },
  /** User should verify email/phone before outreach */
  needsVerify: { type: Boolean, default: false },
  verificationStatus: {
    type: String,
    trim: true,
    enum: ['verified', 'unverified', 'likely'],
    default: 'unverified',
    maxlength: 20,
  },
  sourceUrl: { type: String, trim: true, default: '', maxlength: 500 },
  researchConfidence: { type: Number, default: 0, min: 0, max: 100 },
  researchedAt: { type: Date, default: null },
}, { timestamps: true })

contactSchema.index({ workspaceId: 1, lastName: 1, firstName: 1 })
contactSchema.index({ workspaceId: 1, email: 1 })
contactSchema.index({ workspaceId: 1, needsVerify: 1 })
contactSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.lastName].filter(Boolean).join(' ').trim()
})
contactSchema.set('toJSON', { virtuals: true })
contactSchema.set('toObject', { virtuals: true })

module.exports = mongoose.model('Contact', contactSchema)
