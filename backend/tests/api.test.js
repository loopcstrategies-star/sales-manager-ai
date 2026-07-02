const request = require('supertest')
const createApp = require('../app')
const { buildSearchQueries, isSalesDomainQuestion } = require('../services/prompts')
const { rankSources, dedupeSources } = require('../services/agents/templateStrategyAgent')
const {
  isOpenAiConfigured,
  getLlmProviderLabel,
  shouldUseLlmSynthesis,
} = require('../services/openAiClient')

describe('sales-manager-ai backend', () => {
  const app = createApp()
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test('GET /api/health', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.service).toBe('sales-manager-ai')
  })

  test('GET /api/config requires auth', async () => {
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(401)
  })

  test('buildSearchQueries returns domain queries for gold market', () => {
    expect(isSalesDomainQuestion('gold market trends in UAE')).toBe(true)
    const queries = buildSearchQueries('gold market trends in UAE competitor analysis vs rivals')
    expect(queries.length).toBeGreaterThan(1)
    expect(queries[0]).toMatch(/gold|precious metals/i)
  })

  test('buildSearchQueries uses verbatim query for general questions', () => {
    expect(isSalesDomainQuestion('What is inflation in Turkey?')).toBe(false)
    const queries = buildSearchQueries('What is inflation in Turkey?')
    expect(queries).toHaveLength(1)
    expect(queries[0]).toMatch(/inflation in Turkey/i)
    expect(queries[0]).not.toMatch(/precious metals jewelry/)
  })

  test('buildSearchQueries uses single query for simple questions', () => {
    const queries = buildSearchQueries('gold demand UAE')
    expect(queries).toHaveLength(1)
  })

  test('dedupeSources removes duplicate URLs', () => {
    const sources = [
      { title: 'A', url: 'https://example.com/a', content: 'one' },
      { title: 'B', url: 'https://example.com/a', content: 'dup' },
      { title: 'C', url: 'https://example.com/c', content: 'two' },
    ]
    expect(dedupeSources(sources)).toHaveLength(2)
  })

  test('rankSources scores by keyword overlap', () => {
    const sources = [
      { title: 'Generic', url: 'https://a.com', content: 'unrelated text' },
      { title: 'Gold UAE', url: 'https://b.com', content: 'gold jewelry demand UAE wholesale' },
    ]
    const ranked = rankSources(sources, 'gold demand UAE')
    expect(ranked[0].url).toBe('https://b.com')
  })

  test('isOpenAiConfigured accepts GROQ_API_KEY', () => {
    delete process.env.OPENAI_API_KEY
    process.env.GROQ_API_KEY = 'gsk_test_key'
    process.env.OPENAI_BASE_URL = 'https://api.groq.com/openai/v1'
    expect(isOpenAiConfigured()).toBe(true)
    expect(getLlmProviderLabel()).toBe('groq')
    expect(shouldUseLlmSynthesis()).toBe(true)
  })

  test('GET /api/chat/sessions requires auth', async () => {
    const res = await request(app).get('/api/chat/sessions')
    expect(res.status).toBe(401)
  })
})
