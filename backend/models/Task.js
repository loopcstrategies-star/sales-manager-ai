const mongoose = require('mongoose')

const taskSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subject: { type: String, required: true, trim: true, maxlength: 200 },
  status: {
    type: String,
    enum: ['Not Started', 'In Progress', 'Completed', 'Waiting', 'Deferred'],
    default: 'Not Started',
  },
  priority: {
    type: String,
    enum: ['Low', 'Normal', 'High'],
    default: 'Normal',
  },
  dueDate: { type: Date, default: null },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
  relatedType: {
    type: String,
    enum: ['Lead', 'Contact', 'Account', 'Opportunity', 'Case', ''],
    default: '',
  },
  relatedId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
}, { timestamps: true })

taskSchema.index({ workspaceId: 1, relatedType: 1, relatedId: 1 })
taskSchema.index({ workspaceId: 1, dueDate: 1 })

module.exports = mongoose.model('Task', taskSchema)
