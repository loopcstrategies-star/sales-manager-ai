const { runScheduledThinAccountFind } = require('../services/thinAccountFind')
const { getAggregatedSalesJobPrefs } = require('../services/userPreferences')

let intervalId = null
let running = false

async function runThinAccountFindJob(options = {}) {
  if (running && !options.force) {
    return { skipped: true, reason: 'already_running' }
  }
  running = true
  try {
    return await runScheduledThinAccountFind(options)
  } finally {
    running = false
  }
}

function startThinAccountFindJob() {
  if (intervalId) return
  if (String(process.env.CRM_THIN_FIND_ENABLED || 'true').toLowerCase() === 'false') {
    console.log('[thinAccountFind] disabled (CRM_THIN_FIND_ENABLED=false)')
    return
  }

  const bootstrap = async () => {
    const prefs = await getAggregatedSalesJobPrefs()
    if (!prefs.scheduledFindEnabled) {
      console.log('[thinAccountFind] idle until a user enables Scheduled find in Sales settings')
    }
    const hours = Math.max(6, Number(process.env.CRM_THIN_FIND_HOURS) || prefs.scheduledFindHours || 24)
    const ms = hours * 60 * 60 * 1000
    console.log(`[thinAccountFind] checking every ${hours}h (user preference gate)`)

    setTimeout(() => {
      runThinAccountFindJob().catch((err) => console.error('[thinAccountFind]', err.message))
    }, 120_000)

    intervalId = setInterval(() => {
      runThinAccountFindJob().catch((err) => console.error('[thinAccountFind]', err.message))
    }, ms)
  }

  bootstrap().catch((err) => console.error('[thinAccountFind] start failed', err.message))
}

function stopThinAccountFindJob() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

module.exports = {
  runThinAccountFindJob,
  startThinAccountFindJob,
  stopThinAccountFindJob,
}
