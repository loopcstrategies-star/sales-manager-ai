const Opportunity = require('../models/Opportunity')
const Task = require('../models/Task')
const User = require('../models/User')

const CLOSED = new Set(['Closed Won', 'Closed Lost'])

function hoursMs(h) {
  return Math.max(1, Number(h) || 24) * 60 * 60 * 1000
}

async function alertStaleDealsForWorkspace(workspaceId, ownerId, staleDays) {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000)
  const opps = await Opportunity.find({
    workspaceId,
    stage: { $nin: [...CLOSED] },
    updatedAt: { $lte: cutoff },
  }).limit(40).lean()

  let created = 0
  for (const opp of opps) {
    const subject = `Stale deal alert: ${opp.name}`.slice(0, 200)
    const existing = await Task.findOne({
      workspaceId,
      relatedType: 'Opportunity',
      relatedId: opp._id,
      subject,
      status: { $ne: 'Completed' },
    }).select('_id').lean()
    if (existing) continue

    await Task.create({
      subject,
      status: 'Not Started',
      priority: 'High',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      description: [
        `Opportunity "${opp.name}" has been quiet for ${staleDays}+ days.`,
        `Stage: ${opp.stage} · Amount: ${opp.amount}`,
        'Suggested: call the buyer, update next step, or mark Closed Lost with a reason.',
      ].join('\n'),
      relatedType: 'Opportunity',
      relatedId: opp._id,
      workspaceId,
      ownerId: opp.ownerId || ownerId,
    })
    created += 1
  }
  return { scanned: opps.length, created }
}

async function runStaleDealsJob() {
  const staleDays = Math.max(7, Number(process.env.CRM_STALE_DEAL_DAYS || 14))
  const users = await User.find({}).select('_id workspaceId').limit(200).lean()
  const byWorkspace = new Map()
  for (const u of users) {
    if (!u.workspaceId) continue
    const key = String(u.workspaceId)
    if (!byWorkspace.has(key)) byWorkspace.set(key, u)
  }
  let totalCreated = 0
  for (const u of byWorkspace.values()) {
    try {
      const r = await alertStaleDealsForWorkspace(u.workspaceId, u._id, staleDays)
      totalCreated += r.created
    } catch (err) {
      console.error('[staleDeals] workspace failed:', u.workspaceId, err.message)
    }
  }
  console.log(`[staleDeals] created ${totalCreated} alert tasks (stale>${staleDays}d)`)
  return { totalCreated, staleDays }
}

function startStaleDealsJob() {
  const hours = Number(process.env.CRM_STALE_DEAL_HOURS || 12)
  const run = () => runStaleDealsJob().catch((err) => console.error('[staleDeals]', err.message))
  setTimeout(run, 3 * 60 * 1000)
  setInterval(run, hoursMs(hours))
  console.log(`[staleDeals] job scheduled every ${hours}h`)
}

module.exports = { startStaleDealsJob, runStaleDealsJob, alertStaleDealsForWorkspace }
