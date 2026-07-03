const crypto = require('crypto')

const BLOCKED_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'facebook.com',
  'www.facebook.com',
  'fb.com',
])

const ALLOWED_PROXY_HOSTS = new Set([
  'kitco.com',
  'www.kitco.com',
  'reuters.com',
  'www.reuters.com',
  'bbc.com',
  'www.bbc.com',
  'bbc.co.uk',
  'www.bbc.co.uk',
  'livemint.com',
  'www.livemint.com',
  'economictimes.indiatimes.com',
  'goldenlakejewellery.com',
  'www.goldenlakejewellery.com',
  'coherentmarketinsights.com',
  'www.coherentmarketinsights.com',
  'news.google.com',
  'googleusercontent.com',
  'lh3.googleusercontent.com',
  'images.unsplash.com',
  'cdn.cnn.com',
  'media.cnn.com',
  'bloomberg.com',
  'www.bloomberg.com',
  'ft.com',
  'www.ft.com',
  'cnbc.com',
  'www.cnbc.com',
  'apnews.com',
  'www.apnews.com',
  'example.com',
])

function getSigningSecret() {
  return String(process.env.JWT_SECRET || process.env.IMAGE_PROXY_SECRET || 'dev-image-proxy-secret')
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function normalizeImageUrl(raw, pageUrl = '') {
  const decoded = decodeHtmlEntities(raw)
  if (!decoded) return ''

  try {
    if (/^https?:\/\//i.test(decoded)) {
      return new URL(decoded).toString()
    }
    if (pageUrl) {
      return new URL(decoded, pageUrl).toString()
    }
  } catch {
    return ''
  }
  return ''
}

function hostFromImageUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function isBlockedImageHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (BLOCKED_HOSTS.has(host)) return true
    if (host === 'news.google.com' && /favicon|logo|icon/i.test(url)) return true
    return false
  } catch {
    return true
  }
}

function isAllowedProxyHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    if (ALLOWED_PROXY_HOSTS.has(host) || ALLOWED_PROXY_HOSTS.has(`www.${host}`)) return true
  } catch {
    return false
  }
  return false
}

function extractMetaImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1]
  }
  return ''
}

async function verifyImageUrl(url) {
  const target = normalizeImageUrl(url)
  if (!target || !/^https:\/\//i.test(target)) return ''
  if (isBlockedImageHost(target)) return ''
  if (/^data:/i.test(target) || /\.svg(\?|$)/i.test(target)) return ''

  const tryFetch = async (method) => {
    const res = await fetch(target, {
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SalesManagerAI/1.0)',
        Accept: 'image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const type = String(res.headers.get('content-type') || '').toLowerCase()
    if (!type.startsWith('image/')) return null
    if (type.includes('svg')) return null
    return target
  }

  try {
    const head = await tryFetch('HEAD')
    if (head) return head
    return (await tryFetch('GET')) || ''
  } catch {
    return ''
  }
}

async function fetchPageImage(pageUrl) {
  const target = String(pageUrl || '').trim()
  if (!target || !/^https?:\/\//i.test(target)) return ''

  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SalesManagerAI/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    })
    if (!res.ok) return ''
    const html = await res.text()
    const raw = extractMetaImage(html)
    const normalized = normalizeImageUrl(raw, target)
    if (!normalized) return ''
    return verifyImageUrl(normalized)
  } catch {
    return ''
  }
}

function signImageProxyUrl(imageUrl) {
  const normalized = normalizeImageUrl(imageUrl)
  if (!normalized || !/^https:\/\//i.test(normalized)) return ''
  if (!isAllowedProxyHost(normalized)) return ''

  const u = Buffer.from(normalized, 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', getSigningSecret()).update(u).digest('base64url')
  return `/api/dashboard/image?u=${u}&sig=${sig}`
}

function verifyImageProxySig(u, sig) {
  if (!u || !sig) return false
  const expected = crypto.createHmac('sha256', getSigningSecret()).update(u).digest('base64url')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  } catch {
    return false
  }
}

function decodeProxiedImageUrl(u) {
  try {
    const decoded = Buffer.from(u, 'base64url').toString('utf8')
    return normalizeImageUrl(decoded)
  } catch {
    return ''
  }
}

async function resolveCardImageUrl({ imageUrl, sourceUrl }) {
  let candidate = normalizeImageUrl(imageUrl, sourceUrl)
  if (!candidate && sourceUrl) {
    candidate = await fetchPageImage(sourceUrl)
  }
  if (!candidate) return ''

  const verified = await verifyImageUrl(candidate)
  if (!verified) return ''

  const proxied = signImageProxyUrl(verified)
  return proxied || verified
}

async function fetchProxiedImage(imageUrl) {
  const target = normalizeImageUrl(imageUrl)
  if (!target || !isAllowedProxyHost(target)) {
    throw new Error('Image host not allowed')
  }

  const res = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SalesManagerAI/1.0)',
      Accept: 'image/*,*/*;q=0.8',
      Referer: new URL(target).origin,
    },
    signal: AbortSignal.timeout(10000),
    redirect: 'follow',
  })

  if (!res.ok) {
    throw new Error(`Upstream image HTTP ${res.status}`)
  }

  const contentType = String(res.headers.get('content-type') || 'image/jpeg')
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error('Upstream response is not an image')
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, contentType }
}

function buildSourceImageMap(searchBatches) {
  const map = new Map()
  for (const batch of searchBatches || []) {
    for (const r of batch.results || []) {
      if (r.url && r.imageUrl) {
        map.set(r.url, r.imageUrl)
      }
    }
  }
  return map
}

module.exports = {
  normalizeImageUrl,
  verifyImageUrl,
  fetchPageImage,
  isBlockedImageHost,
  isAllowedProxyHost,
  signImageProxyUrl,
  verifyImageProxySig,
  decodeProxiedImageUrl,
  resolveCardImageUrl,
  fetchProxiedImage,
  buildSourceImageMap,
}
