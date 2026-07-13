const mongoose = require('mongoose')

const messagingSessionSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  channel: { type: String, trim: true, default: '', maxlength: 80 },
  messagingUser: { type: String, trim: true, default: '', maxlength: 120 },
  platformType: { type: String, trim: true, default: '', maxlength: 80 },
  status: {
    type: String,
    enum: ['New', 'Active', 'Ended'],
    default: 'New',
  },
  startTime: { type: Date, default: null },
  endTime: { type: Date, default: null },
}, { timestamps: true })

messagingSessionSchema.index({ workspaceId: 1, status: 1 })

module.exports = mongoose.model('MessagingSession', messagingSessionSchema)
