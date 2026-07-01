const REGION_KEYWORDS = {
  uzbekistan: 'Uzbekistan Central Asia',
  uae: 'UAE Dubai gold market',
  gcc: 'GCC Gulf gold jewelry',
  turkey: 'Turkey jewelry export',
  india: 'India gold jewelry demand',
  china: 'China gold demand',
}

function buildSearchQueries(userMessage, options = {}) {
  const msg = String(userMessage || '').trim()
  const base = msg.slice(0, 200)
  const region = String(options.region || '').trim().toLowerCase()
  const constraints = String(options.constraints || '').trim()
  const regionSuffix = REGION_KEYWORDS[region] || (region ? `${region} gold jewelry market` : '')

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
      sources.push({ title: r.title, url: r.url })
    }
  }
  return { text: lines.join('\n'), sources, answers }
}

function formatCrmForPrompt(crmSnapshot) {
  if (!crmSnapshot) return 'CRM data unavailable.'
  const s = crmSnapshot.summary || {}
  const lines = [
    `Pipeline value (USD): ${s.pipelineValueUSD ?? 0}`,
    `Active leads: ${s.activeLeads ?? 0}`,
    `Hot leads: ${s.hotLeads ?? 0}`,
    `Win rate: ${s.winRate ?? 0}%`,
    `Overdue follow-ups: ${s.overdueFollowups ?? 0}`,
  ]
  if (crmSnapshot.accessLevel === 'full' && crmSnapshot.detail?.topOpenDeals?.length) {
    lines.push('\nTop open deals:')
    crmSnapshot.detail.topOpenDeals.forEach((d) => {
      lines.push(`- ${d.title} | ${d.stage} | $${d.valueUSD || 0}`)
    })
  }
  return lines.join('\n')
}

function formatMetalsForPrompt(metals) {
  if (!metals) return 'Live metal rates unavailable.'
  return [
    `Gold: ${metals.goldPrice} ${metals.priceCurrency}/${metals.priceUnit}`,
    `Silver: ${metals.silverPrice} ${metals.priceCurrency}/${metals.priceUnit}`,
    metals.source ? `Source: ${metals.source}` : null,
  ].filter(Boolean).join('\n')
}

function classifyEmailIntent(userMessage) {
  const msg = String(userMessage || '').toLowerCase()
  return /\b(emails?|e-mail|inbox|gmail|unread|mailbox)\b/.test(msg)
    || /check\s+(my\s+)?emails?/.test(msg)
}

function classifyQuestion(userMessage) {
  const msg = String(userMessage || '').toLowerCase()
  if (classifyEmailIntent(userMessage) && !/(market|trend|pipeline|crm|deal|lead|gold price|silver price|opportunit)/i.test(msg)) {
    return 'email'
  }
  const pipeline = /pipeline|crm|deal|lead|follow.?up|win rate|customer/i.test(msg)
  const market = /market|trend|demand|competitor|regulat|opportunit|growth|wholesale|bullion|jewelry|gold|silver/i.test(msg)
  if (pipeline && !market) return 'pipeline'
  if (market && !pipeline) return 'market'
  return 'mixed'
}

function isEmailOnlyQuestion(userMessage) {
  return classifyQuestion(userMessage) === 'email'
}

module.exports = {
  REGION_KEYWORDS,
  buildSearchQueries,
  formatTavilyForPrompt,
  formatCrmForPrompt,
  formatMetalsForPrompt,
  classifyQuestion,
  classifyEmailIntent,
  isEmailOnlyQuestion,
}
