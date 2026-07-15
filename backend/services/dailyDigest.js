const { createChatCompletion, isOpenAiConfigured } = require('./openAiClient')
const Lead = require('../models/Lead')
const Opportunity = require('../models/Opportunity')
const Task = require('../models/Task')
const Account = require('../models/Account')
const Contact = require('../models/Contact')
const DashboardSnapshot = require('../models/DashboardSnapshot')
const Digest = require('../models/Digest')
const { workspaceFilter } = require('./crmHelpers')

const CLOSED = new Set(['Closed Won', 'Closed Lost'])

async function buildDigestPayload(user) {
  const filter = workspaceFilter(user)
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const week = new Date(now)
  week.setDate(week.getDate() + 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    openLeads,
    newLeads,
    openDeals,
    dealsCloseSoon,
    tasksDue,
    accounts,
    contacts,
    staleDeals,
    snap,
  ] = await Promise.all([
    Lead.countDocuments({ ...filter, status: { $in: ['Open', 'Working'] } }),
    Lead.countDocuments({ ...filter, createdAt: { $gte: start } }),
    Opportunity.countDocuments({ ...filter, stage: { $nin: [...CLOSED] } }),
    Opportunity.find({
      ...filter,
      stage: { $nin: [...CLOSED] },
      closeDate: { $ne: null, $lte: week },
    }).sort({ closeDate: 1 }).limit(8).lean(),
    Task.find({
      ...filter,
      status: { $ne: 'Completed' },
      dueDate: { $ne: null, $lte: week },
    }).sort({ dueDate: 1 }).limit(10).lean(),
    Account.countDocuments(filter),
    Contact.countDocuments(filter),
    Opportunity.find({
      ...filter,
      stage: { $nin: [...CLOSED] },
      updatedAt: { $lte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    }).sort({ updatedAt: 1 }).limit(5).lean(),
    DashboardSnapshot.findOne({}).sort({ createdAt: -1 }).lean().catch(() => null),
  ])

  const headline = snap?.cards?.[0]?.title || snap?.cards?.[0]?.headline || ''

  const facts = {
    openLeads,
    newLeadsToday: newLeads,
    openDeals,
    accounts,
    contacts,
    dealsCloseSoon: dealsCloseSoon.map((o) => ({
      id: String(o._id),
      name: o.name,
      stage: o.stage,
      amount: o.amount,
      closeDate: o.closeDate ? String(o.closeDate).slice(0, 10) : null,
    })),
    tasksDue: tasksDue.map((t) => ({
      id: String(t._id),
      subject: t.subject,
      dueDate: t.dueDate ? String(t.dueDate).slice(0, 10) : null,
      priority: t.priority,
    })),
    staleDeals: staleDeals.map((o) => ({
      id: String(o._id),
      name: o.name,
      stage: o.stage,
      updatedAt: o.updatedAt ? String(o.updatedAt).slice(0, 10) : null,
    })),
    marketHeadline: headline,
  }

  let summary = [
    `## Daily sales digest`,
    `- Open leads: **${openLeads}** (${newLeads} new today)`,
    `- Open deals: **${openDeals}** · Accounts: ${accounts} · Contacts: ${contacts}`,
    dealsCloseSoon.length
      ? `- Closing this week: ${dealsCloseSoon.map((d) => d.name).join(', ')}`
      : '- No deals scheduled to close this week.',
    tasksDue.length
      ? `- Tasks due soon: ${tasksDue.slice(0, 5).map((t) => t.subject).join('; ')}`
      : '- No tasks due in the next 7 days.',
    staleDeals.length
      ? `- Stale deals (14d+ quiet): ${staleDeals.map((d) => d.name).join(', ')}`
      : '',
    headline ? `- Market: ${headline}` : '',
  ].filter(Boolean).join('\n')

  if (isOpenAiConfigured()) {
    try {
      const llm = await createChatCompletion(
        [
          {
            role: 'system',
            content: 'Write a concise morning sales digest in markdown (max 180 words) from the JSON facts. Use ## Daily digest and short bullets. Be actionable.',
          },
          { role: 'user', content: JSON.stringify(facts).slice(0, 3500) },
        ],
        { temperature: 0.3, maxTokens: 600 },
      )
      if (llm) summary = llm
    } catch (err) {
      console.error('[digest] LLM failed:', err.message)
    }
  }

  return { summary, facts }
}

async function createOrRefreshDigest(user) {
  const day = new Date()
  day.setHours(0, 0, 0, 0)
  const { summary, facts } = await buildDigestPayload(user)
  const doc = await Digest.findOneAndUpdate(
    { workspaceId: user.workspaceId, ownerId: user._id, day },
    {
      workspaceId: user.workspaceId,
      ownerId: user._id,
      day,
      summary,
      facts,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  return doc
}

module.exports = { buildDigestPayload, createOrRefreshDigest }
