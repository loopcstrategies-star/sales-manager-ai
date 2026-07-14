const {
  assessProspect,
  companyName,
  companyWebsiteUrl,
  isNoiseHost,
  looksLikeListicle,
  withRegion,
  brandFromHostname,
  countryFromTld,
  resolveCountry,
  normalizeRegionLabel,
} = require('../services/prospectQuality')
const {
  extractJsonObject,
  parseContactsPayload,
} = require('../services/contactFind')

describe('prospectQuality', () => {
  test('flags noise hosts including gulf news and 2gis', () => {
    expect(isNoiseHost('https://www.instagram.com/somejeweller')).toBe(true)
    expect(isNoiseHost('https://gulfnews.com/business/story')).toBe(true)
    expect(isNoiseHost('https://2gis.ae/dubai/search/Companies')).toBe(true)
    expect(isNoiseHost('https://www.acme-jewellery.ae/about')).toBe(false)
  })

  test('detects listicle and question titles', () => {
    expect(looksLikeListicle('Any major gold suppliers in Dubai or UAE?')).toBe(true)
    expect(looksLikeListicle('Chapter 3 - Refineries and Bullion Dealers')).toBe(true)
    expect(looksLikeListicle('Diamond Manufacturers: Tips & Insights')).toBe(true)
    expect(looksLikeListicle('Acme Jewellery Trading LLC')).toBe(false)
  })

  test('companyWebsiteUrl prefers homepage', () => {
    expect(companyWebsiteUrl('https://www.acme.ae/pages/jewellery-factory?x=1')).toBe(
      'https://www.acme.ae/',
    )
  })

  test('withRegion leaves worldwide alone', () => {
    expect(withRegion('jewelry manufacturers', '')).toBe('jewelry manufacturers')
    expect(withRegion('jewelry manufacturers', 'Europe')).toBe('jewelry manufacturers Europe')
    expect(withRegion('jewelry manufacturers Europe', 'Europe')).toBe('jewelry manufacturers Europe')
  })

  test('companyName strips separators and falls back to hostname', () => {
    expect(companyName('Acme Jewellery Trading LLC | Home', 'https://acmejewellery.ae')).toBe(
      'Acme Jewellery Trading LLC',
    )
    expect(brandFromHostname('https://www.meydanfz.ae/directory')).toBe('Meydanfz')
  })

  test('assessProspect skips noise and listicles', () => {
    const noise = assessProspect({
      title: 'Cool Jewels',
      url: 'https://www.instagram.com/cooljewels',
    })
    expect(noise.ok).toBe(false)
    expect(noise.reason).toBe('noise_host')

    const good = assessProspect({
      title: 'Acme Jewellery Trading LLC',
      url: 'https://www.acme-jewellery.ae',
      snippet: 'Wholesale gold',
    })
    expect(good.ok).toBe(true)
    expect(good.companyName).toBe('Acme Jewellery Trading LLC')
  })

  test('countryFromTld and resolveCountry', () => {
    expect(countryFromTld('https://acme.ae/about')).toBe('United Arab Emirates')
    expect(countryFromTld('https://shop.co.uk')).toBe('United Kingdom')
    expect(resolveCountry({ website: 'https://x.in', region: '', existingCountry: '' })).toBe('India')
    expect(resolveCountry({ website: 'https://x.com', region: 'India', existingCountry: '' })).toBe('India')
    expect(resolveCountry({ website: 'https://x.in', region: '', existingCountry: 'Belgium' })).toBe('Belgium')
    expect(normalizeRegionLabel('Worldwide')).toBe('')
    expect(normalizeRegionLabel('Europe')).toBe('Europe')
  })
})

describe('contactFind parsers', () => {
  test('extractJsonObject reads fenced JSON', () => {
    const parsed = extractJsonObject('```json\n{"people":[{"lastName":"Lee","email":"a@b.com"}]}\n```')
    expect(parsed.people[0].email).toBe('a@b.com')
  })

  test('parseContactsPayload normalizes people and fallback Main', () => {
    const withPeople = parseContactsPayload({
      people: [{ firstName: 'Ann', lastName: 'Ng', email: 'ann@acme.com', phone: '+1', title: 'Sales' }],
    })
    expect(withPeople.people[0].firstName).toBe('Ann')
    expect(withPeople.people[0].email).toBe('ann@acme.com')

    const companyOnly = parseContactsPayload({
      people: [],
      emails: ['info@acme.com'],
      phones: ['+9715000000'],
    })
    expect(companyOnly.people[0].lastName).toBe('Main')
    expect(companyOnly.people[0].email).toBe('info@acme.com')
  })
})
