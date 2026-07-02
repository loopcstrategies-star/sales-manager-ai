const crypto = require('crypto')
const DashboardSnapshot = require('../models/DashboardSnapshot')
const { formatTavilyForPrompt } = require('./prompts')
const { runWebSearches, getSearchProvider, isSearchConfigured } = require('./webSearch')
const { createChatCompletion, isOpenAiConfigured } = require('./openAiClient')
const { getMetalsPrices } = require('./metalsPrices')
const {
  fetchRssHeadlines,
  fetchNewsApiHeadlines,
  buildDashboardQueries,
  hostFromUrl,
} = require('./newsFeeds')

function isDashboardEnabled() {
  return String(process.env.DASHBOARD_ENABLED || 'true').trim().toLowerCase() !== 'false'
}

function getRefreshHours() {
  return Math.max(1, Number(process.env.DASHBOARD_REFRESH_HOURS || 4))
}

function getCardCap() {
  return Math.min(24, Math.max(12, Number(process.env.DASHBOARD_CARD_CAP || 20)))
}

function isSnapshotStale(refreshedAt) {
  if (!refreshedAt) return true
  const ageMs = Date.now() - new Date(refreshedAt).getTime()
  return ageMs > getRefreshHours() * 60 * 60 * 1000
}

function cardId(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12)
}

function normalizeCard(raw, fallbackCategory = 'general') {
  const tags = Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 5) : []
  const publishedAt = raw.publishedAt ? new Date(raw.publishedAt) : undefined
  const validDate = publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : undefined

  return {
    id: raw.id || cardId(['card', raw.title, raw.sourceUrl]),
    title: String(raw.title || 'Market update').slice(0, 120),
    summary: String(raw.summary || '').slice(0, 600),
    category: raw.category === 'metals' ? 'metals' : 'general',
    type: raw.type === 'headline' ? 'headline' : 'analysis',
    sourceUrl: String(raw.sourceUrl || '').trim(),
    sourceName: String(raw.sourceName || hostFromUrl(raw.sourceUrl || '')).slice(0, 80),
    publishedAt: validDate,
    tags,
    imageUrl: String(raw.imageUrl || '').trim(),
  }
}

function buildCardsFromSources(searchBatches) {
  const cards = []
  const seen = new Set()
  const cap = getCardCap()

  for (const batch of searchBatches || []) {
    const category = batch.category || 'general'
    const batchTags = batch.tags || []

    if (batch.answer && !seen.has(`answer:${batch.query}`)) {
      seen.add(`answer:${batch.query}`)
      cards.push(normalizeCard({
        id: cardId(['answer', batch.query]),
        title: batch.query.slice(0, 80),
        summary: String(batch.answer).slice(0, 400),
        category,
        type: 'headline',
        sourceUrl: batch.results?.[0]?.url || '',
        sourceName: hostFromUrl(batch.results?.[0]?.url || ''),
        publishedAt: batch.publishedAt,
        tags: batchTags,
      }))
    }

    for (const r of batch.results || []) {
      if (!r.url || seen.has(r.url)) continue
      seen.add(r.url)
      cards.push(normalizeCard({
        id: cardId(['source', r.url]),
        title: r.title || 'Market update',
        summary: String(r.content || '').slice(0, 400),
        category,
        type: /news|today|breaking/i.test(r.title || '') ? 'headline' : 'analysis',
        sourceUrl: r.url,
        sourceName: hostFromUrl(r.url),
        publishedAt: batch.publishedAt,
        tags: batchTags,
      }))
      if (cards.length >= cap) break
    }
    if (cards.length >= cap) break
  }

  return cards.slice(0, cap)
}

async function summarizeCardsWithLlm(searchBatches) {
  const { text, sources } = formatTavilyForPrompt(searchBatches)
  if (!sources.length && !text.trim()) return []

  const system = [
    'You build a lively market research dashboard from web search, RSS, and news results.',
    'Return ONLY valid JSON: an array of 10-16 objects.',
    'Each object keys: title, summary, category, type, sourceUrl, tags, publishedAt.',
    'category: "metals" or "general".',
    'type: "headline" (1 sentence, breaking/today) or "analysis" (2-3 sentences, trend context).',
    'tags: array of 1-3 short strings e.g. ["gold","UAE"].',
    'publishedAt: ISO date string if known from sources, else omit.',
    'Prefer real breaking news headlines over generic market research reports.',
    'Use only sourceUrl values from the provided sources list.',
  ].join(' ')

  const content = await createChatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: `Research:\n${text}\n\nSources:\n${sources.map((s) => `- ${s.title} (${s.url})`).join('\n')}` },
  ], { temperature: 0.35, maxTokens: 3500 })

  const match = content.match(/\[[\s\S]*\]/)
  if (!match) return buildCardsFromSources(searchBatches)

  try {
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return buildCardsFromSources(searchBatches)
    return parsed
      .filter((c) => c && c.title && c.summary)
      .map((c, i) => normalizeCard({
        id: cardId(['llm', c.title, i]),
        title: c.title,
        summary: c.summary,
        category: c.category,
        type: c.type,
        sourceUrl: c.sourceUrl,
        sourceName: hostFromUrl(c.sourceUrl || ''),
        publishedAt: c.publishedAt,
        tags: c.tags,
      }))
      .slice(0, getCardCap())
  } catch {
    return buildCardsFromSources(searchBatches)
  }
}

async function fetchOgImage(url) {
  const target = String(url || '').trim()
  if (!target || !/^https?:\/\//i.test(target)) return ''
  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': 'SalesManagerAI/1.0' },
      signal: AbortSignal.timeout(4000),
    })
    const html = await res.text()
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

async function enrichCardImages(cards) {
  const withImages = await Promise.all(cards.map(async (card) => {
    if (card.imageUrl || !card.sourceUrl) return card
    const imageUrl = await fetchOgImage(card.sourceUrl)
    return imageUrl ? { ...card, imageUrl } : card
  }))
  return withImages
}

async function refreshDashboardFeed(options = {}) {
  if (!isDashboardEnabled()) {
    throw new Error('Dashboard is disabled.')
  }

  const region = String(options.region || '').trim().toLowerCase()
  const scope = region ? `region:${region}` : 'global'
  const queryDefs = buildDashboardQueries(region)
  const queries = queryDefs.map((q) => q.query)

  const [webResult, rssBatches, newsApiBatches] = await Promise.all([
    isSearchConfigured()
      ? runWebSearches(queries, { searchDepth: 'advanced' })
      : Promise.resolve({ batches: [], cacheHits: 0, provider: getSearchProvider() }),
    fetchRssHeadlines(),
    fetchNewsApiHeadlines(),
  ])

  const tavilyBatches = (webResult.batches || []).map((batch, i) => ({
    ...batch,
    category: queryDefs[i]?.category || 'general',
    tags: queryDefs[i]?.tags || [],
  }))

  const allBatches = [...rssBatches, ...newsApiBatches, ...tavilyBatches]
  const hasContent = allBatches.some((b) => (b.results || []).length || b.answer)

  let cards = []
  if (isOpenAiConfigured() && hasContent) {
    try {
      cards = await summarizeCardsWithLlm(allBatches)
    } catch (err) {
      console.warn('[dashboardFeed] LLM summarize failed:', err.message)
      cards = buildCardsFromSources(allBatches)
    }
  } else {
    cards = buildCardsFromSources(allBatches)
  }

  if (!cards.length) {
    cards = [normalizeCard({
      id: 'empty',
      title: 'No live market data',
      summary: isSearchConfigured()
        ? 'Search returned no results. Try Refresh now later or check TAVILY_API_KEY.'
        : 'Configure TAVILY_API_KEY on the server for live dashboard updates.',
      category: 'general',
      type: 'analysis',
      sourceUrl: '',
      tags: [],
    })]
  }

  cards = await enrichCardImages(cards.slice(0, getCardCap()))

  let priceTiles = []
  try {
    priceTiles = await getMetalsPrices()
  } catch (err) {
    console.warn('[dashboardFeed] metals prices failed:', err.message)
  }

  const refreshedAt = new Date()
  const snapshot = await DashboardSnapshot.findOneAndUpdate(
    { scope },
    {
      scope,
      region,
      cards,
      priceTiles,
      refreshedAt,
      searchProvider: webResult.provider,
      meta: {
        cacheHits: webResult.cacheHits,
        queryCount: queries.length,
        rssCount: rssBatches.length,
        newsApiCount: newsApiBatches.length,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()

  return snapshot
}

async function getLatestSnapshot(region = '') {
  const scope = region ? `region:${region}` : 'global'
  let snap = await DashboardSnapshot.findOne({ scope }).lean()
  if (!snap && scope !== 'global') {
    snap = await DashboardSnapshot.findOne({ scope: 'global' }).lean()
  }
  return snap
}

async function getDashboardFeed({ forceRefresh = false, region = '' } = {}) {
  const latest = await getLatestSnapshot(region)
  const stale = isSnapshotStale(latest?.refreshedAt)

  if (forceRefresh || !latest || stale) {
    return refreshDashboardFeed({ region })
  }

  return latest
}

module.exports = {
  buildDashboardQueries,
  isDashboardEnabled,
  getRefreshHours,
  getCardCap,
  isSnapshotStale,
  refreshDashboardFeed,
  getLatestSnapshot,
  getDashboardFeed,
  buildCardsFromSources,
  normalizeCard,
}
