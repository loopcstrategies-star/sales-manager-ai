const {
  assessProspect,
  companyName,
  isNoiseHost,
  looksLikeListicle,
  brandFromHostname,
} = require('../services/prospectQuality')

describe('prospectQuality', () => {
  test('flags noise hosts', () => {
    expect(isNoiseHost('https://www.instagram.com/somejeweller')).toBe(true)
    expect(isNoiseHost('https://economictimes.indiatimes.com/articleshow/1')).toBe(true)
    expect(isNoiseHost('https://www.facebook.com/pages/x')).toBe(true)
    expect(isNoiseHost('https://www.acme-jewellery.ae/about')).toBe(false)
  })

  test('detects listicle titles', () => {
    expect(looksLikeListicle('Importing Jewellery from India to Dubai: Licence & Compliance Checklist')).toBe(true)
    expect(looksLikeListicle('Top 10 Gold Wholesalers in Dubai')).toBe(true)
    expect(looksLikeListicle('India Gem & Jewellery Awards')).toBe(true)
    expect(looksLikeListicle('Acme Jewellery Trading LLC')).toBe(false)
  })

  test('companyName strips separators and falls back to hostname', () => {
    expect(companyName('Acme Jewellery Trading LLC | Home', 'https://acmejewellery.ae')).toBe(
      'Acme Jewellery Trading LLC',
    )
    expect(
      companyName(
        'Importing Jewellery from India to Dubai: Checklist',
        'https://www.gjepc.org/news/1',
      ),
    ).toBe('Gjepc')
    expect(brandFromHostname('https://www.meydanfz.ae/directory')).toBe('Meydanfz')
  })

  test('assessProspect skips noise and listicles', () => {
    const noise = assessProspect({
      title: 'Cool Jewels',
      url: 'https://www.instagram.com/cooljewels',
    })
    expect(noise.ok).toBe(false)
    expect(noise.reason).toBe('noise_host')

    const listicle = assessProspect({
      title: 'Best 10 diamond traders UAE — Guide 2024',
      url: 'https://example-traders.ae/blog',
    })
    expect(listicle.ok).toBe(false)
    expect(listicle.reason).toBe('listicle')

    const good = assessProspect({
      title: 'Acme Jewellery Trading LLC',
      url: 'https://www.acme-jewellery.ae',
      snippet: 'Wholesale gold in Dubai',
    })
    expect(good.ok).toBe(true)
    expect(good.companyName).toBe('Acme Jewellery Trading LLC')
    expect(good.score).toBeGreaterThan(50)
  })
})
