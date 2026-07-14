const {
  STAGE_PROBABILITY,
  probabilityForOpportunity,
  weightedAmount,
  extractJsonObject,
} = require('../services/emailDraft')

describe('forecast helpers', () => {
  test('stage defaults', () => {
    expect(STAGE_PROBABILITY.Prospecting).toBe(10)
    expect(STAGE_PROBABILITY.Negotiation).toBe(75)
  })

  test('probabilityForOpportunity uses override then stage', () => {
    expect(probabilityForOpportunity({ stage: 'Proposal', probability: null })).toBe(50)
    expect(probabilityForOpportunity({ stage: 'Proposal', probability: 40 })).toBe(40)
  })

  test('weightedAmount', () => {
    expect(weightedAmount({ stage: 'Negotiation', amount: 1000 })).toBe(750)
  })

  test('extractJsonObject', () => {
    expect(extractJsonObject('{"subject":"Hi","body":"Hello"}')).toEqual({ subject: 'Hi', body: 'Hello' })
  })
})
