const express = require('express')
const { protect } = require('../middleware/auth')
const { Joi, validateBody } = require('../middleware/validate')
const { getUserPreferences, updateUserPreferences } = require('../services/userPreferences')
const { getRefreshHours } = require('../services/dashboardFeed')
const { getSalesAiConfig } = require('../services/orchestrator')

function getProviderStatus() {
  const cfg = getSalesAiConfig()
  return {
    groq: cfg.providers?.groq?.configured ?? false,
    tavily: cfg.providers?.tavily?.configured ?? false,
    brave: cfg.providers?.brave?.configured ?? false,
    hunter: cfg.providers?.hunter?.configured ?? false,
    newsApi: Boolean(String(process.env.NEWSAPI_KEY || '').trim()),
    goldApi: Boolean(String(process.env.GOLDAPI_KEY || '').trim()),
    searchProvider: cfg.providers?.search?.provider || null,
  }
}

const router = express.Router()
router.use(protect)

const patchSchema = Joi.object({
  dashboard: Joi.object({
    showPriceTiles: Joi.boolean(),
    showTicker: Joi.boolean(),
    showHeadlinesRow: Joi.boolean(),
    showHero: Joi.boolean(),
    showImages: Joi.boolean(),
    compactCards: Joi.boolean(),
    defaultRegion: Joi.string().max(40).allow(''),
    sections: Joi.object({
      metals: Joi.boolean(),
      general: Joi.boolean(),
    }),
    topicFilter: Joi.string().valid('all', 'gold', 'uae', 'b2b', 'macro'),
    customTopics: Joi.array().items(Joi.string().max(40)).max(10),
    sortOrder: Joi.string().valid('headlines', 'newest'),
    pollMinutes: Joi.number().valid(1, 5, 10, 15),
  }).min(1),
}).min(1)

router.get('/', async (req, res) => {
  try {
    const preferences = await getUserPreferences(req.user._id)
    res.json({
      success: true,
      preferences,
      server: {
        dashboardRefreshHours: getRefreshHours(),
      },
      providers: getProviderStatus(),
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load settings.' })
  }
})

router.patch('/', validateBody(patchSchema), async (req, res) => {
  try {
    const preferences = await updateUserPreferences(req.user._id, req.body)
    res.json({
      success: true,
      preferences,
      server: {
        dashboardRefreshHours: getRefreshHours(),
      },
      providers: getProviderStatus(),
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save settings.' })
  }
})

module.exports = router
