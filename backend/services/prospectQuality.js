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
])

const LISTICLE_RE = /\b(top\s+\d+|best\s+\d+|checklist|how\s+to|awards?|list\s+of|importing\s+.+\s+from|things\s+to\s+know|ultimate\s+guide|buyer'?s?\s+guide|guide\s+to)\b/i
const ARTICLE_NOISE_RE = /\b(blog|news|article|magazine|editorial|opinion)\b/i

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
  // drop common public suffixes (naive 2-label: example.com / example.co.uk approx)
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

/**
 * @param {{ title?: string, url?: string, snippet?: string }} hit
 * @returns {{ ok: boolean, reason: string|null, companyName: string, score: number, host: string }}
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
  return { ok: true, reason: null, companyName: name, score, host }
}

function isImportableProspect(hit) {
  return assessProspect(hit).ok
}

module.exports = {
  NOISE_HOSTS,
  hostnameOf,
  isNoiseHost,
  looksLikeListicle,
  companyName,
  brandFromHostname,
  assessProspect,
  isImportableProspect,
}
