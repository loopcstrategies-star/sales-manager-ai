const NOISE_HOSTS = new Set([
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'linkedin.com',
  'wikipedia.org',
  'medium.com',
  'reddit.com',
  'pinterest.com',
  'quora.com',
  'tumblr.com',
  'threads.net',
  'economictimes.indiatimes.com',
  'indiatimes.com',
  'timesofindia.indiatimes.com',
  'hindustantimes.com',
  'thehindu.com',
  'ndtv.com',
  'bbc.com',
  'bbc.co.uk',
  'cnn.com',
  'nytimes.com',
  'forbes.com',
  'bloomberg.com',
  'reuters.com',
  'businessinsider.com',
  'techcrunch.com',
  'tripadvisor.com',
  'yelp.com',
  'amazon.com',
  'ebay.com',
  'alibaba.com',
  'aliexpress.com',
  'google.com',
  'maps.google.com',
  'goo.gl',
  'gulfnews.com',
  'gulftoday.ae',
  'khaleejtimes.com',
  'thenationalnews.com',
  'arabianbusiness.com',
  '2gis.ae',
  '2gis.com',
  'yellowpages.com',
  'yelp.ae',
  'glassdoor.com',
  'indeed.com',
  'crunchbase.com',
  'ycombinator.com',
  'producthunt.com',
  'stackoverflow.com',
  'github.com',
  'wordpress.com',
  'blogspot.com',
  'wixsite.com',
  'lbma.org.uk',
  'investopedia.com',
  'wikihow.com',
])

const LISTICLE_RE = /\b(top\s+\d+|best\s+\d+|checklist|how\s+to|awards?|list\s+of|importing\s+.+\s+from|things\s+to\s+know|ultimate\s+guide|buyer'?s?\s+guide|guide\s+to|tips?\s*&\s*insights|tips\s+and\s+insights|chapter\s+\d+)\b/i
const ARTICLE_NOISE_RE = /\b(blog|news|article|magazine|editorial|opinion|insights)\b/i
const QUESTION_RE = /\?$|^(who|what|where|when|why|how|any|are there|is there)\b/i

const DEFAULT_PROSPECT_QUERIES = [
  'jewelry manufacturers',
  'gold wholesale suppliers',
  'diamond trading companies',
  'precious metals bullion dealers',
  'jewellery exporters',
]

const REGION_PRESETS = [
  { value: '', label: 'Worldwide' },
  { value: 'Middle East', label: 'Middle East' },
  { value: 'Europe', label: 'Europe' },
  { value: 'India', label: 'India' },
  { value: 'Asia Pacific', label: 'Asia Pacific' },
  { value: 'Americas', label: 'Americas' },
  { value: 'Africa', label: 'Africa' },
]

function hostnameOf(url) {
  try {
    return new URL(String(url || '').trim()).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    const raw = String(url || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
    return raw || ''
  }
}

function isNoiseHost(url) {
  const host = hostnameOf(url)
  if (!host) return false
  if (NOISE_HOSTS.has(host)) return true
  for (const blocked of NOISE_HOSTS) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return true
  }
  return false
}

function looksLikeListicle(title) {
  const t = String(title || '').trim()
  if (!t) return true
  if (QUESTION_RE.test(t)) return true
  if (LISTICLE_RE.test(t)) return true
  if (ARTICLE_NOISE_RE.test(t) && (t.includes('|') || t.includes(' - ') || t.length > 70)) return true
  if (t.length > 90 && /\d{4}/.test(t)) return true
  return false
}

function titleCaseBrand(slug) {
  const parts = String(slug || '')
    .split(/[-_]+/)
    .filter(Boolean)
  if (!parts.length) return 'Prospect'
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ')
    .slice(0, 200)
}

function brandFromHostname(url) {
  const host = hostnameOf(url)
  if (!host) return ''
  const labels = host.split('.').filter(Boolean)
  let brand = labels[0] || ''
  if (labels.length >= 3 && ['co', 'com', 'org', 'net', 'gov', 'ac'].includes(labels[labels.length - 2])) {
    brand = labels[labels.length - 3] || brand
  } else if (labels.length >= 2) {
    brand = labels[labels.length - 2] || brand
  }
  return titleCaseBrand(brand)
}

function cleanTitle(title) {
  let t = String(title || '').trim()
  t = t.replace(/\s*[-|–—:]\s*.+$/, '').trim()
  t = t.replace(/^(top|best)\s+\d+\s+/i, '').trim()
  return t.slice(0, 200)
}

function isWeakCompanyName(name) {
  const n = String(name || '').trim()
  if (!n || n.length < 2) return true
  if (looksLikeListicle(n)) return true
  if (n.split(/\s+/).length > 8) return true
  return false
}

function companyName(title, url) {
  const cleaned = cleanTitle(title)
  if (!isWeakCompanyName(cleaned)) return cleaned.slice(0, 200)
  const fromHost = brandFromHostname(url)
  if (fromHost) return fromHost
  return cleaned || 'Prospect'
}

/** Prefer company homepage over deep article/search paths. */
function companyWebsiteUrl(url) {
  try {
    const u = new URL(String(url || '').trim())
    if (!u.hostname) return String(url || '').trim().slice(0, 300)
    return `${u.protocol}//${u.hostname}/`.slice(0, 300)
  } catch {
    return String(url || '').trim().slice(0, 300)
  }
}

function withRegion(query, region) {
  const q = String(query || '').trim()
  const r = String(region || '').trim()
  if (!q) return ''
  if (!r || /^worldwide$/i.test(r)) return q
  if (new RegExp(`\\b${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(q)) return q
  return `${q} ${r}`
}

/**
 * @param {{ title?: string, url?: string, snippet?: string }} hit
 */
function assessProspect(hit) {
  const title = String(hit?.title || '').trim()
  const url = String(hit?.url || '').trim()
  const host = hostnameOf(url)
  const name = companyName(title, url)

  if (!url && !title) {
    return { ok: false, reason: 'empty', companyName: name, score: 0, host }
  }
  if (isNoiseHost(url)) {
    return { ok: false, reason: 'noise_host', companyName: name, score: 0, host }
  }
  if (looksLikeListicle(title)) {
    return { ok: false, reason: 'listicle', companyName: name, score: 0, host }
  }

  let score = 50
  if (host) score += 20
  if (!isWeakCompanyName(cleanTitle(title))) score += 20
  if (title.length < 60) score += 10
  try {
    const path = new URL(url).pathname || '/'
    if (path === '/' || path === '') score += 15
  } catch { /* ignore */ }
  return { ok: true, reason: null, companyName: name, score, host }
}

function isImportableProspect(hit) {
  return assessProspect(hit).ok
}

module.exports = {
  NOISE_HOSTS,
  DEFAULT_PROSPECT_QUERIES,
  REGION_PRESETS,
  hostnameOf,
  isNoiseHost,
  looksLikeListicle,
  companyName,
  brandFromHostname,
  companyWebsiteUrl,
  withRegion,
  assessProspect,
  isImportableProspect,
}
