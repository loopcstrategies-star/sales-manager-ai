const { searchWithCache } = require('./webSearch')
const { createChatCompletion, isOpenAiConfigured } = require('./openAiClient')
const { extractJsonObject } = require('./emailDraft')
const { attachIndustryMetadata, mergeResearchSummary } = require('./industryRecord')

function fillIfEmpty(target, key, value, overwrite) {
  if (value == null || String(value).trim() === '') return
  if (overwrite || !String(target[key] || '').trim()) {
    target[key] = String(value).trim()
  }
}

function extractFromText(blob) {
  const text = String(blob || '')
  const out = {}

  const website = text.match(/https?:\/\/[^\s)"']+/i)
  if (website) out.website = website[0].replace(/[.,;]+$/, '')

  const phone = text.match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/)
  if (phone) out.phone = phone[0]

  const employees = text.match(/(\d[\d,]*)\s*(?:\+|plus)?\s*(?:employees|staff|people)/i)
  if (employees) out.numberOfEmployees = employees[1].replace(/,/g, '')

  const revenue = text.match(/(?:revenue|turnover)[^\d$€£]*([$€£]?\s?\d[\d.,]*\s*(?:million|billion|m|b)?)/i)
  if (revenue) out.annualRevenue = revenue[1].trim()

  const industries = [
    'Technology', 'Software', 'Finance', 'Banking', 'Healthcare', 'Manufacturing',
    'Retail', 'Education', 'Energy', 'Construction', 'Hospitality', 'Telecommunications',
    'Jewelry', 'Mining', 'Agriculture', 'Insurance', 'Media', 'Logistics',
  ]
  const foundIndustry = industries.find((ind) => new RegExp(`\\b${ind}\\b`, 'i').test(text))
  if (foundIndustry) out.industry = foundIndustry

  const cityCountry = text.match(/\b(?:based in|headquartered in|located in)\s+([A-Za-z .'-]{2,40})(?:,\s*([A-Za-z .'-]{2,40}))?/i)
  if (cityCountry) {
    out.city = cityCountry[1].trim()
    if (cityCountry[2]) out.country = cityCountry[2].trim()
  }

  return out
}

async function extractWithLlm(blob, query) {
  if (!isOpenAiConfigured()) return null
  const text = String(blob || '').slice(0, 6000)
  if (!text.trim()) return null

  try {
    const raw = await createChatCompletion(
      [
        {
          role: 'system',
          content: [
            'Extract company/lead enrichment fields from web snippets.',
            'Return ONLY JSON with optional keys:',
            'website, phone, industry, description, numberOfEmployees, annualRevenue, city, country, title',
            'Use null/omit when unknown. Do not invent facts.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `Search query: ${query}\n\nSnippets:\n${text}`,
        },
      ],
      { temperature: 0.1, maxTokens: 500, retryOnRateLimit: true, timeoutMs: 15000 },
    )
    const parsed = extractJsonObject(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const out = {}
    for (const key of [
      'website', 'phone', 'industry', 'description', 'numberOfEmployees',
      'annualRevenue', 'city', 'country', 'title',
    ]) {
      if (parsed[key] != null && String(parsed[key]).trim()) {
        out[key] = String(parsed[key]).trim().slice(0, key === 'description' ? 2000 : 200)
      }
    }
    return Object.keys(out).length ? out : null
  } catch (err) {
    console.warn('[crmEnrichment] LLM extract failed:', err.message)
    return null
  }
}

async function enrichFromQuery(query, { useLlm = true } = {}) {
  const search = await searchWithCache(query, { maxResults: 5, searchDepth: 'basic' })
  const parts = []
  if (search.answer) parts.push(search.answer)
  ;(search.results || []).forEach((r) => {
    parts.push(`${r.title || ''} ${r.content || ''} ${r.url || ''}`)
  })
  const blob = parts.join('\n')
  const regexFields = extractFromText(blob)
  if (!regexFields.website && search.results?.[0]?.url) {
    regexFields.website = search.results[0].url
  }
  if (!regexFields.description && search.answer) {
    regexFields.description = String(search.answer).slice(0, 2000)
  } else if (!regexFields.description && search.results?.[0]?.content) {
    regexFields.description = String(search.results[0].content).slice(0, 2000)
  }

  let llmFields = null
  if (useLlm !== false) {
    llmFields = await extractWithLlm(blob, query)
  }

  const extracted = { ...regexFields, ...(llmFields || {}) }

  return {
    fields: extracted,
    sources: (search.results || []).slice(0, 3).map((r) => ({ title: r.title, url: r.url })),
    error: search.error || null,
    provider: search.provider || null,
    llmUsed: Boolean(llmFields),
  }
}

function applyLeadEnrichment(lead, fields, overwrite = false) {
  const patch = {}
  fillIfEmpty(patch, 'website', fields.website, overwrite)
  fillIfEmpty(patch, 'phone', fields.phone, overwrite)
  fillIfEmpty(patch, 'industry', fields.industry, overwrite)
  fillIfEmpty(patch, 'description', fields.description, overwrite)
  fillIfEmpty(patch, 'numberOfEmployees', fields.numberOfEmployees, overwrite)
  fillIfEmpty(patch, 'annualRevenue', fields.annualRevenue, overwrite)

  const address = { ...(lead.address?.toObject?.() || lead.address || {}) }
  if (fields.city && (overwrite || !address.city)) address.city = fields.city
  if (fields.country && (overwrite || !address.country)) address.country = fields.country
  if (address.city || address.country) patch.address = address

  patch.lastEnrichedAt = new Date()
  patch.researchSummary = mergeResearchSummary(lead.researchSummary, {
    inferredData: fields,
    unknownData: [
      !fields.website ? 'website' : null,
      !fields.industry ? 'industry' : null,
      !fields.phone ? 'phone' : null,
    ].filter(Boolean),
    source: 'web-search',
    confidence: fields.website || fields.phone ? 70 : 45,
    researchedAt: new Date(),
  })
  Object.assign(lead, patch)
  attachIndustryMetadata(lead, patch)
  return patch
}

function applyAccountEnrichment(account, fields, overwrite = false) {
  const patch = {}
  fillIfEmpty(patch, 'website', fields.website, overwrite)
  fillIfEmpty(patch, 'phone', fields.phone, overwrite)
  fillIfEmpty(patch, 'description', fields.description, overwrite)
  if (fields.industry && (overwrite || !account.type)) patch.type = fields.industry

  const billing = { ...(account.billingAddress?.toObject?.() || account.billingAddress || {}) }
  if (fields.city && (overwrite || !billing.city)) billing.city = fields.city
  if (fields.country && (overwrite || !billing.country)) billing.country = fields.country
  if (billing.city || billing.country) patch.billingAddress = billing

  patch.lastEnrichedAt = new Date()
  patch.researchSummary = mergeResearchSummary(account.researchSummary, {
    inferredData: fields,
    unknownData: [
      !fields.website ? 'website' : null,
      !fields.phone ? 'phone' : null,
      !fields.industry ? 'industry' : null,
    ].filter(Boolean),
    source: 'web-search',
    confidence: fields.website || fields.phone ? 72 : 50,
    researchedAt: new Date(),
  })
  Object.assign(account, patch)
  attachIndustryMetadata(account, {
    industry: fields.industry,
    type: patch.type || account.type,
  }, { copyIndustryToType: true })
  return patch
}

function applyContactEnrichment(contact, fields, overwrite = false) {
  const patch = {}
  fillIfEmpty(patch, 'phone', fields.phone, overwrite)
  fillIfEmpty(patch, 'title', fields.title, overwrite)
  fillIfEmpty(patch, 'description', fields.description, overwrite)
  patch.lastEnrichedAt = new Date()
  patch.researchConfidence = fields.phone || fields.title ? 65 : 40
  patch.researchedAt = new Date()
  Object.assign(contact, patch)
  return patch
}

module.exports = {
  enrichFromQuery,
  applyLeadEnrichment,
  applyAccountEnrichment,
  applyContactEnrichment,
  extractFromText,
  extractWithLlm,
}
