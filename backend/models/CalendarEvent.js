const mongoose = require('mongoose')

const calendarEventSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  allDay: { type: Boolean, default: false },
  description: { type: String, trim: true, default: '', maxlength: 5000 },
}, { timestamps: true })

calendarEventSchema.index({ workspaceId: 1, startAt: 1, endAt: 1 })

module.exports = mongoose.model('CalendarEvent', calendarEventSchema)
