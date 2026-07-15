const { buildSearchQueries } = require('./prompts')
const { runWebSearches, shouldUseAdvancedSearchDepth, getSearchProvider, isSearchConfigured } = require('./webSearch')
const { runMarketResearchAgent } = require('./agents/marketResearchAgent')
const { runTemplateStrategyAgent } = require('./agents/templateStrategyAgent')
const { runOpenAiStrategyAgent } = require('./agents/openAiStrategyAgent')
const { runCrmCopilotAgent, looksLikeCrmRequest } = require('./agents/crmCopilotAgent')
const {
  isOpenAiConfigured,
  getSynthesisMode,
  shouldUseLlmSynthesis,
  getEffectiveSynthesisMode,
  getLlmProviderLabel,
  getModel,
} = require('./openAiClient')

const REGION_OPTIONS = [
  { id: '', label: 'Global' },
  { id: 'uzbekistan', label: 'Uzbekistan / Central Asia' },
  { id: 'uae', label: 'UAE' },
  { id: 'gcc', label: 'GCC' },
  { id: 'turkey', label: 'Turkey' },
  { id: 'india', label: 'India' },
  { id: 'china', label: 'China' },
]

async function runStrategySynthesis({ userMessage, history, marketSection, chatInputs }) {
  const agentInput = { userMessage, history, marketSection, chatInputs }

  if (shouldUseLlmSynthesis()) {
    try {
      return await runOpenAiStrategyAgent(agentInput)
    } catch (err) {
      console.error('[orchestrator] LLM fallback to template:', err.message)
      return runTemplateStrategyAgent({ ...agentInput, fallbackReason: err.message })
    }
  }

  return runTemplateStrategyAgent(agentInput)
}

async function runSalesAiChat({ user, message, history = [], chatInputs = {} }) {
  const userMessage = String(message || '').trim()
  if (!userMessage) throw new Error('Message is required.')

  const normalizedHistory = (history || [])
    .slice(-12)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))

  const normalizedInputs = {
    region: String(chatInputs.region || '').trim(),
    constraints: String(chatInputs.constraints || '').trim(),
    depth: String(chatInputs.depth || '').trim(),
  }

  // CRM-aware path: read/write live Sales data via tool calling
  if (looksLikeCrmRequest(userMessage) && user) {
    try {
      const crm = await runCrmCopilotAgent({
        user,
        userMessage,
        history: normalizedHistory,
      })
      return {
        reply: crm.reply,
        sections: [
          { title: crm.title, agent: crm.agent },
        ],
        meta: crm.meta,
      }
    } catch (err) {
      console.error('[orchestrator] CRM copilot failed, falling back to web research:', err.message)
    }
  }

  const searchDepth = shouldUseAdvancedSearchDepth(userMessage, normalizedInputs) ? 'advanced' : 'basic'
  const queries = buildSearchQueries(userMessage, normalizedInputs)
  const { batches, cacheHits, provider } = queries.length
    ? await runWebSearches(queries, { searchDepth })
    : { batches: [], cacheHits: 0, provider: getSearchProvider() }
  const marketSection = runMarketResearchAgent(batches, { provider })

  const strategy = await runStrategySynthesis({
    userMessage,
    history: normalizedHistory,
    marketSection,
    chatInputs: normalizedInputs,
  })

  const sections = [
    { title: marketSection.title, agent: marketSection.agent, sources: marketSection.sources },
    { title: strategy.title, agent: strategy.agent },
  ]

  const effectiveMode = strategy.meta?.synthesisMode || getEffectiveSynthesisMode()

  return {
    reply: strategy.reply,
    sections,
    meta: {
      model: strategy.meta?.model || 'template',
      synthesisMode: effectiveMode,
      configuredSynthesisMode: getSynthesisMode(),
      llmProvider: strategy.meta?.llmProvider || getLlmProviderLabel(),
      searchQueryCount: queries.length,
      searchCacheHits: cacheHits,
      searchProvider: provider,
      chatInputs: normalizedInputs,
    },
  }
}

function getSalesAiConfig() {
  const searchReady = isSearchConfigured()
  const searchProvider = getSearchProvider()
  const llmReady = isOpenAiConfigured()
  const llmProvider = getLlmProviderLabel()
  const synthesisMode = getSynthesisMode()
  const effectiveSynthesisMode = getEffectiveSynthesisMode()
  const hunterReady = Boolean(String(process.env.HUNTER_API_KEY || '').trim())
  const sendgridReady = Boolean(String(process.env.SENDGRID_API_KEY || '').trim())
  return {
    enabled: true,
    providers: {
      llm: { configured: llmReady, provider: llmProvider },
      openai: { configured: llmReady },
      groq: { configured: Boolean(String(process.env.GROQ_API_KEY || '').trim()) || (llmReady && llmProvider === 'groq') },
      search: { configured: searchReady, provider: searchProvider },
      tavily: { configured: Boolean(String(process.env.TAVILY_API_KEY || '').trim()) },
      brave: { configured: Boolean(String(process.env.BRAVE_API_KEY || '').trim()) },
      hunter: { configured: hunterReady },
      sendgrid: { configured: sendgridReady },
    },
    synthesisMode,
    effectiveSynthesisMode,
    llmProvider,
    model: effectiveSynthesisMode === 'template' ? 'template' : getModel(),
    regions: REGION_OPTIONS,
    quickActions: [
      { id: 'my-pipeline', label: 'My pipeline', prompt: 'What does my CRM pipeline look like? Summarize open deals by stage and amount.' },
      { id: 'my-leads', label: 'My leads', prompt: 'List my open CRM leads and suggest who to call first.' },
      { id: 'crm-stats', label: 'CRM stats', prompt: 'Give me my CRM stats: open leads, accounts, deals, and tasks due this week.' },
      { id: 'create-task', label: 'Create follow-up', prompt: 'Create a high-priority CRM task to follow up with my hottest open opportunity this week.' },
      { id: 'market-trends', label: 'Market trends', prompt: 'What are the latest gold and silver jewelry market trends?' },
      { id: 'customer-demand', label: 'Customer demand', prompt: 'Analyze current customer demand patterns for precious metals and jewelry wholesale.' },
      { id: 'opportunities', label: 'New opportunities', prompt: 'What new market opportunities should we pursue in Central Asia and the Middle East?' },
      { id: 'sales-strategy', label: 'Sales strategy', prompt: 'Suggest a sales strategy for the next quarter based on market conditions.' },
    ],
  }
}

module.exports = { runSalesAiChat, getSalesAiConfig, REGION_OPTIONS }
