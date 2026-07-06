const UserPreferences = require('../models/UserPreferences')

const DEFAULT_DASHBOARD = {
  showPriceTiles: true,
  showTicker: true,
  showHeadlinesRow: true,
  showHero: true,
  showImages: true,
  compactCards: false,
  defaultRegion: '',
  sections: { metals: true, general: true },
  topicFilter: 'all',
  customTopics: [],
  sortOrder: 'headlines',
  pollMinutes: 5,
}

function mergeDashboard(partial = {}) {
  const sections = { ...DEFAULT_DASHBOARD.sections, ...(partial.sections || {}) }
  const customTopics = Array.isArray(partial.customTopics)
    ? partial.customTopics.map((t) => String(t).trim()).filter(Boolean).slice(0, 10)
    : DEFAULT_DASHBOARD.customTopics

  return {
    ...DEFAULT_DASHBOARD,
    ...partial,
    sections,
    customTopics,
  }
}

function formatPreferences(doc) {
  const dashboard = mergeDashboard(doc?.dashboard)
  return { dashboard }
}

async function getUserPreferences(userId) {
  const doc = await UserPreferences.findOne({ userId }).lean()
  return formatPreferences(doc)
}

async function updateUserPreferences(userId, patch = {}) {
  const existing = await UserPreferences.findOne({ userId }).lean()
  const mergedDashboard = mergeDashboard({
    ...(existing?.dashboard || {}),
    ...(patch.dashboard || {}),
    sections: {
      ...(existing?.dashboard?.sections || DEFAULT_DASHBOARD.sections),
      ...(patch.dashboard?.sections || {}),
    },
  })

  const doc = await UserPreferences.findOneAndUpdate(
    { userId },
    { userId, dashboard: mergedDashboard },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()

  return formatPreferences(doc)
}

module.exports = {
  DEFAULT_DASHBOARD,
  mergeDashboard,
  getUserPreferences,
  updateUserPreferences,
}
