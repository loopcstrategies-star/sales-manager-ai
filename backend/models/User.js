const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true })

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(String(plain || ''), this.passwordHash)
}

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(String(plain || ''), 12)
}

module.exports = mongoose.model('User', userSchema)
