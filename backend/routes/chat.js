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
    surface: Joi.string().valid('sales-copilot', 'chat', '').optional(),
    recordContext: Joi.string().max(300).allow('').optional(),
  }).optional(),
  sessionId: Joi.string().optional().allow(null, ''),
})

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

async function persistSession(user, body, result) {
  let session = null
  if (body.sessionId) {
    session = await ChatSession.findOne({ _id: body.sessionId, userId: user._id })
  }
  if (!session) {
    session = await ChatSession.create({
      userId: user._id,
      workspaceId: user.workspaceId,
      title: String(body.message).slice(0, 80),
      messages: [],
    })
  }
  session.messages.push(
    { role: 'user', content: body.message },
    { role: 'assistant', content: result.reply, meta: result.meta },
  )
  await session.save()
  return session
}

async function streamReplyChunks(res, writeEvent, reply) {
  const text = String(reply || '')
  const chunkSize = 24
  for (let i = 0; i < text.length; i += chunkSize) {
    writeEvent('delta', { text: text.slice(i, i + chunkSize) })
    // eslint-disable-next-line no-await-in-loop
    await sleep(12)
  }
}

router.post('/', chatLimiter, validateBody(chatSchema), async (req, res) => {
  try {
    const result = await runSalesAiChat({
      user: req.user,
      message: req.body.message,
      history: req.body.history || [],
      chatInputs: req.body.chatInputs || {},
    })

    const session = await persistSession(req.user, req.body, result)

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

router.post('/stream', chatLimiter, validateBody(chatSchema), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  const writeEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    writeEvent('status', { status: 'Working…' })
    const result = await runSalesAiChat({
      user: req.user,
      message: req.body.message,
      history: req.body.history || [],
      chatInputs: req.body.chatInputs || {},
    })

    writeEvent('status', {
      status: result.meta?.status || (result.meta?.fastPath ? 'Done' : 'Streaming answer…'),
      meta: {
        fastPath: Boolean(result.meta?.fastPath),
        crmMode: Boolean(result.meta?.crmMode),
      },
    })

    await streamReplyChunks(res, writeEvent, result.reply)

    const session = await persistSession(req.user, req.body, result)

    writeEvent('done', {
      success: true,
      sessionId: session._id,
      reply: result.reply,
      sections: result.sections,
      meta: result.meta,
    })
    res.end()
  } catch (err) {
    console.error('[chat/stream] error:', err)
    writeEvent('error', { message: err.message || 'Chat failed.' })
    res.end()
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

router.get('/sessions/:id', async (req, res) => {
  const session = await ChatSession.findOne({
    _id: req.params.id,
    userId: req.user._id,
  }).lean()

  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found.' })
  }

  res.json({
    success: true,
    session: {
      id: session._id,
      title: session.title,
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
      messages: (session.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        sections: m.meta?.sections,
      })),
    },
  })
})

module.exports = router
