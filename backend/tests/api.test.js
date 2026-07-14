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

  test('GET /api/dashboard requires auth', async () => {
    const res = await request(app).get('/api/dashboard')
    expect(res.status).toBe(401)
  })

  test('GET /api/settings requires auth', async () => {
    const res = await request(app).get('/api/settings')
    expect(res.status).toBe(401)
  })

  test('PATCH /api/settings requires auth', async () => {
    const res = await request(app).patch('/api/settings').send({ dashboard: { pollMinutes: 10 } })
    expect(res.status).toBe(401)
  })

  test('settings patch schema rejects invalid pollMinutes', () => {
    const { Joi } = require('../middleware/validate')
    const patchSchema = Joi.object({
      dashboard: Joi.object({
        pollMinutes: Joi.number().valid(1, 5, 10, 15),
      }).min(1),
    }).min(1)
    const { error } = patchSchema.validate({ dashboard: { pollMinutes: 7 } })
    expect(error).toBeTruthy()
    const ok = patchSchema.validate({ dashboard: { pollMinutes: 10 } })
    expect(ok.error).toBeUndefined()
  })

  test('mergeDashboard applies defaults', () => {
    const { mergeDashboard, DEFAULT_DASHBOARD } = require('../services/userPreferences')
    const merged = mergeDashboard({})
    expect(merged.showPriceTiles).toBe(DEFAULT_DASHBOARD.showPriceTiles)
    expect(merged.pollMinutes).toBe(5)
    expect(merged.sections.metals).toBe(true)
  })

  test('mergeSales applies defaults and clamps', () => {
    const { mergeSales, DEFAULT_SALES } = require('../services/userPreferences')
    const merged = mergeSales({})
    expect(merged.emailTone).toBe(DEFAULT_SALES.emailTone)
    expect(merged.findContactsMax).toBe(5)
    expect(merged.stageProbabilities.Prospecting).toBe(10)
    const clamped = mergeSales({ findContactsMax: 99, enrichStaleDays: 2, stageProbabilities: { Proposal: 200 } })
    expect(clamped.findContactsMax).toBe(8)
    expect(clamped.enrichStaleDays).toBe(7)
    expect(clamped.stageProbabilities.Proposal).toBe(100)
  })

  test('mergeDashboard caps custom topics', () => {
    const { mergeDashboard } = require('../services/userPreferences')
    const topics = Array.from({ length: 15 }, (_, i) => `topic${i}`)
    const merged = mergeDashboard({ customTopics: topics })
    expect(merged.customTopics).toHaveLength(10)
  })

  test('buildCardsFromSources creates cards from search batches', () => {
    const { buildCardsFromSources } = require('../services/dashboardFeed')
    const cards = buildCardsFromSources([{
      query: 'gold market news today',
      category: 'metals',
      tags: ['gold'],
      answer: 'Gold prices rose.',
      results: [{ title: 'Gold News', url: 'https://example.com/gold', content: 'Spot gold up.' }],
    }])
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.some((c) => c.category === 'metals')).toBe(true)
    expect(cards[0].type).toBeDefined()
  })

  test('buildDashboardQueries returns news-focused queries', () => {
    const { buildDashboardQueries } = require('../services/newsFeeds')
    const queries = buildDashboardQueries('')
    expect(queries.length).toBeGreaterThanOrEqual(4)
    expect(queries[0].query).toMatch(/news|today/i)
  })

  test('normalizeCard sets headline type', () => {
    const { normalizeCard } = require('../services/dashboardFeed')
    const card = normalizeCard({
      title: 'Test',
      summary: 'Summary',
      category: 'metals',
      type: 'headline',
      tags: ['gold'],
    })
    expect(card.type).toBe('headline')
    expect(card.tags).toContain('gold')
  })

  test('isSnapshotStale detects old snapshots', () => {
    const { isSnapshotStale, getRefreshHours } = require('../services/dashboardFeed')
    const hours = getRefreshHours()
    const old = new Date(Date.now() - (hours + 1) * 60 * 60 * 1000)
    const recent = new Date()
    expect(isSnapshotStale(old)).toBe(true)
    expect(isSnapshotStale(recent)).toBe(false)
  })

  test('normalizeImageUrl resolves relative paths', () => {
    const { normalizeImageUrl } = require('../services/cardImages')
    const url = normalizeImageUrl('/images/gold.jpg', 'https://www.kitco.com/news/article')
    expect(url).toBe('https://www.kitco.com/images/gold.jpg')
  })

  test('signImageProxyUrl and verifyImageProxySig round-trip', () => {
    process.env.JWT_SECRET = 'test-secret'
    const {
      signImageProxyUrl,
      verifyImageProxySig,
      decodeProxiedImageUrl,
    } = require('../services/cardImages')
    const proxied = signImageProxyUrl('https://www.kitco.com/images/gold.jpg')
    expect(proxied).toMatch(/^\/api\/dashboard\/image\?/)
    const u = new URL(proxied, 'http://localhost').searchParams.get('u')
    const sig = new URL(proxied, 'http://localhost').searchParams.get('sig')
    expect(verifyImageProxySig(u, sig)).toBe(true)
    expect(decodeProxiedImageUrl(u)).toBe('https://www.kitco.com/images/gold.jpg')
  })

  test('GET /api/dashboard/image rejects bad signature', async () => {
    const res = await request(app).get('/api/dashboard/image?u=abc&sig=bad')
    expect(res.status).toBe(403)
  })

  test('verifyImageUrl rejects non-image content-type', async () => {
    const originalFetch = global.fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
    })
    const { verifyImageUrl } = require('../services/cardImages')
    await expect(verifyImageUrl('https://www.kitco.com/images/gold.jpg')).resolves.toBe('')
    global.fetch = originalFetch
  })

  test('formatDashboardResearchForPrompt truncates large input', () => {
    const { formatDashboardResearchForPrompt } = require('../services/prompts')
    const batches = [{
      query: 'gold news',
      results: Array.from({ length: 30 }, (_, i) => ({
        title: `Headline ${i}`,
        url: `https://example.com/${i}`,
        content: 'x'.repeat(500),
      })),
    }]
    const { text, sources } = formatDashboardResearchForPrompt(batches)
    expect(sources.length).toBeLessThanOrEqual(20)
    expect(text.length).toBeLessThanOrEqual(8015)
  })
})
