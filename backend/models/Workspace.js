const mongoose = require('mongoose')

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  loopcConnection: {
    tenant: { type: String, default: '' },
    apiKey: { type: String, default: '' },
    connectedAt: { type: Date },
    scopes: [{ type: String }],
  },
}, { timestamps: true })

module.exports = mongoose.model('Workspace', workspaceSchema)
