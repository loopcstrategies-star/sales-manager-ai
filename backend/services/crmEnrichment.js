const { searchWithCache } = require('./webSearch')

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

async function enrichFromQuery(query) {
  const search = await searchWithCache(query, { maxResults: 5, searchDepth: 'basic' })
  const parts = []
  if (search.answer) parts.push(search.answer)
  ;(search.results || []).forEach((r) => {
    parts.push(`${r.title || ''} ${r.content || ''} ${r.url || ''}`)
  })
  const blob = parts.join('\n')
  const extracted = extractFromText(blob)
  if (!extracted.website && search.results?.[0]?.url) {
    extracted.website = search.results[0].url
  }
  if (!extracted.description && search.answer) {
    extracted.description = String(search.answer).slice(0, 2000)
  } else if (!extracted.description && search.results?.[0]?.content) {
    extracted.description = String(search.results[0].content).slice(0, 2000)
  }
  return {
    fields: extracted,
    sources: (search.results || []).slice(0, 3).map((r) => ({ title: r.title, url: r.url })),
    error: search.error || null,
    provider: search.provider || null,
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
  Object.assign(lead, patch)
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
  Object.assign(account, patch)
  return patch
}

function applyContactEnrichment(contact, fields, overwrite = false) {
  const patch = {}
  fillIfEmpty(patch, 'phone', fields.phone, overwrite)
  fillIfEmpty(patch, 'title', fields.title, overwrite)
  fillIfEmpty(patch, 'description', fields.description, overwrite)
  patch.lastEnrichedAt = new Date()
  Object.assign(contact, patch)
  return patch
}

module.exports = {
  enrichFromQuery,
  applyLeadEnrichment,
  applyAccountEnrichment,
  applyContactEnrichment,
}
