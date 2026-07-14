const { htmlToText, normalizeWebsite } = require('../services/websitePageText')
const { isStubContact, parseContactsPayload } = require('../services/contactFind')

describe('websitePageText', () => {
  test('htmlToText strips tags and scripts', () => {
    const html = '<html><script>x=1</script><body><h1>Acme</h1><p>Email sales@acme.com</p></body></html>'
    const text = htmlToText(html)
    expect(text).toContain('Acme')
    expect(text).toContain('sales@acme.com')
    expect(text).not.toContain('<script')
    expect(text).not.toContain('x=1')
  })

  test('normalizeWebsite adds https', () => {
    expect(normalizeWebsite('acme.com')).toBe('https://acme.com')
    expect(normalizeWebsite('')).toBe('')
  })
})

describe('contactFind helpers', () => {
  test('isStubContact detects Main stubs', () => {
    expect(isStubContact({ lastName: 'Main', firstName: '' })).toBe(true)
    expect(isStubContact({ lastName: 'Main', firstName: 'Sam' })).toBe(false)
    expect(isStubContact({ lastName: 'Smith', firstName: '' })).toBe(false)
  })

  test('parseContactsPayload allows up to 8 people', () => {
    const people = Array.from({ length: 10 }, (_, i) => ({
      firstName: `A${i}`,
      lastName: `B${i}`,
      email: `a${i}@ex.com`,
    }))
    const parsed = parseContactsPayload({ people })
    expect(parsed.people).toHaveLength(8)
  })
})
