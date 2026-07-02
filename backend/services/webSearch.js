const crypto = require('crypto')
const mongoose = require('mongoose')
const SearchCache = require('../models/SearchCache')

const MAX_RESULTS = 5

function getSearchProvider() {
  return String(process.env.SEARCH_PROVIDER || 'tavily').trim().toLowerCase()
}

function shouldUseAdvancedSearchDepth(userMessage, chatInputs = {}) {
  if (String(chatInputs.depth || '').toLowerCase() === 'deep') return true
  const msg = String(userMessage || '')
  return /regulat|competitor|compliance|sanction|import duty|market entry|deep dive|hallmark|lbma/i.test(msg)
}

function buildCacheKey(query, provider, searchDepth) {
  const raw = `${provider}|${searchDepth}|${String(query || '').trim().toLowerCase()}`
  return crypto.createHash('sha256').update(raw).digest('hex')
}

async function readCache(cacheKey) {
  if (mongoose.connection.readyState !== 1) return null
  try {
    const doc = await SearchCache.findOne({
      cacheKey,
      expiresAt: { $gt: new Date() },
    }).lean()
    return doc?.payload || null
  } catch {
    return null
  }
}

async function writeCache(cacheKey, query, provider, searchDepth, payload) {
  if (mongoose.connection.readyState !== 1) return
  const ttlHours = Math.max(1, Number(process.env.SEARCH_CACHE_TTL_HOURS || 24))
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)
  try {
    await SearchCache.findOneAndUpdate(
      { cacheKey },
      { cacheKey, query, provider, searchDepth, payload, expiresAt },
      { upsert: true, new: true },
    )
  } catch (err) {
    console.warn('[webSearch] cache write failed:', err.message)
  }
}

async function tavilySearch(query, options = {}) {
  const apiKey = String(process.env.TAVILY_API_KEY || '').trim()
  if (!apiKey) {
    return { query, results: [], error: 'TAVILY_API_KEY is not configured.' }
  }

  const maxResults = Math.min(Number(options.maxResults) || MAX_RESULTS, 10)
  const searchDepth = options.searchDepth === 'advanced' ? 'advanced' : 'basic'

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: String(query || '').trim().slice(0, 400),
        search_depth: searchDepth,
        include_answer: true,
        max_results: maxResults,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { query, results: [], error: `Tavily HTTP ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = await res.json()
    const results = (data.results || []).map((item) => ({
      title: String(item.title || '').trim(),
      url: String(item.url || '').trim(),
      content: String(item.content || '').trim().slice(0, 1200),
    })).filter((item) => item.url)

    return { query, results, answer: data.answer || null, provider: 'tavily' }
  } catch (err) {
    return { query, results: [], error: err?.message || 'Tavily search failed' }
  }
}

async function braveSearch(query, options = {}) {
  const apiKey = String(process.env.BRAVE_API_KEY || '').trim()
  if (!apiKey) {
    return { query, results: [], error: 'BRAVE_API_KEY is not configured.' }
  }

  const maxResults = Math.min(Number(options.maxResults) || MAX_RESULTS, 10)
  const q = encodeURIComponent(String(query || '').trim().slice(0, 400))

  try {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${q}&count=${maxResults}`, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      return { query, results: [], error: `Brave HTTP ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = await res.json()
    const results = (data.web?.results || []).map((item) => ({
      title: String(item.title || '').trim(),
      url: String(item.url || '').trim(),
      content: String(item.description || '').trim().slice(0, 1200),
    })).filter((item) => item.url)

    return { query, results, answer: null, provider: 'brave' }
  } catch (err) {
    return { query, results: [], error: err?.message || 'Brave search failed' }
  }
}

async function executeSearch(query, options = {}) {
  const provider = options.provider || getSearchProvider()
  if (provider === 'brave') return braveSearch(query, options)
  return tavilySearch(query, options)
}

async function searchWithCache(query, options = {}) {
  const provider = options.provider || getSearchProvider()
  const searchDepth = options.searchDepth === 'advanced' ? 'advanced' : 'basic'
  const key = buildCacheKey(query, provider, searchDepth)

  const cached = await readCache(key)
  if (cached) {
    return { ...cached, fromCache: true }
  }

  const result = await executeSearch(query, { ...options, provider, searchDepth })
  if (!result.error && (result.results?.length || result.answer)) {
    await writeCache(key, query, provider, searchDepth, result)
  }
  return { ...result, fromCache: false }
}

async function runWebSearches(queries = [], options = {}) {
  const cap = Math.max(1, Math.min(Number(process.env.SALES_AI_MAX_TAVILY_SEARCHES) || 2, 5))
  const unique = [...new Set(queries.map((q) => String(q || '').trim()).filter(Boolean))].slice(0, cap)
  const searchDepth = options.searchDepth === 'advanced' ? 'advanced' : 'basic'
  const provider = getSearchProvider()

  const batches = await Promise.all(
    unique.map((query) => searchWithCache(query, { searchDepth, provider })),
  )

  const cacheHits = batches.filter((b) => b.fromCache).length
  return { batches, cacheHits, provider }
}

function isSearchConfigured() {
  const provider = getSearchProvider()
  if (provider === 'brave') {
    return Boolean(String(process.env.BRAVE_API_KEY || '').trim())
  }
  return Boolean(String(process.env.TAVILY_API_KEY || '').trim())
}

module.exports = {
  getSearchProvider,
  shouldUseAdvancedSearchDepth,
  runWebSearches,
  searchWithCache,
  isSearchConfigured,
  // Legacy exports
  runTavilySearches: async (queries, options) => {
    const { batches } = await runWebSearches(queries, options)
    return batches
  },
  tavilySearch,
}
