const mongoose = require('mongoose')

const leadSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  firstName: { type: String, trim: true, default: '', maxlength: 100 },
  lastName: { type: String, required: true, trim: true, maxlength: 100 },
  company: { type: String, trim: true, default: '', maxlength: 200 },
  title: { type: String, trim: true, default: '', maxlength: 120 },
  phone: { type: String, trim: true, default: '', maxlength: 60 },
  email: { type: String, trim: true, default: '', lowercase: true, maxlength: 200 },
  status: {
    type: String,
    enum: ['Open', 'Working', 'Qualified', 'Unqualified'],
    default: 'Open',
  },
  state: { type: String, trim: true, default: '', maxlength: 100 },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
}, { timestamps: true })

leadSchema.index({ workspaceId: 1, company: 1 })
leadSchema.index({ workspaceId: 1, status: 1 })
leadSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.lastName].filter(Boolean).join(' ').trim()
})
leadSchema.set('toJSON', { virtuals: true })
leadSchema.set('toObject', { virtuals: true })

module.exports = mongoose.model('Lead', leadSchema)
