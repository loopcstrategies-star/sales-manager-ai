const { getIndustry, listSolutionsForIndustry } = require('./industryCatalog')
const { normalizeIndustryFields } = require('./industryRecord')

function normalizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'Unknown'
  if (['verified', 'yes', 'present', 'available', 'active', 'live'].includes(raw)) return 'Verified'
  if (['likely', 'maybe', 'partial'].includes(raw)) return 'Likely'
  if (['unknown', 'n/a', 'na'].includes(raw)) return 'Unknown'
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

function scoreCompanyOpportunity(record = {}) {
  const normalized = normalizeIndustryFields(record)
  const industry = getIndustry(normalized.industrySlug || normalized.industryId || normalized.industry)
  const facts = inferCompanyFacts(record)
  const reasons = []
  const strongestOpportunities = []
  let score = 20

  if (record.website) score += 5
  if (record.phone) score += 3
  if (normalized.industrySlug) score += 5
  if (normalized.businessType) score += 4

  const scoringRules = industry?.scoringRules || []
  scoringRules.forEach((rule) => {
    if (evaluateRule(rule, facts)) {
      score += Number(rule.weight) || 0
      reasons.push(rule.label)
      strongestOpportunities.push(rule.label)
    }
  })

  if (facts.websiteStatus === 'Unknown') reasons.push('Missing website')
  if (facts.ecommerce === 'Unknown') reasons.push('Unknown e-commerce status')
  if (facts.mobileApp === 'Unknown') reasons.push('Unknown mobile app status')

  const missingInformation = Object.entries(facts)
    .filter(([, value]) => value === 'Unknown')
    .map(([key]) => key)
    .slice(0, 8)

  score = Math.max(0, Math.min(100, Math.round(score)))
  const recommendations = listSolutionsForIndustry(normalized.industrySlug || '')
    .slice(0, 4)
    .map((solution) => ({
      solutionId: solution.id,
      name: solution.name,
      confidence: solution.targetIndustries.includes(normalized.industrySlug || '') ? 'High' : 'Medium',
      priority: strongestOpportunities.length ? 'High' : 'Medium',
      reason: strongestOpportunities[0] || `Relevant for ${industry?.name || 'this'} companies`,
      category: solution.category,
    }))

  return {
    industry: industry || null,
    facts,
    score,
    grade: opportunityGrade(score),
    reasons: Array.from(new Set(reasons)).slice(0, 8),
    strongestOpportunities: Array.from(new Set(strongestOpportunities)).slice(0, 6),
    missingInformation,
    recommendations,
  }
}

module.exports = {
  scoreCompanyOpportunity,
  inferCompanyFacts,
  opportunityGrade,
}
