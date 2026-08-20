const { getIndustry, listSolutionsForIndustry } = require('./industryCatalog')

function normalizeText(value, max = 120) {
  return String(value || '').trim().slice(0, max)
}

function pickIndustryConfig(input = {}) {
  const candidates = [
    input.industrySlug,
    input.industryId,
    input.industry,
    input.type,
  ]
  for (const candidate of candidates) {
    const raw = normalizeText(candidate, 120)
    if (!raw) continue
    const key = raw.toLowerCase().replace(/\s+/g, '-')
    const industry = getIndustry(key) || getIndustry(raw)
    if (industry) return industry
  }
  return null
}

function normalizeIndustryFields(input = {}, fallback = {}) {
  const industry = pickIndustryConfig({
    industrySlug: input.industrySlug || fallback.industrySlug,
    industryId: input.industryId || fallback.industryId,
    industry: input.industry || fallback.industry,
    type: input.type || fallback.type,
  })

  const businessType = normalizeText(input.businessType || fallback.businessType, 120)
  return {
    industryId: industry?.id || normalizeText(input.industryId || fallback.industryId, 80),
    industrySlug: industry?.slug || normalizeText(input.industrySlug || fallback.industrySlug, 80),
    industry: industry?.name || normalizeText(input.industry || fallback.industry, 80),
    businessType,
    industryConfig: industry || null,
  }
}

function defaultResearchSummary() {
  return {
    verifiedData: {},
    inferredData: {},
    unknownData: [],
    confidence: 0,
    source: '',
    researchedAt: null,
  }
}

function mergeResearchSummary(existing = {}, patch = {}) {
  const current = {
    ...defaultResearchSummary(),
    ...(existing || {}),
  }
  return {
    verifiedData: {
      ...(current.verifiedData || {}),
      ...(patch.verifiedData || {}),
    },
    inferredData: {
      ...(current.inferredData || {}),
      ...(patch.inferredData || {}),
    },
    unknownData: Array.from(new Set([...(current.unknownData || []), ...(patch.unknownData || [])])),
    confidence: Number.isFinite(Number(patch.confidence))
      ? Number(patch.confidence)
      : Number(current.confidence || 0),
    source: normalizeText(patch.source || current.source, 200),
    researchedAt: patch.researchedAt || current.researchedAt || null,
  }
}

function attachIndustryMetadata(record, input = {}, options = {}) {
  const normalized = normalizeIndustryFields(input, record)
  if (normalized.industryId) record.industryId = normalized.industryId
  if (normalized.industrySlug) record.industrySlug = normalized.industrySlug
  if (normalized.industry) {
    if ('industry' in record) record.industry = normalized.industry
    if (!record.type && options.copyIndustryToType) record.type = normalized.industry
  }
  if (normalized.businessType) record.businessType = normalized.businessType
  if (options.copyIndustryToType && normalized.industry && !record.type) {
    record.type = normalized.industry
  }
  return normalized
}

function industryRecommendedSolutions(industrySlug, facts = {}) {
  const { buildRecommendations } = require('./industryScoring')
  const { getIndustry } = require('./industryCatalog')
  const industry = getIndustry(industrySlug)
  const recommendations = buildRecommendations(
    industrySlug || '',
    {
      website: 'Unknown',
      ecommerce: 'Unknown',
      mobileApp: 'Unknown',
      social: 'Unknown',
      ...facts,
    },
    industry,
  )
  if (recommendations.length) {
    return recommendations.map((item) => item.solutionId).slice(0, 8)
  }
  return listSolutionsForIndustry(industrySlug || '')
    .slice(0, 8)
    .map((solution) => solution.id)
}

module.exports = {
  normalizeIndustryFields,
  attachIndustryMetadata,
  mergeResearchSummary,
  defaultResearchSummary,
  industryRecommendedSolutions,
}
