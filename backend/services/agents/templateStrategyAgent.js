const {
  formatMetalsForPrompt,
  classifyQuestion,
  classifyEmailIntent,
  isEmailOnlyQuestion,
  REGION_KEYWORDS,
} = require('../prompts')

function extractResearchSnippets(marketSection) {
  const answers = marketSection?.answers || []
  if (answers.length) return answers.map((a) => String(a).trim()).filter(Boolean)
  return []
}

function buildDirectAnswer(userMessage, marketSection, crmSnapshot, metalRates, chatInputs = {}, emailSection = null) {
  const question = String(userMessage || '').trim()
  const kind = classifyQuestion(question)
  const s = crmSnapshot?.summary || {}
  const snippets = extractResearchSnippets(marketSection)
  const sourceCount = (marketSection?.sources || []).length
  const paragraphs = []

  const regionLabel = chatInputs.region ? (REGION_KEYWORDS[chatInputs.region] || chatInputs.region) : ''
  if (regionLabel) paragraphs.push(`Research focus: **${regionLabel}**.`)
  if (chatInputs.constraints) paragraphs.push(`Constraints noted: ${chatInputs.constraints}`)

  if (kind === 'email') {
    if (!emailSection) {
      paragraphs.push('Connect **LoopC Ops** in Settings to unlock inbox analysis.')
    } else if (emailSection.summary) {
      paragraphs.push(emailSection.summary)
    }
  }

  if ((kind === 'pipeline' || kind === 'mixed') && crmSnapshot) {
    const parts = []
    if (s.pipelineValueUSD) parts.push(`pipeline value is **$${Number(s.pipelineValueUSD).toLocaleString()}**`)
    if (s.hotLeads) parts.push(`**${s.hotLeads} hot lead(s)**`)
    if (parts.length) paragraphs.push(`On your CRM: ${parts.join(', ')}.`)
  } else if ((kind === 'pipeline' || kind === 'mixed') && !crmSnapshot) {
    paragraphs.push('Connect **LoopC Ops** in Settings to analyze your CRM pipeline.')
  }

  if (kind === 'market' || kind === 'mixed') {
    if (snippets.length) {
      paragraphs.push(snippets[0])
      if (snippets[1]) paragraphs.push(snippets[1])
    } else if (sourceCount) {
      paragraphs.push(`Found **${sourceCount} external source(s)** — see market research below.`)
    } else {
      paragraphs.push('Limited web results — try a more specific region or question.')
    }
  }

  if (metalRates?.goldPrice) {
    paragraphs.push(`Live rates: gold **${metalRates.goldPrice}** / silver **${metalRates.silverPrice}** ${metalRates.priceCurrency || 'USD'}/${metalRates.priceUnit || 'G'}.`)
  }

  if (!paragraphs.length) {
    paragraphs.push(`Regarding "${question.slice(0, 120)}": see market research below.`)
  }

  return paragraphs.join('\n\n')
}

function buildRecommendations(crmSnapshot, marketSection) {
  const s = crmSnapshot?.summary || {}
  const bullets = []
  if (Number(s.overdueFollowups) > 0) {
    bullets.push(`Clear **${s.overdueFollowups} overdue follow-up(s)**.`)
  }
  if (Number(s.hotLeads) > 0) {
    bullets.push(`Prioritize **${s.hotLeads} hot lead(s)** this week.`)
  }
  if ((marketSection?.sources || []).length > 0) {
    bullets.push('Review cited market sources before pricing decisions.')
  }
  if (!bullets.length) {
    bullets.push('Connect LoopC Ops for pipeline-specific recommendations.')
  }
  return bullets.slice(0, 5)
}

function formatMarketForReply(marketSection) {
  const sources = marketSection?.sources || []
  const answers = marketSection?.answers || []
  const lines = []
  if (answers.length) {
    lines.push('**Web summaries:**')
    answers.forEach((a) => lines.push(`- ${a}`))
    lines.push('')
  }
  if (sources.length) {
    lines.push('**Sources:**')
    sources.slice(0, 8).forEach((src) => lines.push(`- [${src.title}](${src.url})`))
  }
  if (!lines.length) return String(marketSection?.content || 'No web research results.')
  return lines.join('\n')
}

function formatCrmForReply(crmSnapshot) {
  if (!crmSnapshot) return '_LoopC Ops not connected._'
  const s = crmSnapshot.summary || {}
  return [
    `- Pipeline value: **$${(s.pipelineValueUSD ?? 0).toLocaleString()}**`,
    `- Active leads: **${s.activeLeads ?? 0}** | Hot: **${s.hotLeads ?? 0}**`,
    `- Win rate: **${s.winRate ?? 0}%** | Overdue follow-ups: **${s.overdueFollowups ?? 0}**`,
  ].join('\n')
}

function runTemplateStrategyAgent({
  userMessage,
  marketSection,
  crmSnapshot,
  metalRates,
  emailSection = null,
  chatInputs = {},
}) {
  const emailOnly = isEmailOnlyQuestion(userMessage)
  const directAnswer = buildDirectAnswer(userMessage, marketSection, crmSnapshot, metalRates, chatInputs, emailSection)
  const recommendations = emailOnly ? [] : buildRecommendations(crmSnapshot, marketSection)
  const showCrm = !emailOnly && (classifyQuestion(userMessage) === 'pipeline' || classifyQuestion(userMessage) === 'mixed')
  const showEmail = classifyEmailIntent(userMessage)
  const showMarket = !emailOnly

  const replyParts = [
    '_Template mode — market research + strategy synthesis._',
    '',
    '## Answer',
    directAnswer,
    '',
    showEmail ? '## Inbox' : null,
    showEmail ? (emailSection?.content || 'Connect LoopC Ops to check inbox.') : null,
    showEmail ? '' : null,
    showMarket ? '## Market research' : null,
    showMarket ? formatMarketForReply(marketSection) : null,
    showMarket ? '' : null,
    showCrm ? '## CRM data' : null,
    showCrm ? formatCrmForReply(crmSnapshot) : null,
    showCrm && metalRates ? '' : null,
    showCrm && metalRates ? '## Live metal rates' : null,
    showCrm && metalRates ? formatMetalsForPrompt(metalRates) : null,
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

module.exports = { runTemplateStrategyAgent, buildRecommendations }
