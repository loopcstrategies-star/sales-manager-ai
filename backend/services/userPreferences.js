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
  batchFindCap: 25,
  bulkQueries: 5,
  perQuery: 8,
  scheduledFindEnabled: false,
  scheduledFindHours: 24,
  fillPipelineOnImport: true,
  defaultProspectRegion: '',
  convertCreateOpportunity: true,
  convertDefaultStage: 'Prospecting',
  enrichRefreshEnabled: true,
  enrichFillEmptyOnly: true,
  enrichStaleDays: 30,
  autoTaskFromNextStep: true,
  useLlmScoring: false,
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

function clampInt(n, min, max, fallback) {
  const v = Number(n)
  if (Number.isNaN(v)) return fallback
  return Math.max(min, Math.min(max, Math.round(v)))
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
  const findContactsMax = clampInt(partial.findContactsMax, 3, 15, DEFAULT_SALES.findContactsMax)
  const batchFindCap = clampInt(partial.batchFindCap, 10, 50, DEFAULT_SALES.batchFindCap)
  const bulkQueries = clampInt(partial.bulkQueries, 1, 8, DEFAULT_SALES.bulkQueries)
  const perQuery = clampInt(partial.perQuery, 1, 12, DEFAULT_SALES.perQuery)
  const enrichStaleDays = clampInt(partial.enrichStaleDays, 7, 90, DEFAULT_SALES.enrichStaleDays)
  const scheduledFindHours = clampInt(partial.scheduledFindHours, 6, 48, DEFAULT_SALES.scheduledFindHours)
  const emailTone = ['brief', 'professional', 'warm'].includes(partial.emailTone)
    ? partial.emailTone
    : DEFAULT_SALES.emailTone
  const convertDefaultStage = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation'].includes(partial.convertDefaultStage)
    ? partial.convertDefaultStage
    : DEFAULT_SALES.convertDefaultStage
  const defaultProspectRegion = String(partial.defaultProspectRegion || '').trim().slice(0, 40)

  return {
    ...DEFAULT_SALES,
    ...partial,
    emailTone,
    findContactsMax,
    batchFindCap,
    bulkQueries,
    perQuery,
    enrichStaleDays,
    scheduledFindHours,
    convertDefaultStage,
    defaultProspectRegion,
    useLlmScoring: partial.useLlmScoring === true,
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
  const docs = await UserPreferences.find({}).select('sales userId').lean()
  if (!docs.length) {
    return {
      enrichRefreshEnabled: DEFAULT_SALES.enrichRefreshEnabled,
      enrichFillEmptyOnly: DEFAULT_SALES.enrichFillEmptyOnly,
      enrichStaleDays: DEFAULT_SALES.enrichStaleDays,
      autoTaskFromNextStep: DEFAULT_SALES.autoTaskFromNextStep,
      scheduledFindEnabled: DEFAULT_SALES.scheduledFindEnabled,
      scheduledFindHours: DEFAULT_SALES.scheduledFindHours,
      batchFindCap: DEFAULT_SALES.batchFindCap,
      findContactsMax: DEFAULT_SALES.findContactsMax,
      findContactsNeedsVerify: DEFAULT_SALES.findContactsNeedsVerify,
      defaultProspectRegion: DEFAULT_SALES.defaultProspectRegion,
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
  const findOn = salesList.filter((s) => s.scheduledFindEnabled === true)
  const anyScheduledFind = findOn.length > 0
  const scheduledFindHours = findOn.length
    ? Math.min(...findOn.map((s) => s.scheduledFindHours))
    : DEFAULT_SALES.scheduledFindHours
  const batchFindCap = findOn.length
    ? Math.max(...findOn.map((s) => s.batchFindCap))
    : DEFAULT_SALES.batchFindCap
  const findContactsMax = findOn.length
    ? Math.max(...findOn.map((s) => s.findContactsMax))
    : DEFAULT_SALES.findContactsMax
  const findContactsNeedsVerify = findOn.length
    ? findOn.some((s) => s.findContactsNeedsVerify !== false)
    : DEFAULT_SALES.findContactsNeedsVerify
  const regionHit = findOn.find((s) => s.defaultProspectRegion)
  const defaultProspectRegion = regionHit?.defaultProspectRegion || DEFAULT_SALES.defaultProspectRegion

  return {
    enrichRefreshEnabled: anyEnrichOn,
    enrichFillEmptyOnly: fillEmptyOnly,
    enrichStaleDays: staleDays,
    autoTaskFromNextStep: anyNextStepOn,
    scheduledFindEnabled: anyScheduledFind,
    scheduledFindHours,
    batchFindCap,
    findContactsMax,
    findContactsNeedsVerify,
    defaultProspectRegion,
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
