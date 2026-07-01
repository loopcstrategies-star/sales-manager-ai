const express = require('express')
const rateLimit = require('express-rate-limit')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const { runSalesAiChat } = require('../services/orchestrator')
const ChatSession = require('../models/ChatSession')

const router = express.Router()
router.use(protect)

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.CHAT_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
})

const chatSchema = Joi.object({
  message: Joi.string().trim().min(1).max(4000).required(),
  history: Joi.array().items(Joi.object({
    role: Joi.string().valid('user', 'assistant').required(),
    content: Joi.string().max(8000).required(),
  })).max(12).optional(),
  chatInputs: Joi.object({
    region: Joi.string().max(40).allow('').optional(),
    constraints: Joi.string().max(500).allow('').optional(),
    depth: Joi.string().valid('deep', '').optional(),
  }).optional(),
  sessionId: Joi.string().optional().allow(null, ''),
})

router.post('/', chatLimiter, validateBody(chatSchema), async (req, res) => {
  try {
    const result = await runSalesAiChat({
      user: req.user,
      message: req.body.message,
      history: req.body.history || [],
      chatInputs: req.body.chatInputs || {},
    })

    let session = null
    if (req.body.sessionId) {
      session = await ChatSession.findOne({ _id: req.body.sessionId, userId: req.user._id })
    }
    if (!session) {
      session = await ChatSession.create({
        userId: req.user._id,
        workspaceId: req.user.workspaceId,
        title: String(req.body.message).slice(0, 80),
        messages: [],
      })
    }

    session.messages.push(
      { role: 'user', content: req.body.message },
      { role: 'assistant', content: result.reply, meta: result.meta },
    )
    await session.save()

    res.json({
      success: true,
      sessionId: session._id,
      reply: result.reply,
      sections: result.sections,
      meta: result.meta,
    })
  } catch (err) {
    console.error('[chat] error:', err)
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Chat failed.',
    })
  }
})

router.get('/sessions', async (req, res) => {
  const sessions = await ChatSession.find({ userId: req.user._id })
    .sort({ updatedAt: -1 })
    .limit(20)
    .select('title updatedAt createdAt messages')
    .lean()
  res.json({
    success: true,
    sessions: sessions.map((s) => ({
      id: s._id,
      title: s.title,
      updatedAt: s.updatedAt,
      messageCount: (s.messages || []).length,
    })),
  })
})

module.exports = router
