const { searchWithCache, isSearchConfigured } = require('./webSearch')
const { createChatCompletion, isOpenAiConfigured } = require('./openAiClient')
const { withRegion, hostnameOf } = require('./prospectQuality')

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
  for (const item of list.slice(0, 8)) {
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
    people: people.slice(0, 5),
    phones: [...new Set(phones)].slice(0, 5),
    emails: [...new Set(emails)].slice(0, 5),
    companyPhone: phones[0] || people.find((p) => p.phone)?.phone || '',
    companyEmail: emails[0] || '',
  }
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
  const query = withRegion(baseQuery, region)
  const search = await searchWithCache(query, { maxResults: 6, searchDepth: 'basic' })
  if (search.error && !(search.results || []).length) {
    return { ok: false, error: search.error, people: [], sources: [] }
  }

  const snippets = []
  if (search.answer) snippets.push(String(search.answer))
  ;(search.results || []).forEach((r) => {
    snippets.push(`Title: ${r.title || ''}\nURL: ${r.url || ''}\n${r.content || ''}`)
  })
  const blob = snippets.join('\n\n').slice(0, 9000)

  const system = [
    'You extract publicly listed business contact details from web search snippets.',
    'Return ONLY valid JSON with this shape:',
    '{"people":[{"firstName":"","lastName":"","email":"","phone":"","title":""}],"phones":[],"emails":[]}',
    'Rules:',
    '- Only include emails/phones clearly present in the snippets.',
    '- Prefer company contact emails (info@, sales@, contact@) and named staff if shown.',
    '- Do not invent names or emails. If unsure, omit.',
    '- Max 5 people. Empty arrays are OK.',
  ].join('\n')

  const user = [
    `Company: ${company || host || 'Unknown'}`,
    `Website: ${site || 'Unknown'}`,
    region ? `Region focus: ${region}` : 'Region focus: Worldwide',
    '',
    'Snippets:',
    blob || '(none)',
  ].join('\n')

  let raw
  try {
    raw = await createChatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { temperature: 0.1, maxTokens: 900, retryOnRateLimit: true },
    )
  } catch (err) {
    return { ok: false, error: err.message || 'LLM failed', people: [], sources: [] }
  }

  const parsed = extractJsonObject(raw)
  if (!parsed) {
    return {
      ok: false,
      error: 'Could not parse contact JSON from model.',
      people: [],
      sources: (search.results || []).slice(0, 3).map((r) => ({ title: r.title, url: r.url })),
      raw,
    }
  }

  const normalized = parseContactsPayload(parsed)
  return {
    ok: true,
    error: null,
    ...normalized,
    sources: (search.results || []).slice(0, 3).map((r) => ({ title: r.title, url: r.url })),
    provider: search.provider || null,
    query,
  }
}

module.exports = {
  findContactsForCompany,
  extractJsonObject,
  parseContactsPayload,
  normalizePerson,
}
