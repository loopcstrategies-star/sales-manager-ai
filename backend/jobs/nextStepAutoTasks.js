const Opportunity = require('../models/Opportunity')
const Task = require('../models/Task')
const { getUserPreferences, DEFAULT_SALES } = require('../services/userPreferences')

let intervalId = null
let running = false

const CLOSED = new Set(['Closed Won', 'Closed Lost'])

/**
 * Create one Task per open opportunity with an overdue nextStepDue,
 * when the owning user has autoTaskFromNextStep enabled.
 * Idempotent: skips if an open related Task already exists for the opp.
 */
async function runNextStepAutoTasks(options = {}) {
  if (running && !options.force) {
    return { skipped: true, reason: 'already_running' }
  }

  running = true
  try {
    const now = new Date()
    const opps = await Opportunity.find({
      stage: { $nin: [...CLOSED] },
      nextStep: { $exists: true, $nin: [null, ''] },
      nextStepDue: { $ne: null, $lte: now },
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    })
      .select('name nextStep nextStepDue ownerId workspaceId')
      .limit(Number(options.cap) || 100)
      .lean()

    let created = 0
    let skipped = 0
    let disabled = 0

    for (const opp of opps) {
      const prefs = opp.ownerId
        ? (await getUserPreferences(opp.ownerId)).sales
        : DEFAULT_SALES
      if (prefs.autoTaskFromNextStep === false) {
        disabled += 1
        continue
      }

      const existing = await Task.findOne({
        workspaceId: opp.workspaceId,
        relatedType: 'Opportunity',
        relatedId: opp._id,
        status: { $nin: ['Completed'] },
        subject: { $regex: /^Follow up:/i },
      }).select('_id').lean()

      if (existing) {
        skipped += 1
        continue
      }

      const subject = `Follow up: ${String(opp.nextStep).slice(0, 160)}`.slice(0, 200)
      await Task.create({
        subject,
        status: 'Not Started',
        priority: 'High',
        dueDate: opp.nextStepDue,
        description: `Auto-created from overdue next step on opportunity "${opp.name}".`,
        relatedType: 'Opportunity',
        relatedId: opp._id,
        workspaceId: opp.workspaceId,
        ownerId: opp.ownerId,
      })
      created += 1
    }

    const summary = {
      scanned: opps.length,
      created,
      skipped,
      disabled,
    }
    console.log('[nextStepAutoTasks]', JSON.stringify(summary))
    return summary
  } finally {
    running = false
  }
}

function startNextStepAutoTasksJob() {
  if (intervalId) return
  if (String(process.env.CRM_NEXT_STEP_TASKS_ENABLED || 'true').toLowerCase() === 'false') {
    console.log('[nextStepAutoTasks] disabled (CRM_NEXT_STEP_TASKS_ENABLED=false)')
    return
  }

  const hours = Math.max(1, Number(process.env.CRM_NEXT_STEP_TASKS_HOURS) || 6)
  const ms = hours * 60 * 60 * 1000
  console.log(`[nextStepAutoTasks] scheduled every ${hours}h`)

  setTimeout(() => {
    runNextStepAutoTasks().catch((err) => console.error('[nextStepAutoTasks]', err.message))
  }, 90_000)
  intervalId = setInterval(() => {
    runNextStepAutoTasks().catch((err) => console.error('[nextStepAutoTasks]', err.message))
  }, ms)
}

function stopNextStepAutoTasksJob() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

module.exports = {
  runNextStepAutoTasks,
  startNextStepAutoTasksJob,
  stopNextStepAutoTasksJob,
}
