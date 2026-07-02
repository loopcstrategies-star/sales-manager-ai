const express = require('express')
const rateLimit = require('express-rate-limit')
const { protect } = require('../middleware/auth')
const {
  getDashboardFeed,
  refreshDashboardFeed,
  getLatestSnapshot,
  isSnapshotStale,
  getRefreshHours,
  isDashboardEnabled,
} = require('../services/dashboardFeed')

const router = express.Router()
router.use(protect)

const refreshLimiter = rateLimit({
  windowMs: Math.max(1, Number(process.env.DASHBOARD_MANUAL_REFRESH_COOLDOWN_MIN || 10)) * 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Please wait before refreshing again.' },
})

function formatResponse(snapshot) {
  return {
    success: true,
    enabled: isDashboardEnabled(),
    refreshedAt: snapshot?.refreshedAt || null,
    stale: isSnapshotStale(snapshot?.refreshedAt),
    refreshHours: getRefreshHours(),
    searchProvider: snapshot?.searchProvider || null,
    meta: snapshot?.meta || {},
    cards: snapshot?.cards || [],
  }
}

router.get('/', async (req, res) => {
  try {
    const force = String(req.query.refresh || '') === '1'
    const snapshot = await getDashboardFeed({ forceRefresh: force })
    res.json(formatResponse(snapshot))
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load dashboard.' })
  }
})

router.post('/refresh', refreshLimiter, async (_req, res) => {
  try {
    const snapshot = await refreshDashboardFeed()
    res.json(formatResponse(snapshot))
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Dashboard refresh failed.' })
  }
})

router.get('/status', async (_req, res) => {
  try {
    const snapshot = await getLatestSnapshot()
    res.json({
      success: true,
      enabled: isDashboardEnabled(),
      hasData: Boolean(snapshot?.cards?.length),
      refreshedAt: snapshot?.refreshedAt || null,
      stale: isSnapshotStale(snapshot?.refreshedAt),
      refreshHours: getRefreshHours(),
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to get dashboard status.' })
  }
})

module.exports = router
