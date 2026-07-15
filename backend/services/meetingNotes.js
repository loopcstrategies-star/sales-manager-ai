const Opportunity = require('../models/Opportunity')
const Task = require('../models/Task')
const { toObjectId, workspaceFilter } = require('./crmHelpers')
const { createChatCompletion, isOpenAiConfigured } = require('./openAiClient')
const { extractJsonObject } = require('./emailDraft')

const MAX_NOTES = 8000
const MAX_TASKS = 5

function ruleFallback(notes) {
  const text = String(notes || '').trim()
  const firstPara = text.split(/\n\s*\n/)[0] || text
  const summary = firstPara.slice(0, 600) || 'Meeting notes captured.'
  return {
    summary,
    nextStep: 'Follow up on action items from the meeting.',
    tasks: [
      {
        subject: 'Follow up from meeting notes',
        dueInDays: 2,
        priority: 'High',
      },
    ],
  }
}

async function extractWithLlm(notes, opportunity) {
  const raw = await createChatCompletion(
    [
      {
        role: 'system',
        content: [
          'You turn sales meeting notes into CRM updates for jewelry/precious metals wholesale.',
          'Return ONLY JSON: {"summary":"2-4 sentences","nextStep":"one concrete next step max 200 chars","tasks":[{"subject":"","dueInDays":2,"priority":"Normal|High|Low"}]}',
          `Create at most ${MAX_TASKS} tasks. dueInDays is integer 0–14. Do not invent facts not in the notes.`,
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Opportunity: ${opportunity.name}`,
          `Stage: ${opportunity.stage || '—'}`,
          `Amount: ${opportunity.amount || 0}`,
          '',
          'Meeting notes / transcript:',
          String(notes).slice(0, MAX_NOTES),
        ].join('\n'),
      },
    ],
    { temperature: 0.2, maxTokens: 900, retryOnRateLimit: true, timeoutMs: 25000 },
  )
  const parsed = extractJsonObject(raw)
  if (!parsed?.summary) return null
  const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : []
  return {
    summary: String(parsed.summary || '').trim().slice(0, 2000),
    nextStep: String(parsed.nextStep || '').trim().slice(0, 300),
    tasks: tasks.slice(0, MAX_TASKS).map((t) => ({
      subject: String(t.subject || 'Follow up').trim().slice(0, 200),
      dueInDays: Math.max(0, Math.min(14, Number(t.dueInDays) || 2)),
      priority: ['Low', 'Normal', 'High'].includes(t.priority) ? t.priority : 'Normal',
    })).filter((t) => t.subject),
  }
}

/**
 * Paste meeting notes on an Opportunity → summary/nextStep + related Tasks.
 */
async function processMeetingNotes({ user, opportunityId, notes }) {
  const oid = toObjectId(opportunityId)
  if (!oid) return { ok: false, error: 'Invalid opportunityId' }
  const text = String(notes || '').trim()
  if (!text) return { ok: false, error: 'Paste meeting notes first.' }
  if (text.length > MAX_NOTES) {
    return { ok: false, error: `Notes must be under ${MAX_NOTES} characters.` }
  }

  const opp = await Opportunity.findOne({ ...workspaceFilter(user), _id: oid })
  if (!opp) return { ok: false, error: 'Opportunity not found.' }

  let extracted = null
  let mode = 'rules'
  if (isOpenAiConfigured()) {
    try {
      extracted = await extractWithLlm(text, opp)
      if (extracted) mode = 'llm'
    } catch (err) {
      console.warn('[meetingNotes] LLM failed:', err.message)
    }
  }
  if (!extracted) extracted = ruleFallback(text)

  const stamp = new Date().toISOString().slice(0, 10)
  const block = [
    '',
    `--- Meeting notes (AI) ${stamp} ---`,
    extracted.summary,
    '',
    text.slice(0, 2500),
  ].join('\n')
  const prev = String(opp.description || '').trim()
  opp.description = `${prev}${prev ? '\n' : ''}${block}`.slice(0, 5000)
  if (extracted.nextStep) {
    opp.nextStep = extracted.nextStep.slice(0, 300)
  }
  await opp.save()

  const tasksCreated = []
  for (const t of (extracted.tasks || []).slice(0, MAX_TASKS)) {
    const due = new Date()
    due.setDate(due.getDate() + (t.dueInDays ?? 2))
    // eslint-disable-next-line no-await-in-loop
    const task = await Task.create({
      subject: t.subject,
      status: 'Not Started',
      priority: t.priority || 'Normal',
      dueDate: due,
      description: `Created from meeting notes on Opportunity "${opp.name}".`,
      relatedType: 'Opportunity',
      relatedId: oid,
      workspaceId: user.workspaceId,
      ownerId: user._id,
    })
    tasksCreated.push({
      taskId: String(task._id),
      subject: task.subject,
      dueDate: due.toISOString().slice(0, 10),
      priority: task.priority,
    })
  }

  return {
    ok: true,
    mode,
    summary: extracted.summary,
    nextStep: extracted.nextStep || opp.nextStep,
    opportunityId: String(oid),
    tasksCreated,
  }
}

module.exports = { processMeetingNotes }
