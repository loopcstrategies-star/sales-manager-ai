const UserPreferences = require('../models/UserPreferences')
const { STAGE_PROBABILITY } = require('./emailDraft')

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

const DEFAULT_SALES = {
  emailTone: 'professional',
  saveEmailAsTask: true,
  findContactsAutoSave: true,
  findContactsMax: 5,
  findContactsNeedsVerify: true,
  convertCreateOpportunity: true,
  convertDefaultStage: 'Prospecting',
  enrichRefreshEnabled: true,
  enrichFillEmptyOnly: true,
  enrichStaleDays: 30,
  autoTaskFromNextStep: true,
  stageProbabilities: { ...STAGE_PROBABILITY },
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

function clampPct(n, fallback) {
  const v = Number(n)
  if (Number.isNaN(v)) return fallback
  return Math.max(0, Math.min(100, Math.round(v)))
}

function mergeStageProbabilities(partial = {}) {
  const out = { ...DEFAULT_SALES.stageProbabilities }
  for (const key of Object.keys(out)) {
    if (partial[key] !== undefined && partial[key] !== null && partial[key] !== '') {
      out[key] = clampPct(partial[key], out[key])
    }
  }
  return out
}

function mergeSales(partial = {}) {
  const findContactsMax = Math.max(3, Math.min(8, Number(partial.findContactsMax) || DEFAULT_SALES.findContactsMax))
  const enrichStaleDays = Math.max(7, Math.min(90, Number(partial.enrichStaleDays) || DEFAULT_SALES.enrichStaleDays))
  const emailTone = ['brief', 'professional', 'warm'].includes(partial.emailTone)
    ? partial.emailTone
    : DEFAULT_SALES.emailTone
  const convertDefaultStage = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation'].includes(partial.convertDefaultStage)
    ? partial.convertDefaultStage
    : DEFAULT_SALES.convertDefaultStage

  return {
    ...DEFAULT_SALES,
    ...partial,
    emailTone,
    findContactsMax,
    enrichStaleDays,
    convertDefaultStage,
    stageProbabilities: mergeStageProbabilities(partial.stageProbabilities || {}),
  }
}

function formatPreferences(doc) {
  return {
    dashboard: mergeDashboard(doc?.dashboard),
    sales: mergeSales(doc?.sales),
  }
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
  const mergedSales = mergeSales({
    ...(existing?.sales || {}),
    ...(patch.sales || {}),
    stageProbabilities: {
      ...(existing?.sales?.stageProbabilities || {}),
      ...(patch.sales?.stageProbabilities || {}),
    },
  })

  const doc = await UserPreferences.findOneAndUpdate(
    { userId },
    { userId, dashboard: mergedDashboard, sales: mergedSales },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()

  return formatPreferences(doc)
}

/**
 * Aggregate job knobs: refresh runs unless every user has turned it off.
 * Stale days / fill-empty: prefer the most aggressive (shortest stale) among enabled users.
 */
async function getAggregatedSalesJobPrefs() {
  const docs = await UserPreferences.find({}).select('sales').lean()
  if (!docs.length) {
    return {
      enrichRefreshEnabled: DEFAULT_SALES.enrichRefreshEnabled,
      enrichFillEmptyOnly: DEFAULT_SALES.enrichFillEmptyOnly,
      enrichStaleDays: DEFAULT_SALES.enrichStaleDays,
      autoTaskFromNextStep: DEFAULT_SALES.autoTaskFromNextStep,
    }
  }

  const salesList = docs.map((d) => mergeSales(d.sales || {}))
  const anyEnrichOn = salesList.some((s) => s.enrichRefreshEnabled !== false)
  const enrichOn = salesList.filter((s) => s.enrichRefreshEnabled !== false)
  const staleDays = enrichOn.length
    ? Math.min(...enrichOn.map((s) => s.enrichStaleDays))
    : DEFAULT_SALES.enrichStaleDays
  const fillEmptyOnly = enrichOn.length
    ? enrichOn.every((s) => s.enrichFillEmptyOnly !== false)
    : DEFAULT_SALES.enrichFillEmptyOnly
  const anyNextStepOn = salesList.some((s) => s.autoTaskFromNextStep !== false)

  return {
    enrichRefreshEnabled: anyEnrichOn,
    enrichFillEmptyOnly: fillEmptyOnly,
    enrichStaleDays: staleDays,
    autoTaskFromNextStep: anyNextStepOn,
  }
}

module.exports = {
  DEFAULT_DASHBOARD,
  DEFAULT_SALES,
  mergeDashboard,
  mergeSales,
  getUserPreferences,
  updateUserPreferences,
  getAggregatedSalesJobPrefs,
}
