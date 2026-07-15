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

function isRateLimitError(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  return msg.includes('rate limit') || msg.includes('429')
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

async function requestChatCompletion(messages, options = {}) {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY or GROQ_API_KEY is not configured.')
  }

  const model = options.model || getModel()
  const baseUrl = getApiBaseUrl()
  const maxAttempts = options.retryOnRateLimit === false ? 1 : 2
  const timeoutMs = Math.max(3000, Number(options.timeoutMs || 20000))
  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 2000,
  }
  if (options.tools?.length) {
    body.tools = options.tools
    body.tool_choice = options.toolChoice || 'auto'
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let res
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      const name = String(err?.name || '')
      const msg = String(err?.message || err || '')
      if (name === 'TimeoutError' || name === 'AbortError' || msg.toLowerCase().includes('timeout')) {
        throw new Error(`LLM request timed out after ${timeoutMs}ms.`)
      }
      throw err
    }

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const errMsg = data?.error?.message || `LLM HTTP ${res.status}`
      const err = new Error(errMsg)
      if (attempt < maxAttempts && (res.status === 429 || isRateLimitError(err))) {
        // Short wait for interactive chat/copilot; long wait only if caller opts in
        const waitMs = Math.max(1000, Number(options.rateLimitRetryMs ?? 3000))
        await sleep(waitMs)
        continue
      }
      throw err
    }

    const message = data?.choices?.[0]?.message
    if (!message) throw new Error('LLM returned an empty response.')
    return message
  }

  throw new Error('LLM request failed after retries.')
}

async function createChatCompletion(messages, options = {}) {
  const message = await requestChatCompletion(messages, options)
  const content = message?.content
  if (!content) throw new Error('LLM returned an empty response.')
  return String(content).trim()
}

/**
 * Stream completion tokens (OpenAI-compatible SSE). Yields text deltas.
 */
async function* streamChatCompletion(messages, options = {}) {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY or GROQ_API_KEY is not configured.')
  }

  const model = options.model || getModel()
  const baseUrl = getApiBaseUrl()
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || 45000))
  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 2000,
    stream: true,
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error?.message || `LLM HTTP ${res.status}`)
  }
  if (!res.body) throw new Error('LLM stream body missing.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const json = JSON.parse(payload)
        const delta = json?.choices?.[0]?.delta?.content
        if (delta) yield String(delta)
      } catch {
        // skip bad chunks
      }
    }
  }
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
  requestChatCompletion,
  streamChatCompletion,
}
