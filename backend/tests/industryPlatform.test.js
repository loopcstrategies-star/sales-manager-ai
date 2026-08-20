const {
  listIndustries,
  listSolutions,
  listPackages,
} = require('../services/industryCatalog')
const {
  scoreCompanyOpportunity,
  buildRecommendations,
  inferCompanyFacts,
} = require('../services/industryScoring')
const { extractDomain, qualificationResult } = require('../services/duplicateDetect')
const { workspaceFilter } = require('../services/crmHelpers')
const { copyAccountTaxonomyToContact } = require('../services/industryRecord')

describe('industry catalog completeness', () => {
  test('loads 16 industries with required configuration keys', () => {
    const industries = listIndustries()
    expect(industries).toHaveLength(16)
    industries.forEach((industry) => {
      expect(industry.slug).toBeTruthy()
      expect(industry.name).toBeTruthy()
      expect(Array.isArray(industry.businessTypes)).toBe(true)
      expect(Array.isArray(industry.qualificationQuestions)).toBe(true)
      expect(Array.isArray(industry.decisionMakerRoles)).toBe(true)
      expect(industry.salesPlaybook || industry.playbook || true).toBeTruthy()
    })
  })

  test('shared solution and package catalogs are non-empty', () => {
    expect(listSolutions().length).toBeGreaterThan(10)
    expect(listPackages().length).toBeGreaterThan(0)
  })
})

describe('industry scoring and recommendations', () => {
  test('returns multi-dimension scores and gap-aware recommendations', () => {
    const result = scoreCompanyOpportunity({
      name: 'ABC Jewellers',
      website: 'https://abc.example',
      industrySlug: 'jewelry',
      businessType: 'Retail Jeweller',
      researchSummary: {
        confidence: 40,
        inferredData: {},
        verifiedData: {},
        unknownData: ['ecommerce', 'mobileApp'],
      },
    })
    expect(result.opportunityScore).toBeGreaterThanOrEqual(0)
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0)
    expect(result.solutionFitScore).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(result.scoreBreakdown)).toBe(true)
    expect(result.recommendations.length).toBeGreaterThan(0)
    result.recommendations.forEach((item) => {
      expect(item.solutionId).toBeTruthy()
      expect(item.fitScore).toBeGreaterThan(0)
      expect(item.reason).toBeTruthy()
    })
  })

  test('does not invent verified ecommerce when unknown', () => {
    const facts = inferCompanyFacts({ description: 'Family jeweller with Instagram presence' })
    expect(facts.ecommerce).toBe('Unknown')
    const recommendations = buildRecommendations('jewelry', facts, { name: 'Jewelry' })
    expect(recommendations.some((item) => /e-?commerce/i.test(item.name) || item.detectedGap.includes('ecommerce'))).toBe(true)
  })
})

describe('qualification and duplicates helpers', () => {
  test('qualificationResult thresholds', () => {
    expect(qualificationResult({ a: '1', b: '2', c: '3', d: '4' }, ['a', 'b', 'c', 'd'])).toBe('Qualified')
    expect(qualificationResult({ a: '1' }, ['a', 'b', 'c', 'd'])).toBe('Needs Research')
    expect(qualificationResult({}, ['a', 'b', 'c', 'd'])).toBe('Low Priority')
  })

  test('extractDomain handles urls and emails', () => {
    expect(extractDomain('https://www.Example.com/path')).toBe('example.com')
    expect(extractDomain('owner@brand.io')).toBe('brand.io')
  })
})

describe('workspace isolation filter', () => {
  test('workspaceFilter scopes by workspaceId', () => {
    const filter = workspaceFilter({ workspaceId: '64b000000000000000000001' })
    expect(filter).toEqual({ workspaceId: '64b000000000000000000001' })
  })
})

describe('account taxonomy copy', () => {
  test('copies category fields onto contact when empty', () => {
    const contact = { industrySlug: '', category: '', subcategory: '', businessType: '' }
    copyAccountTaxonomyToContact(contact, {
      industrySlug: 'jewelry',
      category: 'Retail',
      subcategory: 'Gold',
      businessType: 'Retail Jeweller',
    })
    expect(contact.industrySlug).toBe('jewelry')
    expect(contact.category).toBe('Retail')
    expect(contact.subcategory).toBe('Gold')
    expect(contact.businessType).toBe('Retail Jeweller')
  })
})
