const { REGION_KEYWORDS } = require('../prompts')

function tokenize(text) {
  return String(text || '').toLowerCase().split(/\W+/).filter((w) => w.length > 3)
}

function scoreSource(source, userMessage) {
  const keywords = tokenize(userMessage)
  const haystack = `${source.title} ${source.content}`.toLowerCase()
  return keywords.reduce((score, word) => (haystack.includes(word) ? score + 1 : score), 0)
}

function dedupeSources(sources = []) {
  const seen = new Set()
  return sources.filter((s) => {
    const key = String(s.url || '').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function rankSources(sources, userMessage) {
  return dedupeSources(sources)
    .map((s) => ({ ...s, score: scoreSource(s, userMessage) }))
    .sort((a, b) => b.score - a.score)
}

function extractContentSnippets(sources, limit = 3) {
  return sources
    .map((s) => String(s.content || '').trim())
    .filter((c) => c.length > 40)
    .slice(0, limit)
}

function extractResearchSnippets(marketSection) {
  const answers = marketSection?.answers || []
  if (answers.length) return answers.map((a) => String(a).trim()).filter(Boolean)
  return extractContentSnippets(marketSection?.sources || [])
}

function buildDirectAnswer(userMessage, marketSection, chatInputs = {}, fallbackReason = '') {
  const question = String(userMessage || '').trim()
  const ranked = rankSources(marketSection?.sources || [], question)
  const snippets = extractResearchSnippets({ ...marketSection, sources: ranked })
  const sourceCount = ranked.length
  const paragraphs = []

  const regionLabel = chatInputs.region ? (REGION_KEYWORDS[chatInputs.region] || chatInputs.region) : ''
  if (regionLabel) paragraphs.push(`Research focus: **${regionLabel}**.`)
  if (chatInputs.constraints) paragraphs.push(`Constraints noted: ${chatInputs.constraints}`)

  if (snippets.length) {
    paragraphs.push(snippets[0])
    if (snippets[1]) paragraphs.push(snippets[1])
  } else if (sourceCount) {
    paragraphs.push(`Found **${sourceCount} external source(s)** — see market research below.`)
  } else {
    paragraphs.push(`I could not find live web results for "${question.slice(0, 100)}".`)
    if (fallbackReason) {
      paragraphs.push(`_LLM unavailable (${fallbackReason}). Configure **GROQ_API_KEY** or **OPENAI_API_KEY** for full AI answers._`)
    } else {
      paragraphs.push('_Configure **GROQ_API_KEY** + **BRAVE_API_KEY** in backend `.env` for full AI answers with web research._')
    }
  }

  if (!paragraphs.length) {
    paragraphs.push(`Regarding "${question.slice(0, 120)}": see market research below.`)
  }

  return paragraphs.join('\n\n')
}

function buildRecommendations(userMessage, marketSection) {
  const msg = String(userMessage || '').toLowerCase()
  const bullets = []
  const sourceCount = (marketSection?.sources || []).length

  if (sourceCount > 0) {
    bullets.push('Review cited market sources before pricing decisions.')
  }
  if (/competitor|rival|vs\b/i.test(msg)) {
    bullets.push('Compare competitor positioning against your wholesale margins.')
  }
  if (/regulat|compliance|import/i.test(msg)) {
    bullets.push('Verify import and hallmark rules with local trade authorities.')
  }
  if (/opportunit|expand|growth/i.test(msg)) {
    bullets.push('Shortlist 2–3 regions and validate demand with distributors.')
  }
  if (sourceCount > 0 && bullets.length < 3) {
    bullets.push('Cross-check trends across multiple regions if expanding.')
  }
  if (!bullets.length) {
    bullets.push('Try a more specific question or select a region focus.')
  }
  return bullets.slice(0, 5)
}

function formatMarketForReply(marketSection, userMessage = '') {
  const ranked = rankSources(marketSection?.sources || [], userMessage)
  const answers = marketSection?.answers || []
  const lines = []
  if (answers.length) {
    lines.push('**Web summaries:**')
    answers.forEach((a) => lines.push(`- ${a}`))
    lines.push('')
  }
  const contentSnippets = extractContentSnippets(ranked, 4)
  if (contentSnippets.length) {
    lines.push('**Key findings:**')
    contentSnippets.forEach((c) => lines.push(`- ${c.slice(0, 280)}${c.length > 280 ? '…' : ''}`))
    lines.push('')
  }
  if (ranked.length) {
    lines.push('**Sources:**')
    ranked.slice(0, 8).forEach((src) => lines.push(`- [${src.title}](${src.url})`))
  }
  if (!lines.length) return String(marketSection?.content || 'No web research results.')
  return lines.join('\n')
}

function formatHistoryContext(history = []) {
  const recent = (history || [])
    .slice(-6)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
  if (!recent.length) return ''
  const lines = recent.map((m) => `- **${m.role}:** ${String(m.content || '').slice(0, 400)}`)
  return `## Recent conversation\n${lines.join('\n')}\n`
}

function runTemplateStrategyAgent({
  userMessage,
  history = [],
  marketSection,
  chatInputs = {},
  fallbackReason = '',
}) {
  const rankedSources = rankSources(marketSection?.sources || [], userMessage)
  const enrichedSection = { ...marketSection, sources: rankedSources }
  const historyBlock = formatHistoryContext(history)
  const directAnswer = buildDirectAnswer(userMessage, enrichedSection, chatInputs, fallbackReason)
  const recommendations = buildRecommendations(userMessage, enrichedSection)
  const hasSources = rankedSources.length > 0

  const replyParts = [
    fallbackReason ? '_Template fallback — configure Groq for full AI answers._' : null,
    historyBlock || null,
    '## Answer',
    directAnswer,
    hasSources ? '' : null,
    hasSources ? '## Market research' : null,
    hasSources ? formatMarketForReply(enrichedSection, userMessage) : null,
    recommendations.length ? '## Suggested next steps' : null,
    ...(recommendations.map((b) => `- ${b}`)),
  ].filter((block) => block !== null && block !== '')

  return {
    agent: 'strategy',
    title: 'Recommendations',
    reply: replyParts.join('\n'),
    sections: [],
    meta: { model: 'template', synthesisMode: 'template' },
  }
}

module.exports = { runTemplateStrategyAgent, buildRecommendations, rankSources, dedupeSources }
