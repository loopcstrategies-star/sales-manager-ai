/**
 * Lightweight HTML → text fetch for Contact find (About / Contact pages).
 * Uses native fetch; no Cheerio dependency.
 */

function normalizeWebsite(website) {
  let raw = String(website || '').trim()
  if (!raw) return ''
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
  try {
    const u = new URL(raw)
    if (!['http:', 'https:'].includes(u.protocol)) return ''
    return `${u.protocol}//${u.host}`
  } catch {
    return ''
  }
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchUrlText(url, { timeoutMs = 6000, maxChars = 5000 } = {}) {
  const target = String(url || '').trim()
  if (!target || !/^https?:\/\//i.test(target)) return ''
  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SalesManagerAI/1.0; +https://sales.loopcstrategies.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    })
    if (!res.ok) return ''
    const ctype = String(res.headers.get('content-type') || '')
    if (ctype && !/html|text|xml/i.test(ctype)) return ''
    const html = await res.text()
    return htmlToText(html).slice(0, maxChars)
  } catch {
    return ''
  }
}

/**
 * Fetch homepage + common contact/about paths. Returns combined text and URLs used.
 */
async function fetchCompanySiteText(website, { maxTotalChars = 10000 } = {}) {
  const base = normalizeWebsite(website)
  if (!base) return { text: '', urls: [] }

  const paths = ['', '/contact', '/contact-us', '/about', '/about-us', '/team']
  const urls = []
  const chunks = []
  let remaining = maxTotalChars

  for (const path of paths) {
    if (remaining <= 200) break
    const url = `${base}${path}`
    const text = await fetchUrlText(url, { maxChars: Math.min(4500, remaining) })
    if (!text || text.length < 40) continue
    urls.push(url)
    chunks.push(`--- Page: ${url} ---\n${text}`)
    remaining -= text.length
    if (urls.length >= 3) break
  }

  return {
    text: chunks.join('\n\n').slice(0, maxTotalChars),
    urls,
  }
}

module.exports = {
  normalizeWebsite,
  htmlToText,
  fetchUrlText,
  fetchCompanySiteText,
}
