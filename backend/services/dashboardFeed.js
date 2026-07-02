const crypto = require('crypto')
const DashboardSnapshot = require('../models/DashboardSnapshot')
const { formatTavilyForPrompt } = require('./prompts')
const { runWebSearches, getSearchProvider, isSearchConfigured } = require('./webSearch')
const { createChatCompletion, isOpenAiConfigured } = require('./openAiClient')

const DASHBOARD_QUERIES = [
  { category: 'metals', query: 'gold silver precious metals jewelry market trends wholesale' },
  { category: 'metals', query: 'UAE GCC gold jewelry demand market news' },
  { category: 'general', query: 'global business sales market news today' },
  { category: 'general', query: 'B2B wholesale trade economic trends' },
]

function isDashboardEnabled() {
  return String(process.env.DASHBOARD_ENABLED || 'true').trim().toLowerCase() !== 'false'
}

function getRefreshHours() {
  return Math.max(1, Number(process.env.DASHBOARD_REFRESH_HOURS || 4))
}

function isSnapshotStale(refreshedAt) {
  if (!refreshedAt) return true
  const ageMs = Date.now() - new Date(refreshedAt).getTime()
  return ageMs > getRefreshHours() * 60 * 60 * 1000
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function cardId(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12)
}

function buildCardsFromSources(searchBatches) {
  const cards = []
  const seen = new Set()

  for (const batch of searchBatches || []) {
    const category = batch.category || 'general'
    if (batch.answer && !seen.has(`answer:${batch.query}`)) {
      seen.add(`answer:${batch.query}`)
      cards.push({
        id: cardId(['answer', batch.query]),
        title: batch.query.slice(0, 80),
        summary: String(batch.answer).slice(0, 400),
        category,
        sourceUrl: batch.results?.[0]?.url || '',
        sourceName: hostFromUrl(batch.results?.[0]?.url || ''),
      })
    }
    for (const r of batch.results || []) {
      if (!r.url || seen.has(r.url)) continue
      seen.add(r.url)
      cards.push({
        id: cardId(['source', r.url]),
        title: r.title || 'Market update',
        summary: String(r.content || '').slice(0, 400),
        category,
        sourceUrl: r.url,
        sourceName: hostFromUrl(r.url),
      })
      if (cards.filter((c) => c.category === category).length >= 4) break
    }
  }

  return cards.slice(0, 12)
}

async function summarizeCardsWithLlm(searchBatches) {
  const { text, sources } = formatTavilyForPrompt(searchBatches)
  if (!sources.length && !text.trim()) return []

  const system = [
    'You build a market research dashboard from web search results.',
    'Return ONLY valid JSON: an array of 6-10 objects with keys: title, summary, category, sourceUrl.',
    'category must be "metals" or "general".',
    'summary: 2-3 sentences. Use only information from the research; cite real sourceUrl from results.',
    'Prefer metals/jewelry cards for metals category and business/sales for general.',
  ].join(' ')

  const content = await createChatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: `Research:\n${text}\n\nSources:\n${sources.map((s) => `- ${s.title} (${s.url})`).join('\n')}` },
  ], { temperature: 0.3, maxTokens: 2500 })

  const match = content.match(/\[[\s\S]*\]/)
  if (!match) return buildCardsFromSources(searchBatches)

  try {
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return buildCardsFromSources(searchBatches)
    return parsed
      .filter((c) => c && c.title && c.summary)
      .map((c, i) => ({
        id: cardId(['llm', c.title, i]),
        title: String(c.title).slice(0, 120),
        summary: String(c.summary).slice(0, 500),
        category: c.category === 'metals' ? 'metals' : 'general',
        sourceUrl: String(c.sourceUrl || '').trim(),
        sourceName: hostFromUrl(c.sourceUrl || ''),
      }))
      .slice(0, 12)
  } catch {
    return buildCardsFromSources(searchBatches)
  }
}

async function refreshDashboardFeed() {
  if (!isDashboardEnabled()) {
    throw new Error('Dashboard is disabled.')
  }

  const queries = DASHBOARD_QUERIES.map((q) => q.query)
  const { batches, cacheHits, provider } = isSearchConfigured()
    ? await runWebSearches(queries, { searchDepth: 'basic' })
    : { batches: [], cacheHits: 0, provider: getSearchProvider() }

  const enrichedBatches = batches.map((batch, i) => ({
    ...batch,
    category: DASHBOARD_QUERIES[i]?.category || 'general',
  }))

  let cards = []
  if (isOpenAiConfigured() && enrichedBatches.some((b) => (b.results || []).length || b.answer)) {
    try {
      cards = await summarizeCardsWithLlm(enrichedBatches)
    } catch (err) {
      console.warn('[dashboardFeed] LLM summarize failed:', err.message)
      cards = buildCardsFromSources(enrichedBatches)
    }
  } else {
    cards = buildCardsFromSources(enrichedBatches)
  }

  if (!cards.length) {
    cards = [{
      id: 'empty',
      title: 'No live market data',
      summary: isSearchConfigured()
        ? 'Search returned no results. Try Refresh now later or check TAVILY_API_KEY.'
        : 'Configure TAVILY_API_KEY on the server for live dashboard updates.',
      category: 'general',
      sourceUrl: '',
      sourceName: '',
    }]
  }

  const refreshedAt = new Date()
  const snapshot = await DashboardSnapshot.findOneAndUpdate(
    { scope: 'global' },
    {
      scope: 'global',
      cards,
      refreshedAt,
      searchProvider: provider,
      meta: { cacheHits, queryCount: queries.length },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()

  return snapshot
}

async function getLatestSnapshot() {
  return DashboardSnapshot.findOne({ scope: 'global' }).lean()
}

async function getDashboardFeed({ forceRefresh = false } = {}) {
  const latest = await getLatestSnapshot()
  const stale = isSnapshotStale(latest?.refreshedAt)

  if (forceRefresh || !latest || stale) {
    return refreshDashboardFeed()
  }

  return latest
}

module.exports = {
  DASHBOARD_QUERIES,
  isDashboardEnabled,
  getRefreshHours,
  isSnapshotStale,
  refreshDashboardFeed,
  getLatestSnapshot,
  getDashboardFeed,
  buildCardsFromSources,
}
