const request = require('supertest')
const createApp = require('../app')
const { buildSearchQueries } = require('../services/prompts')

describe('sales-manager-ai backend', () => {
  const app = createApp()

  test('GET /api/health', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.service).toBe('sales-manager-ai')
  })

  test('GET /api/config requires auth', async () => {
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(401)
  })

  test('buildSearchQueries returns market queries', () => {
    const queries = buildSearchQueries('gold market trends in UAE')
    expect(queries.length).toBeGreaterThan(1)
    expect(queries[0]).toMatch(/gold/i)
  })
})
