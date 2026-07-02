const { REGION_KEYWORDS } = require('../prompts')
const { createChatCompletion, getModel, getLlmProviderLabel } = require('../openAiClient')

function normalizeHistory(history = []) {
  return (history || [])
    .slice(-12)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role,
      content: String(m.content || '').slice(0, 4000),
    }))
}

function buildContextBlock({ marketSection, chatInputs }) {
  const parts = []
  const regionLabel = chatInputs.region
    ? (REGION_KEYWORDS[chatInputs.region] || chatInputs.region)
    : 'Global'
  parts.push(`Region focus: ${regionLabel}`)
  if (chatInputs.constraints) parts.push(`User constraints: ${chatInputs.constraints}`)
  if (chatInputs.depth === 'deep') parts.push('Research depth: deep (advanced web search was used).')

  const hasResearch = (marketSection?.sources || []).length > 0
    || (marketSection?.answers || []).length > 0
    || String(marketSection?.content || '').includes('### Search:')

  if (hasResearch) {
    parts.push(`## Web research\n${marketSection.content}`)
  } else {
    parts.push('## Web research\nNo live web results were retrieved for this query.')
  }

  return parts.join('\n\n')
}

function buildSystemPrompt(contextBlock) {
  return [
    'You are Sales Manager AI, an intelligent research assistant.',
    'Answer the user question directly and comprehensively — any topic, not only precious metals or jewelry.',
    'When web research is provided, prioritize it and cite source titles.',
    'When web research is empty or limited, answer from your general knowledge and clearly note: "No live web results found — answer based on general knowledge."',
    'Use markdown: ## for section headings, - for bullets, **bold** for emphasis.',
    'Structure your reply with: ## Answer (direct response), optional ## Market research (if citing sources), optional ## Suggested next steps.',
    'Use conversation history for follow-up questions. Be specific, helpful, and actionable.',
    '',
    '--- Context for this turn ---',
    contextBlock,
  ].join('\n')
}

async function runOpenAiStrategyAgent({
  userMessage,
  history = [],
  marketSection,
  chatInputs = {},
}) {
  const contextBlock = buildContextBlock({ marketSection, chatInputs })
  const messages = [
    { role: 'system', content: buildSystemPrompt(contextBlock) },
    ...normalizeHistory(history),
    { role: 'user', content: String(userMessage || '').trim() },
  ]

  const reply = await createChatCompletion(messages)
  const provider = getLlmProviderLabel()
  return {
    agent: 'strategy',
    title: 'Recommendations',
    reply,
    sections: [],
    meta: { model: getModel(), synthesisMode: 'openai', llmProvider: provider },
  }
}

module.exports = { runOpenAiStrategyAgent, normalizeHistory }
