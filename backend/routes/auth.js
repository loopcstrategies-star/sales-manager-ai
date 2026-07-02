const express = require('express')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Workspace = require('../models/Workspace')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')

const router = express.Router()

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  )
}

function sendUser(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    workspaceId: user.workspaceId,
  }
}

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  name: Joi.string().trim().min(1).max(80).required(),
  workspaceName: Joi.string().trim().min(1).max(120).optional(),
})

router.post('/register', validateBody(registerSchema), async (req, res) => {
  try {
    const email = String(req.body.email).trim().toLowerCase()
    const existing = await User.findOne({ email })
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' })
    }

    const workspace = await Workspace.create({
      name: req.body.workspaceName || `${req.body.name}'s workspace`,
    })

    const user = await User.create({
      email,
      name: req.body.name,
      passwordHash: await User.hashPassword(req.body.password),
      workspaceId: workspace._id,
    })

    workspace.ownerId = user._id
    await workspace.save()

    const token = signToken(user)
    res.status(201).json({ success: true, token, user: sendUser(user) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Registration failed.' })
  }
})

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
})

router.post('/login', validateBody(loginSchema), async (req, res) => {
  try {
    const email = String(req.body.email).trim().toLowerCase()
    const user = await User.findOne({ email })
    if (!user || !(await user.comparePassword(req.body.password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' })
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account deactivated.' })
    }
    const token = signToken(user)
    res.json({ success: true, token, user: sendUser(user) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Login failed.' })
  }
})

router.get('/me', protect, async (req, res) => {
  const workspace = req.user.workspaceId
    ? await Workspace.findById(req.user.workspaceId).select('name').lean()
    : null
  res.json({
    success: true,
    user: sendUser(req.user),
    workspace: workspace ? {
      id: workspace._id,
      name: workspace.name,
    } : null,
  })
})

module.exports = router
