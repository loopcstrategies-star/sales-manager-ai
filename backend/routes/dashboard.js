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
const {
  verifyImageProxySig,
  decodeProxiedImageUrl,
  fetchProxiedImage,
  isAllowedProxyHost,
} = require('../services/cardImages')

const router = express.Router()

const imageProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many image requests.',
})

router.get('/image', imageProxyLimiter, async (req, res) => {
  try {
    const u = String(req.query.u || '').trim()
    const sig = String(req.query.sig || '').trim()

    if (!verifyImageProxySig(u, sig)) {
      return res.status(403).json({ success: false, message: 'Invalid image signature.' })
    }

    const imageUrl = decodeProxiedImageUrl(u)
    if (!imageUrl || !/^https:\/\//i.test(imageUrl) || !isAllowedProxyHost(imageUrl)) {
      return res.status(403).json({ success: false, message: 'Image URL not allowed.' })
    }

    const { buffer, contentType } = await fetchProxiedImage(imageUrl)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.send(buffer)
  } catch (err) {
    return res.status(502).json({ success: false, message: err.message || 'Image proxy failed.' })
  }
})

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
    region: snapshot?.region || '',
    meta: snapshot?.meta || {},
    cards: snapshot?.cards || [],
    priceTiles: snapshot?.priceTiles || [],
  }
}

router.get('/', async (req, res) => {
  try {
    const force = String(req.query.refresh || '') === '1'
    const region = String(req.query.region || '').trim().toLowerCase()
    const snapshot = await getDashboardFeed({ forceRefresh: force, region })
    res.json(formatResponse(snapshot))
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load dashboard.' })
  }
})

router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const region = String(req.body?.region || req.query?.region || '').trim().toLowerCase()
    const snapshot = await refreshDashboardFeed({ region })
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
