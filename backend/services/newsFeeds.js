const Parser = require('rss-parser')
const { REGION_KEYWORDS } = require('./prompts')

const parser = new Parser({ timeout: 10000 })

const RSS_FEEDS = [
  { url: 'https://www.kitco.com/rss/kitco-news.xml', category: 'metals', tags: ['gold', 'metals'] },
  { url: 'https://feeds.reuters.com/reuters/businessNews', category: 'general', tags: ['business'] },
]

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

async function fetchRssHeadlines() {
  const items = []
  await Promise.all(RSS_FEEDS.map(async (feed) => {
    try {
      const parsed = await parser.parseURL(feed.url)
      for (const entry of (parsed.items || []).slice(0, 5)) {
        if (!entry.link && !entry.title) continue
        items.push({
          query: `rss:${feed.url}`,
          category: feed.category,
          tags: feed.tags,
          results: [{
            title: String(entry.title || '').trim(),
            url: String(entry.link || entry.guid || '').trim(),
            content: String(entry.contentSnippet || entry.summary || '').slice(0, 1200),
          }],
          answer: null,
          publishedAt: entry.isoDate || entry.pubDate || null,
          provider: 'rss',
        })
      }
    } catch (err) {
      console.warn('[rssFeeds] failed:', feed.url, err.message)
    }
  }))
  return items
}

async function fetchNewsApiHeadlines() {
  const apiKey = String(process.env.NEWSAPI_KEY || '').trim()
  if (!apiKey) return []

  const queries = [
    { q: 'gold OR silver OR jewelry', category: 'metals', tags: ['gold', 'metals'] },
    { q: 'business OR wholesale OR B2B sales', category: 'general', tags: ['business', 'B2B'] },
  ]

  const batches = []
  for (const { q, category, tags } of queries) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=5&apiKey=${apiKey}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.status !== 'ok') continue

      const results = (data.articles || []).map((a) => ({
        title: String(a.title || '').trim(),
        url: String(a.url || '').trim(),
        content: String(a.description || '').slice(0, 1200),
      })).filter((r) => r.url)

      if (results.length) {
        batches.push({
          query: `newsapi:${q}`,
          category,
          tags,
          results,
          answer: null,
          publishedAt: data.articles[0]?.publishedAt || null,
          provider: 'newsapi',
        })
      }
    } catch (err) {
      console.warn('[newsApi] failed:', err.message)
    }
  }
  return batches
}

function getRegionSuffix(region) {
  const key = String(region || '').trim().toLowerCase()
  return REGION_KEYWORDS[key] || (key ? key : '')
}

function buildDashboardQueries(region = '') {
  const suffix = getRegionSuffix(region)
  const regionBit = suffix ? ` ${suffix}` : ''

  const all = [
    { category: 'metals', query: `gold price news today Kitco Reuters${regionBit}`, tags: ['gold', 'news'] },
    { category: 'metals', query: `jewelry wholesale UAE Dubai gold news this week${regionBit}`, tags: ['jewelry', 'UAE'] },
    { category: 'metals', query: `silver precious metals market breaking news today${regionBit}`, tags: ['silver', 'metals'] },
    { category: 'metals', query: `LBMA gold hallmark wholesale trends${regionBit}`, tags: ['gold', 'wholesale'] },
    { category: 'general', query: 'global stock market business news today headlines', tags: ['macro', 'markets'] },
    { category: 'general', query: 'B2B sales trade news breaking today', tags: ['B2B', 'sales'] },
    { category: 'general', query: 'world economy business news this week', tags: ['economy'] },
    { category: 'general', query: 'wholesale distribution trade trends news', tags: ['wholesale', 'trade'] },
  ]

  const cap = Math.min(8, Math.max(4, Number(process.env.DASHBOARD_QUERY_COUNT || 8)))
  return all.slice(0, cap)
}

module.exports = {
  fetchRssHeadlines,
  fetchNewsApiHeadlines,
  buildDashboardQueries,
  hostFromUrl,
}
