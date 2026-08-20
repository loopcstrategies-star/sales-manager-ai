const mongoose = require('mongoose')

const proposalLineSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  solutionId: { type: String, trim: true, default: '', maxlength: 80 },
  packageId: { type: String, trim: true, default: '', maxlength: 80 },
  name: { type: String, trim: true, default: '', maxlength: 200 },
  quantity: { type: Number, default: 1, min: 0 },
  unitPrice: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
}, { _id: true })

const proposalSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Viewed', 'Negotiation', 'Accepted', 'Rejected', 'Expired'],
    default: 'Draft',
    index: true,
  },
  lines: { type: [proposalLineSchema], default: [] },
  subtotal: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  total: { type: Number, default: 0, min: 0 },
  currency: { type: String, trim: true, default: 'USD', maxlength: 8 },
  validityDate: { type: Date, default: null },
  paymentTerms: { type: String, trim: true, default: '', maxlength: 500 },
  notes: { type: String, trim: true, default: '', maxlength: 5000 },
}, { timestamps: true })

proposalSchema.index({ workspaceId: 1, opportunityId: 1 })

module.exports = mongoose.model('Proposal', proposalSchema)
