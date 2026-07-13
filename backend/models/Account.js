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

const accountSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  website: { type: String, trim: true, default: '', maxlength: 300 },
  type: { type: String, trim: true, default: '', maxlength: 80 },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
  parentAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  phone: { type: String, trim: true, default: '', maxlength: 60 },
  billingAddress: { type: addressSchema, default: () => ({}) },
  shippingAddress: { type: addressSchema, default: () => ({}) },
  customFields: { type: [customFieldSchema], default: [] },
}, { timestamps: true })

accountSchema.index({ workspaceId: 1, name: 1 })

module.exports = mongoose.model('Account', accountSchema)
