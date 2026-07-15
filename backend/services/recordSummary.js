const { createChatCompletion, isOpenAiConfigured } = require('./openAiClient')
const Lead = require('../models/Lead')
const Account = require('../models/Account')
const Contact = require('../models/Contact')
const Opportunity = require('../models/Opportunity')
const Task = require('../models/Task')
const { workspaceFilter, toObjectId } = require('./crmHelpers')

function extractJsonObject(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : raw
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function ruleBasedSummary(objectType, record, tasks) {
  const openTasks = (tasks || []).filter((t) => t.status !== 'Completed')
  let summary = ''
  let nextAction = 'Log a follow-up task and set a due date.'
  let actionType = 'task'

  if (objectType === 'leads') {
    summary = [
      `${[record.firstName, record.lastName].filter(Boolean).join(' ') || 'Lead'} at ${record.company || 'unknown company'}.`,
      `Status: ${record.status || 'Open'}.`,
      record.email ? `Email on file.` : 'Missing email.',
      record.aiScore != null ? `AI score: ${record.aiScore}/100.` : '',
    ].filter(Boolean).join(' ')
    nextAction = record.email
      ? 'Draft a short outreach email and schedule a call.'
      : 'Find a verified email / contact, then draft outreach.'
    actionType = record.email ? 'email' : 'enrich'
  } else if (objectType === 'accounts') {
    summary = [
      `${record.name} account.`,
      record.website ? `Website: ${record.website}.` : 'No website.',
      record.region ? `Region: ${record.region}.` : '',
    ].filter(Boolean).join(' ')
    nextAction = 'Find contacts and open a pipeline opportunity if none exist.'
    actionType = 'find_contacts'
  } else if (objectType === 'contacts') {
    summary = [
      `${[record.firstName, record.lastName].filter(Boolean).join(' ') || 'Contact'}.`,
      record.title ? `Title: ${record.title}.` : '',
      record.email ? 'Has email.' : 'Missing email.',
    ].filter(Boolean).join(' ')
    nextAction = record.email ? 'Send a warm follow-up email.' : 'Verify contact details before outreach.'
    actionType = 'email'
  } else if (objectType === 'opportunities') {
    summary = [
      `${record.name} — ${record.stage || 'Prospecting'} at $${Number(record.amount || 0).toLocaleString()}.`,
      record.nextStep ? `Next step: ${record.nextStep}.` : 'No next step set.',
      record.closeDate ? `Close: ${String(record.closeDate).slice(0, 10)}.` : '',
    ].filter(Boolean).join(' ')
    nextAction = record.nextStep
      ? `Complete: ${record.nextStep}`
      : 'Set a concrete next step and due date to keep the deal moving.'
    actionType = 'task'
  }

  if (openTasks.length) {
    nextAction = `Complete open task: ${openTasks[0].subject}`
    actionType = 'task'
  }

  return { summary, nextAction, actionType, confidence: 'rule' }
}

async function summarizeRecord({ user, objectType, id }) {
  const filter = workspaceFilter(user)
  const oid = toObjectId(id)
  if (!oid) throw new Error('Invalid record id')

  const typeMap = {
    leads: { Model: Lead, relatedType: 'Lead' },
    accounts: { Model: Account, relatedType: 'Account' },
    contacts: { Model: Contact, relatedType: 'Contact' },
    opportunities: { Model: Opportunity, relatedType: 'Opportunity' },
  }
  const cfg = typeMap[objectType]
  if (!cfg) throw new Error('objectType must be leads|accounts|contacts|opportunities')

  const record = await cfg.Model.findOne({ ...filter, _id: oid }).lean()
  if (!record) throw new Error('Record not found')

  const tasks = await Task.find({
    ...filter,
    relatedType: cfg.relatedType,
    relatedId: oid,
  }).sort({ dueDate: 1 }).limit(8).lean()

  const fallback = ruleBasedSummary(objectType, record, tasks)
  if (!isOpenAiConfigured()) {
    return { ...fallback, recordId: String(oid), objectType }
  }

  try {
    const raw = await createChatCompletion(
      [
        {
          role: 'system',
          content: [
            'You are a sales coach for jewelry/precious metals B2B CRM.',
            'Return ONLY JSON: {"summary":"2-3 sentences","nextAction":"one concrete next step","actionType":"task|email|call|enrich|find_contacts"}',
            'Be specific to the record. Do not invent facts not in the payload.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            objectType,
            record: {
              name: record.name || [record.firstName, record.lastName].filter(Boolean).join(' '),
              company: record.company,
              status: record.status,
              stage: record.stage,
              amount: record.amount,
              email: record.email,
              phone: record.phone,
              website: record.website,
              industry: record.industry,
              title: record.title,
              nextStep: record.nextStep,
              nextStepDue: record.nextStepDue,
              closeDate: record.closeDate,
              description: record.description,
              aiScore: record.aiScore,
              region: record.region,
            },
            openTasks: tasks.filter((t) => t.status !== 'Completed').map((t) => ({
              subject: t.subject,
              dueDate: t.dueDate,
              priority: t.priority,
            })),
          }).slice(0, 4000),
        },
      ],
      { temperature: 0.3, maxTokens: 500 },
    )
    const parsed = extractJsonObject(raw)
    if (parsed?.summary && parsed?.nextAction) {
      return {
        summary: String(parsed.summary).slice(0, 800),
        nextAction: String(parsed.nextAction).slice(0, 300),
        actionType: ['task', 'email', 'call', 'enrich', 'find_contacts'].includes(parsed.actionType)
          ? parsed.actionType
          : fallback.actionType,
        confidence: 'llm',
        recordId: String(oid),
        objectType,
      }
    }
  } catch (err) {
    console.error('[recordSummary] LLM failed:', err.message)
  }

  return { ...fallback, recordId: String(oid), objectType }
}

module.exports = { summarizeRecord, ruleBasedSummary }
