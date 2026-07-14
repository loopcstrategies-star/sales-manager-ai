/**
 * Optional Hunter.io domain search. Requires HUNTER_API_KEY.
 * Docs: https://hunter.io/api-documentation#domain-search
 */

function isHunterConfigured() {
  return Boolean(String(process.env.HUNTER_API_KEY || '').trim())
}

function hostnameFromUrl(website) {
  try {
    return new URL(String(website || '').trim()).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return String(website || '')
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .toLowerCase()
  }
}

async function hunterDomainSearch(domainOrUrl, { limit = 10 } = {}) {
  const apiKey = String(process.env.HUNTER_API_KEY || '').trim()
  if (!apiKey) {
    return { ok: false, error: 'HUNTER_API_KEY is not configured.', people: [] }
  }
  const domain = hostnameFromUrl(domainOrUrl)
  if (!domain) {
    return { ok: false, error: 'Need a company website/domain.', people: [] }
  }

  const url = new URL('https://api.hunter.io/v2/domain-search')
  url.searchParams.set('domain', domain)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('limit', String(Math.max(1, Math.min(limit, 20))))

  const res = await fetch(url.toString())
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.errors?.[0]?.details || data?.error || `Hunter HTTP ${res.status}`
    return { ok: false, error: String(msg), people: [], domain }
  }

  const emails = Array.isArray(data?.data?.emails) ? data.data.emails : []
  const people = emails.slice(0, limit).map((e) => ({
    firstName: String(e.first_name || '').trim(),
    lastName: String(e.last_name || e.value?.split('@')[0] || 'Contact').trim(),
    email: String(e.value || '').trim().toLowerCase(),
    phone: '',
    title: String(e.position || '').trim(),
    confidence: e.confidence,
  })).filter((p) => p.email)

  return {
    ok: true,
    error: null,
    domain,
    organization: data?.data?.organization || '',
    people,
    meta: { results: data?.meta?.results, limit: data?.meta?.limit },
  }
}

module.exports = {
  isHunterConfigured,
  hunterDomainSearch,
  hostnameFromUrl,
}
