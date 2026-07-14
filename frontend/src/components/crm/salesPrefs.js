export const DEFAULT_SALES_PREFS = {
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
  return {
    ...DEFAULT_SALES_PREFS,
    ...partial,
    stageProbabilities: {
      ...DEFAULT_SALES_PREFS.stageProbabilities,
      ...(partial.stageProbabilities || {}),
    },
  }
}
