const { hostnameFromUrl, isHunterConfigured } = require('../services/hunterClient')

describe('hunterClient', () => {
  test('hostnameFromUrl strips www and path', () => {
    expect(hostnameFromUrl('https://www.Acme.ae/about')).toBe('acme.ae')
    expect(hostnameFromUrl('acme.co.uk/page')).toBe('acme.co.uk')
  })

  test('isHunterConfigured reflects env', () => {
    const prev = process.env.HUNTER_API_KEY
    delete process.env.HUNTER_API_KEY
    expect(isHunterConfigured()).toBe(false)
    process.env.HUNTER_API_KEY = 'test'
    expect(isHunterConfigured()).toBe(true)
    if (prev == null) delete process.env.HUNTER_API_KEY
    else process.env.HUNTER_API_KEY = prev
  })
})
