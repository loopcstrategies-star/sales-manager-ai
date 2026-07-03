const REGION_KEYWORDS = {
  uzbekistan: 'Uzbekistan Central Asia',
  uae: 'UAE Dubai gold market',
  gcc: 'GCC Gulf gold jewelry',
  turkey: 'Turkey jewelry export',
  india: 'India gold jewelry demand',
  china: 'China gold demand',
}

function isSalesDomainQuestion(userMessage) {
  const msg = String(userMessage || '').toLowerCase()
  return /gold|silver|jewelry|jewellery|precious metal|bullion|wholesale|pipeline|crm|deal|lead|sales|market trend|customer demand|opportunit|hallmark|lbma|gemstone|diamond/i.test(msg)
}

function isSimpleQuestion(userMessage) {
  const msg = String(userMessage || '').trim()
  if (msg.length > 120) return false
  const complex = /competitor|rival|versus|vs\b|regulat|compliance|sanction|pipeline|crm|deal|lead|opportunit|growth|expand|market entry|compare|versus/i
  return !complex.test(msg)
}

function buildGeneralQueries(userMessage, options = {}) {
  const msg = String(userMessage || '').trim()
  const base = msg.slice(0, 200)
  const region = String(options.region || '').trim().toLowerCase()
  const constraints = String(options.constraints || '').trim()
  const regionSuffix = REGION_KEYWORDS[region] || (region ? region : '')

  if (isSimpleQuestion(msg) && !constraints) {
    return [regionSuffix ? `${base} ${regionSuffix}` : base]
  }

  const queries = [regionSuffix ? `${base} ${regionSuffix}` : base]
  if (/competitor|rival|versus|vs\b/i.test(msg)) {
    queries.push(`${base} competitor analysis${regionSuffix ? ` ${regionSuffix}` : ''}`)
  } else if (/regulat|compliance|sanction|import duty/i.test(msg)) {
    queries.push(`${base} regulations compliance${regionSuffix ? ` ${regionSuffix}` : ''}`)
  } else if (/opportunit|growth|expand|market entry/i.test(msg)) {
    queries.push(`${base} market opportunities outlook${regionSuffix ? ` ${regionSuffix}` : ''}`)
  } else {
    queries.push(`${base} latest news analysis 2025 2026${regionSuffix ? ` ${regionSuffix}` : ''}`)
  }
  if (constraints) {
    queries.push(`${base} ${constraints.slice(0, 120)}${regionSuffix ? ` ${regionSuffix}` : ''}`)
  }
  return queries
}

function buildDomainQueries(userMessage, options = {}) {
  const msg = String(userMessage || '').trim()
  const base = msg.slice(0, 200)
  const region = String(options.region || '').trim().toLowerCase()
  const constraints = String(options.constraints || '').trim()
  const regionSuffix = REGION_KEYWORDS[region] || (region ? `${region} gold jewelry market` : '')

  if (isSimpleQuestion(msg) && !constraints) {
    return [`${base} precious metals jewelry market${regionSuffix ? ` ${regionSuffix}` : ''}`]
  }

  const queries = [
    `${base} precious metals jewelry market trends 2025 2026${regionSuffix ? ` ${regionSuffix}` : ''}`,
    `${base} gold silver industry demand outlook${regionSuffix ? ` ${regionSuffix}` : ''}`,
  ]

  if (/competitor|rival|versus|vs\b/i.test(msg)) {
    queries.push(`${base} precious metals jewelry competitor analysis${regionSuffix ? ` ${regionSuffix}` : ''}`)
  } else if (/regulat|compliance|sanction|import duty|hallmark/i.test(msg)) {
    queries.push(`${base} gold jewelry import regulations trade compliance${regionSuffix ? ` ${regionSuffix}` : ''}`)
  } else if (/pipeline|crm|deal|lead|customer/i.test(msg)) {
    queries.push(`${base} B2B sales strategy precious metals wholesale`)
  } else if (/opportunit|growth|expand|market entry/i.test(msg)) {
    queries.push(`${base} new market opportunities gold jewelry wholesale${regionSuffix ? ` ${regionSuffix}` : ''}`)
  } else {
    queries.push(`${base} market size growth forecast jewelry metals${regionSuffix ? ` ${regionSuffix}` : ''}`)
  }

  if (constraints) {
    queries.push(`${base} ${constraints.slice(0, 120)} precious metals jewelry${regionSuffix ? ` ${regionSuffix}` : ''}`)
  }

  return queries
}

function buildSearchQueries(userMessage, options = {}) {
  if (isSalesDomainQuestion(userMessage)) {
    return buildDomainQueries(userMessage, options)
  }
  return buildGeneralQueries(userMessage, options)
}

function formatTavilyForPrompt(searchBatches) {
  const lines = []
  const sources = []
  const answers = []
  for (const batch of searchBatches || []) {
    if (batch.error) {
      lines.push(`Query "${batch.query}": ${batch.error}`)
      continue
    }
    lines.push(`\n### Search: ${batch.query}`)
    if (batch.answer) {
      lines.push(`Summary: ${batch.answer}`)
      answers.push(String(batch.answer))
    }
    for (const r of batch.results || []) {
      lines.push(`- **${r.title}** (${r.url})\n  ${r.content}`)
      sources.push({ title: r.title, url: r.url, content: r.content })
    }
  }
  return { text: lines.join('\n'), sources, answers }
}

function formatDashboardResearchForPrompt(searchBatches) {
  const maxChars = Math.max(2000, Number(process.env.DASHBOARD_LLM_INPUT_CHARS || 8000))
  const maxSources = Math.max(5, Number(process.env.DASHBOARD_LLM_MAX_SOURCES || 20))
  const snippetLen = Math.max(80, Number(process.env.DASHBOARD_LLM_SNIPPET_CHARS || 200))

  const lines = []
  const sources = []
  for (const batch of searchBatches || []) {
    if (batch.error) continue
    lines.push(`### ${batch.query}`)
    if (batch.answer) {
      lines.push(String(batch.answer).slice(0, snippetLen))
    }
    for (const r of batch.results || []) {
      if (sources.length >= maxSources) break
      const title = String(r.title || '').slice(0, 120)
      const url = String(r.url || '')
      const content = String(r.content || '').slice(0, snippetLen)
      lines.push(`- ${title} (${url}): ${content}`)
      sources.push({ title, url, content })
    }
    if (sources.length >= maxSources) break
  }

  let text = lines.join('\n')
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n...[truncated]`
  }

  return { text, sources }
}

module.exports = {
  REGION_KEYWORDS,
  buildSearchQueries,
  isSimpleQuestion,
  isSalesDomainQuestion,
  formatTavilyForPrompt,
  formatDashboardResearchForPrompt,
}
