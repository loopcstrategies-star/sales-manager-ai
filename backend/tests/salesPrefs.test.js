const {
  STAGE_PROBABILITY,
  probabilityForOpportunity,
  weightedAmount,
} = require('../services/emailDraft')
const { mergeSales } = require('../services/userPreferences')

describe('forecast helpers with custom stage probs', () => {
  test('uses stage map when probability unset', () => {
    const custom = { ...STAGE_PROBABILITY, Prospecting: 20 }
    expect(probabilityForOpportunity({ stage: 'Prospecting' }, custom)).toBe(20)
    expect(weightedAmount({ stage: 'Prospecting', amount: 1000 }, custom)).toBe(200)
  })

  test('explicit opportunity probability wins', () => {
    expect(probabilityForOpportunity({ stage: 'Prospecting', probability: 40 }, { Prospecting: 10 })).toBe(40)
  })
})

describe('growth sales prefs', () => {
  test('growth knobs merge with bounds', () => {
    const s = mergeSales({
      scheduledFindEnabled: true,
      scheduledFindHours: 100,
      defaultProspectRegion: '  UAE  ',
    })
    expect(s.scheduledFindEnabled).toBe(true)
    expect(s.scheduledFindHours).toBe(48)
    expect(s.defaultProspectRegion).toBe('UAE')
  })
})
