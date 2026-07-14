const { searchWithCache, isSearchConfigured } = require('./webSearch')
const { createChatCompletion, isOpenAiConfigured } = require('./openAiClient')
const { withRegion, hostnameOf } = require('./prospectQuality')
const { fetchCompanySiteText } = require('./websitePageText')

function extractJsonObject(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : raw
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function normalizePerson(p) {
  if (!p || typeof p !== 'object') return null
  const firstName = String(p.firstName || p.first_name || '').trim().slice(0, 100)
  const lastName = String(p.lastName || p.last_name || p.name || '').trim().slice(0, 100)
  const email = String(p.email || '').trim().toLowerCase().slice(0, 200)
  const phone = String(p.phone || '').trim().slice(0, 60)
  const title = String(p.title || p.role || '').trim().slice(0, 120)
  if (!lastName && !email && !phone && !firstName) return null
  const parts = lastName.split(/\s+/).filter(Boolean)
  let fn = firstName
  let ln = lastName
  if (!fn && parts.length >= 2) {
    fn = parts[0]
    ln = parts.slice(1).join(' ')
  }
  if (!ln) ln = email ? email.split('@')[0].slice(0, 100) : 'Contact'
  return {
    firstName: fn,
    lastName: ln.slice(0, 100),
    email: email.includes('@') ? email : '',
    phone,
    title,
  }
}

function parseContactsPayload(parsed) {
  const people = []
  const list = Array.isArray(parsed?.people)
    ? parsed.people
    : Array.isArray(parsed?.contacts)
      ? parsed.contacts
      : []
  for (const item of list.slice(0, 10)) {
    const n = normalizePerson(item)
    if (n) people.push(n)
  }

  const phones = []
  const emails = []
  ;(Array.isArray(parsed?.phones) ? parsed.phones : []).forEach((x) => {
    const v = String(x || '').trim().slice(0, 60)
    if (v) phones.push(v)
  })
  ;(Array.isArray(parsed?.emails) ? parsed.emails : []).forEach((x) => {
    const v = String(x || '').trim().toLowerCase().slice(0, 200)
    if (v.includes('@')) emails.push(v)
  })

  // Promote company-level emails/phones into a Main contact if no people
  if (!people.length && (emails.length || phones.length)) {
    people.push({
      firstName: '',
      lastName: 'Main',
      email: emails[0] || '',
      phone: phones[0] || '',
      title: '',
    })
  }

  return {
    people: people.slice(0, 8),
    phones: [...new Set(phones)].slice(0, 8),
    emails: [...new Set(emails)].slice(0, 8),
    companyPhone: phones[0] || people.find((p) => p.phone)?.phone || '',
    companyEmail: emails[0] || '',
  }
}

/** Stub “Main” contacts should not block Find on an Account. */
function isStubContact(doc) {
  const ln = String(doc?.lastName || '').trim().toLowerCase()
  const fn = String(doc?.firstName || '').trim()
  return ln === 'main' && !fn
}

async function findContactsForCompany({ name, website, region } = {}) {
  const company = String(name || '').trim()
  const site = String(website || '').trim()
  const host = hostnameOf(site)

  if (!isSearchConfigured()) {
    return { ok: false, error: 'Web search is not configured.', people: [], sources: [] }
  }
  if (!isOpenAiConfigured()) {
    return { ok: false, error: 'GROQ_API_KEY or OPENAI_API_KEY is required to find contacts.', people: [], sources: [] }
  }
  if (!company && !site) {
    return { ok: false, error: 'Need company name or website.', people: [], sources: [] }
  }

  const baseQuery = [company, host || site, 'contact email phone'].filter(Boolean).join(' ')
  const teamQuery = withRegion(
    [company, host || site, 'team OR staff OR "sales manager" OR director email'].filter(Boolean).join(' '),
    region,
  )
  const query = withRegion(baseQuery, region)

  const [search, teamSearch, sitePages] = await Promise.all([
    searchWithCache(query, { maxResults: 6, searchDepth: 'basic' }),
    searchWithCache(teamQuery, { maxResults: 4, searchDepth: 'basic' }),
    fetchCompanySiteText(site),
  ])

  if (search.error && !(search.results || []).length && !sitePages.text) {
    return { ok: false, error: search.error, people: [], sources: [] }
  }

  const snippets = []
  if (search.answer) snippets.push(String(search.answer))
  const allResults = [...(search.results || []), ...(teamSearch.results || [])]
  const seenUrl = new Set()
  allResults.forEach((r) => {
    const url = String(r.url || '')
    if (url && seenUrl.has(url)) return
    if (url) seenUrl.add(url)
    snippets.push(`Title: ${r.title || ''}\nURL: ${url}\n${r.content || ''}`)
  })
  const blob = snippets.join('\n\n').slice(0, 8000)
  const pageBlob = String(sitePages.text || '').slice(0, 10000)

  const system = [
    'You extract publicly listed business contact details from website page text and web search snippets.',
    'Return ONLY valid JSON with this shape:',
    '{"people":[{"firstName":"","lastName":"","email":"","phone":"","title":""}],"phones":[],"emails":[]}',
    'Rules:',
    '- Prefer named people (sales, purchasing, owners, directors) over generic inboxes when both appear.',
    '- Only include emails/phones clearly present in the provided text.',
    '- Prefer company contact emails (info@, sales@, contact@) and named staff if shown.',
    '- Do not invent names or emails. If unsure, omit.',
    '- Max 8 people. Empty arrays are OK.',
  ].join('\n')

  const user = [
    `Company: ${company || host || 'Unknown'}`,
    `Website: ${site || 'Unknown'}`,
    region ? `Region focus: ${region}` : 'Region focus: Worldwide',
    '',
    'Website pages (scraped text):',
    pageBlob || '(none fetched)',
    '',
    'Search snippets:',
    blob || '(none)',
  ].join('\n')

  let raw
  try {
    raw = await createChatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { temperature: 0.1, maxTokens: 1100, retryOnRateLimit: true },
    )
  } catch (err) {
    return { ok: false, error: err.message || 'LLM failed', people: [], sources: [] }
  }

  const parsed = extractJsonObject(raw)
  const sources = [
    ...(sitePages.urls || []).map((url) => ({ title: 'Company site', url })),
    ...allResults.slice(0, 4).map((r) => ({ title: r.title, url: r.url })),
  ]
  if (!parsed) {
    return {
      ok: false,
      error: 'Could not parse contact JSON from model.',
      people: [],
      sources,
      raw,
    }
  }

  const normalized = parseContactsPayload(parsed)
  return {
    ok: true,
    error: null,
    ...normalized,
    sources,
    provider: search.provider || null,
    query,
    pagesFetched: (sitePages.urls || []).length,
  }
}

module.exports = {
  findContactsForCompany,
  extractJsonObject,
  parseContactsPayload,
  normalizePerson,
  isStubContact,
}
