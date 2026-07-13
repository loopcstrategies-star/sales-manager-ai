const mongoose = require('mongoose')

const caseSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  caseNumber: { type: String, trim: true, maxlength: 20 },
  subject: { type: String, required: true, trim: true, maxlength: 300 },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  status: {
    type: String,
    enum: ['New', 'Working', 'Escalated', 'Closed'],
    default: 'New',
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium',
  },
  caseOrigin: { type: String, trim: true, default: '', maxlength: 40 },
  sendNotificationEmail: { type: Boolean, default: false },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
}, { timestamps: true })

caseSchema.index({ workspaceId: 1, status: 1 })
caseSchema.index({ workspaceId: 1, caseNumber: 1 }, { unique: true, sparse: true })

module.exports = mongoose.model('Case', caseSchema)
