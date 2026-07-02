const { refreshDashboardFeed, isDashboardEnabled, getRefreshHours } = require('../services/dashboardFeed')

let intervalId = null
let refreshing = false

async function runScheduledRefresh() {
  if (!isDashboardEnabled() || refreshing) return
  refreshing = true
  try {
    await refreshDashboardFeed()
    console.log('[dashboardRefresh] snapshot updated')
  } catch (err) {
    console.error('[dashboardRefresh] failed:', err.message)
  } finally {
    refreshing = false
  }
}

function startDashboardRefreshJob() {
  if (intervalId) return
  if (!isDashboardEnabled()) {
    console.log('[dashboardRefresh] disabled (DASHBOARD_ENABLED=false)')
    return
  }

  const hours = getRefreshHours()
  const ms = hours * 60 * 60 * 1000
  console.log(`[dashboardRefresh] scheduled every ${hours}h`)

  setTimeout(() => runScheduledRefresh(), 30_000)
  intervalId = setInterval(runScheduledRefresh, ms)
}

function stopDashboardRefreshJob() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

module.exports = { startDashboardRefreshJob, stopDashboardRefreshJob, runScheduledRefresh }
