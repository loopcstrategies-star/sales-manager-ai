const MAX_RESULTS = 5

function shouldUseAdvancedSearchDepth(userMessage, chatInputs = {}) {
  if (String(chatInputs.depth || '').toLowerCase() === 'deep') return true
  const msg = String(userMessage || '')
  return /regulat|competitor|compliance|sanction|import duty|market entry|deep dive|hallmark|lbma/i.test(msg)
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

    return { query, results, answer: data.answer || null }
  } catch (err) {
    return { query, results: [], error: err?.message || 'Tavily search failed' }
  }
}

async function runTavilySearches(queries = [], options = {}) {
  const cap = Math.max(1, Math.min(Number(process.env.SALES_AI_MAX_TAVILY_SEARCHES) || 4, 5))
  const unique = [...new Set(queries.map((q) => String(q || '').trim()).filter(Boolean))].slice(0, cap)
  const searchDepth = options.searchDepth === 'advanced' ? 'advanced' : 'basic'
  return Promise.all(unique.map((query) => tavilySearch(query, { searchDepth })))
}

module.exports = {
  tavilySearch,
  runTavilySearches,
  shouldUseAdvancedSearchDepth,
}
