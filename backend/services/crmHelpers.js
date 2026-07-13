const mongoose = require('mongoose')

function workspaceFilter(user) {
  return { workspaceId: user.workspaceId }
}

function ownerAlias(user) {
  if (!user) return ''
  const parts = String(user.name || '').trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 8)
  return (parts[0][0] + parts[parts.length - 1].slice(0, 4)).toLowerCase()
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toObjectId(id) {
  if (!id) return null
  if (!mongoose.Types.ObjectId.isValid(id)) return null
  return new mongoose.Types.ObjectId(id)
}

const addressJoi = (Joi) => Joi.object({
  country: Joi.string().allow('').max(100),
  street: Joi.string().allow('').max(500),
  city: Joi.string().allow('').max(100),
  zip: Joi.string().allow('').max(40),
  state: Joi.string().allow('').max(100),
}).default({})

const customFieldsJoi = (Joi) => Joi.array().items(
  Joi.object({
    label: Joi.string().allow('').max(80),
    value: Joi.string().allow('').max(500),
  })
).max(30).default([])

module.exports = {
  workspaceFilter,
  ownerAlias,
  escapeRegex,
  toObjectId,
  addressJoi,
  customFieldsJoi,
}
