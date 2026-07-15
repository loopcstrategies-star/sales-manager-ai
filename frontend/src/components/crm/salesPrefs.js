export const DEFAULT_SALES_PREFS = {
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
  stageProbabilities: {
    Prospecting: 10,
    Qualification: 25,
    Proposal: 50,
    Negotiation: 75,
    'Closed Won': 100,
    'Closed Lost': 0,
  },
}

export const STAGE_PROB_KEYS = [
  'Prospecting',
  'Qualification',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
]

export const CONVERT_STAGES = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation']

export function mergeSalesPrefs(partial = {}) {
  const findContactsMax = Math.max(3, Math.min(15, Number(partial.findContactsMax) || DEFAULT_SALES_PREFS.findContactsMax))
  const batchFindCap = Math.max(10, Math.min(50, Number(partial.batchFindCap) || DEFAULT_SALES_PREFS.batchFindCap))
  const bulkQueries = Math.max(1, Math.min(8, Number(partial.bulkQueries) || DEFAULT_SALES_PREFS.bulkQueries))
  const perQuery = Math.max(1, Math.min(12, Number(partial.perQuery) || DEFAULT_SALES_PREFS.perQuery))
  const scheduledFindHours = Math.max(6, Math.min(48, Number(partial.scheduledFindHours) || DEFAULT_SALES_PREFS.scheduledFindHours))
  return {
    ...DEFAULT_SALES_PREFS,
    ...partial,
    findContactsMax,
    batchFindCap,
    bulkQueries,
    perQuery,
    scheduledFindHours,
    defaultProspectRegion: String(partial.defaultProspectRegion || '').slice(0, 40),
    useLlmScoring: partial.useLlmScoring === true,
    stageProbabilities: {
      ...DEFAULT_SALES_PREFS.stageProbabilities,
      ...(partial.stageProbabilities || {}),
    },
  }
}
