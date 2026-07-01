const { buildSearchQueries, classifyEmailIntent, classifyQuestion } = require('./prompts')
const { runTavilySearches, shouldUseAdvancedSearchDepth } = require('./tavilySearch')
const { runMarketResearchAgent } = require('./agents/marketResearchAgent')
const { runCrmInsightAgent } = require('./agents/crmInsightAgent')
const { runTemplateStrategyAgent } = require('./agents/templateStrategyAgent')
const { isOpenAiConfigured } = require('./openAiClient')
const { fetchCrmSnapshot, fetchInboxSummary, fetchMetalRates } = require('./loopcConnector')

const REGION_OPTIONS = [
  { id: '', label: 'Global' },
  { id: 'uzbekistan', label: 'Uzbekistan / Central Asia' },
  { id: 'uae', label: 'UAE' },
  { id: 'gcc', label: 'GCC' },
  { id: 'turkey', label: 'Turkey' },
  { id: 'india', label: 'India' },
  { id: 'china', label: 'China' },
]

function wantsCrm(message) {
  return /pipeline|crm|deal|lead|follow.?up|win rate|customer/i.test(String(message || ''))
}

function wantsEmail(message) {
  return classifyEmailIntent(message)
}

async function runSalesAiChat({ user, message, history = [], chatInputs = {} }) {
  const userMessage = String(message || '').trim()
  if (!userMessage) throw new Error('Message is required.')

  const normalizedInputs = {
    region: String(chatInputs.region || '').trim(),
    constraints: String(chatInputs.constraints || '').trim(),
    depth: String(chatInputs.depth || '').trim(),
  }

  const workspaceId = user.workspaceId
  const needsCrm = wantsCrm(userMessage)
  const needsEmail = wantsEmail(userMessage)
  const searchDepth = shouldUseAdvancedSearchDepth(userMessage, normalizedInputs) ? 'advanced' : 'basic'

  let crmSnapshot = null
  let emailSection = null
  let metalRates = null

  if (needsCrm || classifyQuestion(userMessage) === 'mixed') {
    crmSnapshot = await fetchCrmSnapshot(workspaceId)
  }
  if (needsEmail) {
    const inbox = await fetchInboxSummary(workspaceId)
    if (!inbox) {
      emailSection = { connectRequired: true, content: 'Connect LoopC Ops to check your company inbox.' }
    } else {
      emailSection = {
        title: 'Inbox',
        agent: 'emailInbox',
        summary: inbox.summary,
        content: inbox.summary || `Found ${inbox.messageCount || 0} recent message(s).`,
        messages: inbox.messages || [],
      }
    }
  }
  if (needsCrm && crmSnapshot) {
    metalRates = await fetchMetalRates(workspaceId)
  }

  const skipTavily = needsEmail && !/(market|trend|pipeline|gold price|silver price)/i.test(userMessage)
  const queries = skipTavily ? [] : buildSearchQueries(userMessage, normalizedInputs)
  const searchBatches = queries.length ? await runTavilySearches(queries, { searchDepth }) : []
  const marketSection = runMarketResearchAgent(searchBatches)
  const crmSection = crmSnapshot ? runCrmInsightAgent(crmSnapshot) : null

  const strategy = runTemplateStrategyAgent({
    userMessage,
    marketSection,
    crmSnapshot,
    metalRates,
    emailSection,
    chatInputs: normalizedInputs,
  })

  const sections = [
    ...(emailSection ? [{ title: emailSection.title || 'Inbox', agent: 'emailInbox' }] : []),
    { title: marketSection.title, agent: marketSection.agent, sources: marketSection.sources },
    ...(crmSection ? [{ title: crmSection.title, agent: crmSection.agent }] : []),
    { title: strategy.title, agent: strategy.agent },
  ]

  return {
    reply: strategy.reply,
    sections,
    meta: {
      model: strategy.meta?.model || 'template',
      synthesisMode: 'template',
      searchQueryCount: queries.length,
      loopcConnected: Boolean(crmSnapshot || emailSection?.messages),
      crmAccessLevel: crmSnapshot?.accessLevel || 'none',
      chatInputs: normalizedInputs,
    },
  }
}

function getSalesAiConfig() {
  const tavilyReady = Boolean(String(process.env.TAVILY_API_KEY || '').trim())
  const openaiReady = isOpenAiConfigured()
  const synthesisMode = String(process.env.SALES_AI_SYNTHESIS_MODE || 'template').trim()
  return {
    enabled: true,
    providers: {
      openai: { configured: openaiReady },
      tavily: { configured: tavilyReady },
    },
    synthesisMode,
    model: synthesisMode === 'template' ? 'template' : 'openai',
    regions: REGION_OPTIONS,
    quickActions: [
      { id: 'market-trends', label: 'Market trends', prompt: 'What are the latest gold and silver jewelry market trends?' },
      { id: 'customer-demand', label: 'Customer demand', prompt: 'Analyze current customer demand patterns for precious metals and jewelry wholesale.' },
      { id: 'opportunities', label: 'New opportunities', prompt: 'What new market opportunities should we pursue in Central Asia and the Middle East?' },
      { id: 'sales-strategy', label: 'Sales strategy', prompt: 'Suggest a sales strategy for the next quarter based on market conditions.' },
      { id: 'pipeline', label: 'Analyze pipeline', prompt: 'Analyze our CRM pipeline and recommend priorities. (Requires LoopC connection)' },
    ],
  }
}

module.exports = { runSalesAiChat, getSalesAiConfig, REGION_OPTIONS }
