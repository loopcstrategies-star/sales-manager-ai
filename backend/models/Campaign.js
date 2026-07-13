const mongoose = require('mongoose')

const campaignSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  status: {
    type: String,
    enum: ['Planned', 'In Progress', 'Completed', 'Aborted'],
    default: 'Planned',
  },
  type: {
    type: String,
    enum: ['Email', 'Event', 'Social', 'Webinar', 'Other'],
    default: 'Email',
  },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
}, { timestamps: true })

campaignSchema.index({ workspaceId: 1, status: 1 })

module.exports = mongoose.model('Campaign', campaignSchema)
