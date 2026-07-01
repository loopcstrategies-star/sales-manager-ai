const mongoose = require('mongoose')

const chatSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  title: { type: String, default: 'New chat' },
  messages: [{
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true })

module.exports = mongoose.model('ChatSession', chatSessionSchema)
