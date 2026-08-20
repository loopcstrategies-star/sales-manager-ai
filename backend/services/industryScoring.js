const { getIndustry, listSolutionsForIndustry } = require('./industryCatalog')
const { normalizeIndustryFields } = require('./industryRecord')

const GAP_SOLUTION_MAP = {
  websiteStatus: ['corporate-website', 'business-website'],
  ecommerce: ['ecommerce-website', 'catalog-website'],
  mobileApp: ['android-ios-app', 'customer-app', 'employee-app'],
  crm: ['crm'],
  erp: ['erp'],
  pos: ['pos'],
  inventory: ['inventory'],
  automation: ['ai-automation', 'whatsapp-marketing'],
  ai: ['ai-automation', 'ai-chatbot'],
  digitalMarketing: ['social-media', 'seo', 'google-ads'],
  customerPortal: ['customer-app'],
  projectManagement: ['project-management'],
  parentPortal: ['customer-app'],
  lms: ['customer-app'],
  appointmentSystem: ['booking-system'],
  patientPortal: ['customer-app'],
  onlineOrdering: ['ecommerce-website', 'online-ordering'],
  tracking: ['tracking'],
  guestPortal: ['booking-system', 'customer-portal'],
  bookingSystem: ['booking-system'],
  documentProcessing: ['document-processing', 'ai-automation'],
}

function normalizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'Unknown'
  if (['verified', 'yes', 'present', 'available', 'active', 'live'].includes(raw)) return 'Verified'
  if (['likely', 'maybe', 'partial'].includes(raw)) return 'Likely'
  if (['unknown', 'n/a', 'na', 'no', 'absent', 'missing'].includes(raw)) return 'Unknown'
  return value
}

function evaluateRule(rule, facts = {}) {
  const actual = facts[rule.field]
  const expected = rule.value
  if (rule.operator === 'equals') return String(actual || '') === String(expected || '')
  if (rule.operator === 'includes') return String(actual || '').toLowerCase().includes(String(expected || '').toLowerCase())
  return false
}

function inferCompanyFacts(record = {}) {
  const website = String(record.website || '').trim()
  const description = String(record.description || '').toLowerCase()
  const customBlob = JSON.stringify(record.researchSummary?.verifiedData || {}).toLowerCase()
  const inferredBlob = JSON.stringify(record.researchSummary?.inferredData || {}).toLowerCase()

  function detect(flag, keywords) {
    const source = `${description} ${customBlob} ${inferredBlob}`
    if (keywords.some((keyword) => source.includes(keyword))) return flag
    return 'Unknown'
  }

  return {
    websiteStatus: website ? 'Verified' : 'Unknown',
    ecommerce: detect('Likely', ['ecommerce', 'shopify', 'woocommerce', 'magento', 'online store']),
    mobileApp: detect('Likely', ['mobile app', 'android app', 'ios app', 'app store', 'google play']),
    socialPresence: detect('Likely', ['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok']),
    crm: detect('Likely', ['crm']),
    erp: detect('Likely', ['erp']),
    pos: detect('Likely', ['pos']),
    inventory: detect('Likely', ['inventory']),
    automation: detect('Likely', ['automation']),
    ai: detect('Likely', ['artificial intelligence', 'ai assistant', 'ai chatbot']),
    digitalMarketing: detect('Likely', ['seo', 'google ads', 'meta ads', 'digital marketing']),
    customerPortal: detect('Likely', ['portal', 'login', 'dashboard']),
    projectManagement: detect('Likely', ['project management']),
    parentPortal: detect('Likely', ['parent portal']),
    lms: detect('Likely', ['lms', 'learning management']),
    appointmentSystem: detect('Likely', ['appointment', 'book now']),
    patientPortal: detect('Likely', ['patient portal']),
    onlineOrdering: detect('Likely', ['order online', 'delivery']),
    tracking: detect('Likely', ['track shipment', 'tracking']),
    guestPortal: detect('Likely', ['book room', 'guest portal']),
    bookingSystem: detect('Likely', ['booking', 'reservation']),
    documentProcessing: detect('Likely', ['document', 'workflow']),
    multiLocation: normalizeStatus(record.researchSummary?.verifiedData?.multiLocation || record.researchSummary?.inferredData?.multiLocation),
    multiProject: normalizeStatus(record.researchSummary?.verifiedData?.multiProject || record.researchSummary?.inferredData?.multiProject),
    manufacturingCapability: normalizeStatus(record.researchSummary?.verifiedData?.manufacturingCapability || record.researchSummary?.inferredData?.manufacturingCapability),
  }
}

function opportunityGrade(score) {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'E'
}

function evidenceStatus(facts, field) {
  const value = facts[field]
  if (value === 'Verified') return 'VERIFIED'
  if (value === 'Likely') return 'INFERRED'
  return 'UNKNOWN'
}

function buildRecommendations(industrySlug, facts, industry) {
  const catalog = listSolutionsForIndustry(industrySlug || '')
  const byId = new Map(catalog.map((item) => [item.id, item]))
  const scored = new Map()

  Object.entries(GAP_SOLUTION_MAP).forEach(([gapField, solutionIds]) => {
    const status = facts[gapField]
    // Only recommend when capability is unknown (possible gap). Do not treat "Likely present" as a sell gap.
    if (status !== 'Unknown') return
    const gapLabel = gapField.replace(/([A-Z])/g, ' $1').toLowerCase()
    solutionIds.forEach((solutionId) => {
      const solution = byId.get(solutionId)
      if (!solution) return
      const existing = scored.get(solutionId) || {
        solutionId: solution.id,
        name: solution.name,
        category: solution.category,
        fitScore: 50,
        confidence: 55,
        priority: 'Medium',
        reason: '',
        evidence: [],
        detectedGap: gapLabel,
        source: 'research-inference',
        verificationStatus: 'UNKNOWN',
      }
      existing.fitScore = Math.min(98, existing.fitScore + 22)
      existing.confidence = Math.min(92, existing.confidence + 12)
      existing.evidence.push({
        field: gapField,
        value: 'Unknown',
        verificationStatus: 'UNKNOWN',
      })
      existing.reason = `No verified ${gapLabel} found in available research; solution may address this gap.`
      existing.priority = existing.fitScore >= 80 ? 'High' : existing.fitScore >= 65 ? 'Medium' : 'Low'
      scored.set(solutionId, existing)
    })
  })

  if (!scored.size) {
    return catalog.slice(0, 4).map((solution, index) => ({
      solutionId: solution.id,
      name: solution.name,
      category: solution.category,
      fitScore: 55 - index * 3,
      confidence: 45,
      priority: 'Medium',
      reason: `Relevant default for ${industry?.name || 'this'} industry; limited gap evidence available.`,
      evidence: [],
      detectedGap: 'insufficient research',
      source: 'industry-default',
      verificationStatus: 'UNKNOWN',
    }))
  }

  return Array.from(scored.values())
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 6)
}

function nextBestActionForStage(stage, facts = {}) {
  const s = String(stage || 'Prospecting')
  if (!facts.websiteStatus || facts.websiteStatus === 'Unknown') {
    return { action: 'Research company website and digital presence', stage: s }
  }
  if (s === 'Prospecting') return { action: 'Find decision maker and create introduction task', stage: s }
  if (s === 'Qualification') return { action: 'Complete qualification questions and update score', stage: s }
  if (s === 'Proposal') return { action: 'Send proposal and schedule follow-up', stage: s }
  if (s === 'Negotiation') return { action: 'Clarify objections and update commercial terms', stage: s }
  return { action: 'Review CRM notes and set next step due date', stage: s }
}

function scoreCompanyOpportunity(record = {}) {
  const normalized = normalizeIndustryFields(record)
  const industry = getIndustry(normalized.industrySlug || normalized.industryId || normalized.industry)
  const facts = inferCompanyFacts(record)
  const reasons = []
  const scoreBreakdown = []
  const strongestOpportunities = []
  let opportunityScore = 20
  let confidencePoints = 20
  let knownFacts = 0
  let totalFacts = 0

  if (record.website) {
    opportunityScore += 5
    scoreBreakdown.push({ label: '+5 website present', delta: 5 })
  }
  if (record.phone) {
    opportunityScore += 3
    scoreBreakdown.push({ label: '+3 phone present', delta: 3 })
  }
  if (normalized.industrySlug) {
    opportunityScore += 5
    scoreBreakdown.push({ label: '+5 industry tagged', delta: 5 })
  }
  if (normalized.businessType) {
    opportunityScore += 4
    scoreBreakdown.push({ label: '+4 business type tagged', delta: 4 })
  }

  const scoringRules = industry?.scoringRules || []
  scoringRules.forEach((rule) => {
    if (evaluateRule(rule, facts)) {
      const weight = Number(rule.weight) || 0
      opportunityScore += weight
      reasons.push(rule.label)
      strongestOpportunities.push(rule.label)
      scoreBreakdown.push({ label: `+${weight} ${rule.label}`, delta: weight })
    }
  })

  Object.entries(facts).forEach(([, value]) => {
    totalFacts += 1
    if (value === 'Verified') {
      knownFacts += 1
      confidencePoints += 4
    } else if (value === 'Likely') {
      knownFacts += 0.5
      confidencePoints += 2
    }
  })

  if (facts.websiteStatus === 'Unknown') {
    reasons.push('Missing website')
    scoreBreakdown.push({ label: 'Missing website (gap)', delta: 0 })
  }
  if (facts.ecommerce === 'Unknown') reasons.push('Unknown e-commerce status')
  if (facts.mobileApp === 'Unknown') reasons.push('Unknown mobile app status')

  const researchConfidence = Number(record.researchSummary?.confidence) || 0
  confidencePoints += Math.round(researchConfidence * 0.25)

  const missingInformation = Object.entries(facts)
    .filter(([, value]) => value === 'Unknown')
    .map(([key]) => key)
    .slice(0, 8)

  if (missingInformation.length >= 6) {
    opportunityScore -= 5
    scoreBreakdown.push({ label: '-5 insufficient company data', delta: -5 })
  }

  opportunityScore = Math.max(0, Math.min(100, Math.round(opportunityScore)))
  const confidenceScore = Math.max(0, Math.min(100, Math.round(confidencePoints)))
  const recommendations = buildRecommendations(normalized.industrySlug || '', facts, industry)
  const solutionFitScore = recommendations.length
    ? Math.round(recommendations.reduce((sum, item) => sum + Number(item.fitScore || 0), 0) / recommendations.length)
    : 0

  return {
    industry: industry || null,
    facts,
    score: opportunityScore,
    opportunityScore,
    confidenceScore,
    solutionFitScore,
    grade: opportunityGrade(opportunityScore),
    reasons: Array.from(new Set(reasons)).slice(0, 8),
    scoreBreakdown: scoreBreakdown.slice(0, 12),
    strongestOpportunities: Array.from(new Set(strongestOpportunities)).slice(0, 6),
    missingInformation,
    recommendations,
    nextBestAction: nextBestActionForStage(record.stage, facts),
    evidenceCoverage: totalFacts ? Math.round((knownFacts / totalFacts) * 100) : 0,
  }
}

module.exports = {
  scoreCompanyOpportunity,
  inferCompanyFacts,
  opportunityGrade,
  buildRecommendations,
  nextBestActionForStage,
}
