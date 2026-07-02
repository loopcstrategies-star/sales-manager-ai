function getApiKey() {
  return String(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || '').trim()
}

function getApiBaseUrl() {
  const base = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim()
  return base.replace(/\/$/, '')
}

function getLlmProviderLabel() {
  if (!getApiKey()) return 'none'
  const base = getApiBaseUrl().toLowerCase()
  if (base.includes('groq.com')) return 'groq'
  if (base.includes('localhost') || base.includes('127.0.0.1') || base.includes('ollama')) return 'ollama'
  if (!base.includes('api.openai.com')) return 'compatible'
  return 'openai'
}

function getModel() {
  const configured = String(process.env.OPENAI_SALES_AI_MODEL || '').trim()
  if (configured) return configured
  if (getLlmProviderLabel() === 'groq') return 'llama-3.3-70b-versatile'
  return 'gpt-4o-mini'
}

function isOpenAiConfigured() {
  return Boolean(getApiKey())
}

function getSynthesisMode() {
  return String(process.env.SALES_AI_SYNTHESIS_MODE || 'auto').trim()
}

function shouldUseLlmSynthesis() {
  const mode = getSynthesisMode()
  if (mode === 'template') return false
  if (mode === 'openai') return isOpenAiConfigured()
  // auto: use LLM when any key is configured
  return isOpenAiConfigured()
}

function getEffectiveSynthesisMode() {
  if (getSynthesisMode() === 'template') return 'template'
  return shouldUseLlmSynthesis() ? 'openai' : 'template'
}

async function createChatCompletion(messages, options = {}) {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY or GROQ_API_KEY is not configured.')
  }

  const model = options.model || getModel()
  const baseUrl = getApiBaseUrl()
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxTokens ?? 2000,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const errMsg = data?.error?.message || `LLM HTTP ${res.status}`
    throw new Error(errMsg)
  }

  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('LLM returned an empty response.')
  return String(content).trim()
}

module.exports = {
  getModel,
  getApiKey,
  getApiBaseUrl,
  getLlmProviderLabel,
  isOpenAiConfigured,
  getSynthesisMode,
  shouldUseLlmSynthesis,
  getEffectiveSynthesisMode,
  createChatCompletion,
}
