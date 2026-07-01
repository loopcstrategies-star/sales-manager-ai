const jwt = require('jsonwebtoken')
const User = require('../models/User')

async function protect(req, res, next) {
  try {
    const header = String(req.headers.authorization || '')
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) {
      return res.status(401).json({ success: false, message: 'Please log in.' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    const user = await User.findById(decoded.id)
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid session.' })
    }

    req.user = user
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired session.' })
  }
}

module.exports = { protect }
