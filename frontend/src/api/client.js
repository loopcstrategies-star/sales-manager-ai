const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

function getToken() {
  return localStorage.getItem('smai_token') || ''
}

export function setToken(token) {
  if (token) localStorage.setItem('smai_token', token)
  else localStorage.removeItem('smai_token')
}

export function assetUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path) || String(path).startsWith('blob:')) return path
  const base = `${API_BASE}${path}`
  if (!String(path).startsWith('/uploads')) return base
  const token = getToken()
  if (!token) return base
  const join = base.includes('?') ? '&' : '?'
  return `${base}${join}token=${encodeURIComponent(token)}`
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const { timeoutMs, signal: outerSignal, ...fetchOpts } = options
  let signal = outerSignal
  let timer
  if (timeoutMs && !outerSignal) {
    const ctrl = new AbortController()
    signal = ctrl.signal
    timer = setTimeout(() => ctrl.abort(), timeoutMs)
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...fetchOpts, headers, signal })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.message || `Request failed (${res.status})`)
      err.code = data.code || ''
      err.data = data.data
      err.status = res.status
      throw err
    }
    return data
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Request timed out. Try again or use a shorter question.')
    }
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const authApi = {
  register: (body) => api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => api('/api/auth/me'),
}

export const chatApi = {
  send: (body, opts = {}) => api('/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    timeoutMs: opts.timeoutMs ?? 45000,
  }),
  /**
   * SSE chat stream. onEvent({ type, data }) for status|delta|done|error.
   * Returns final done payload.
   */
  stream: async (body, { onEvent, timeoutMs = 60000 } = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    }
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)

    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `Request failed (${res.status})`)
      }
      if (!res.body) throw new Error('No stream body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalPayload = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const lines = part.split('\n')
          let event = 'message'
          let dataLine = ''
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLine += line.slice(5).trim()
          }
          if (!dataLine) continue
          let data
          try {
            data = JSON.parse(dataLine)
          } catch {
            continue
          }
          onEvent?.({ type: event, data })
          if (event === 'done') finalPayload = data
          if (event === 'error') {
            throw new Error(data.message || 'Stream failed')
          }
        }
      }

      if (!finalPayload) throw new Error('Stream ended without result')
      return finalPayload
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error('Request timed out. Try again or use a shorter question.')
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  },
  sessions: () => api('/api/chat/sessions'),
  session: (id) => api(`/api/chat/sessions/${id}`),
}

export const configApi = {
  get: () => api('/api/config'),
}

export const industriesApi = {
  list: () => api('/api/industries'),
  get: (slug) => api(`/api/industries/${encodeURIComponent(slug)}`),
  categories: (slug) => api(`/api/industries/${encodeURIComponent(slug)}/categories`),
  solutions: (slug) => api(`/api/industries/${encodeURIComponent(slug)}/solutions`),
  playbook: (slug) => api(`/api/industries/${encodeURIComponent(slug)}/playbook`),
  questions: (slug) => api(`/api/industries/${encodeURIComponent(slug)}/questions`),
  scoring: (slug) => api(`/api/industries/${encodeURIComponent(slug)}/scoring`),
}

export const solutionsApi = {
  list: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') q.set(key, value)
    })
    const suffix = q.toString() ? `?${q}` : ''
    return api(`/api/solutions${suffix}`)
  },
  create: (body) => api('/api/solutions', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/solutions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  duplicate: (id) => api(`/api/solutions/${id}/duplicate`, { method: 'POST', body: '{}' }),
  archive: (id) => api(`/api/solutions/${id}`, { method: 'DELETE' }),
}

export const packagesApi = {
  list: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') q.set(key, value)
    })
    const suffix = q.toString() ? `?${q}` : ''
    return api(`/api/packages${suffix}`)
  },
  create: (body) => api('/api/packages', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/packages/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archive: (id) => api(`/api/packages/${id}`, { method: 'DELETE' }),
}

export const proposalsApi = {
  list: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') q.set(key, value)
    })
    const suffix = q.toString() ? `?${q}` : ''
    return api(`/api/proposals${suffix}`)
  },
  create: (body) => api('/api/proposals', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/proposals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
}

export const dashboardApi = {
  get: (region = '') => api(`/api/dashboard${region ? `?region=${encodeURIComponent(region)}` : ''}`),
  refresh: (region = '') => api('/api/dashboard/refresh', {
    method: 'POST',
    body: JSON.stringify({ region }),
  }),
}

export const settingsApi = {
  get: () => api('/api/settings'),
  update: (body) => api('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),
}

async function apiForm(path, formData) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`)
  }
  return data
}

export const accountsApi = {
  list: (q = '', opts = {}) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (opts.label) params.set('label', opts.label)
    if (opts.industry) params.set('industry', opts.industry)
    const qs = params.toString()
    return api(`/api/accounts${qs ? `?${qs}` : ''}`)
  },
  get: (id) => api(`/api/accounts/${id}`),
  create: (body) => api('/api/accounts', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/accounts/${id}`, { method: 'DELETE' }),
  bulkLabel: (ids, label) => api('/api/accounts/bulk-label', {
    method: 'POST',
    body: JSON.stringify({ ids, label }),
  }),
}

export const contactsApi = {
  list: (q = '', opts = {}) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (opts.needsVerify) params.set('needsVerify', '1')
    if (opts.source) params.set('source', opts.source)
    if (opts.industry) params.set('industry', opts.industry)
    const qs = params.toString()
    return api(`/api/contacts${qs ? `?${qs}` : ''}`)
  },
  get: (id) => api(`/api/contacts/${id}`),
  create: (body) => api('/api/contacts', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/contacts/${id}`, { method: 'DELETE' }),
}

export const opportunitiesApi = {
  list: (q = '', opts = {}) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (opts.industry) params.set('industry', opts.industry)
    const qs = params.toString()
    return api(`/api/opportunities${qs ? `?${qs}` : ''}`)
  },
  get: (id) => api(`/api/opportunities/${id}`),
  create: (body) => api('/api/opportunities', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/opportunities/${id}`, { method: 'DELETE' }),
  acceptRecommendation: (id, solutionId) => api(`/api/opportunities/${id}/recommendations/accept`, {
    method: 'POST',
    body: JSON.stringify({ solutionId }),
  }),
  rejectRecommendation: (id, solutionId) => api(`/api/opportunities/${id}/recommendations/reject`, {
    method: 'POST',
    body: JSON.stringify({ solutionId }),
  }),
  qualify: (id, answers) => api(`/api/opportunities/${id}/qualify`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  }),
  nextAction: (id) => api(`/api/opportunities/${id}/next-action`),
}

export const leadsApi = {
  list: (q = '', view = 'open', opts = {}) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (view) params.set('view', view)
    if (opts.industry) params.set('industry', opts.industry)
    const qs = params.toString()
    return api(`/api/leads${qs ? `?${qs}` : ''}`)
  },
  get: (id) => api(`/api/leads/${id}`),
  create: (body) => api('/api/leads', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/leads/${id}`, { method: 'DELETE' }),
  convert: (id, body = {}) => api(`/api/leads/${id}/convert`, {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  qualify: (id, answers) => api(`/api/leads/${id}/qualify`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  }),
}

export const casesApi = {
  list: (q = '', view = 'open') => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (view) params.set('view', view)
    const qs = params.toString()
    return api(`/api/cases${qs ? `?${qs}` : ''}`)
  },
  create: (body) => api('/api/cases', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/cases/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/cases/${id}`, { method: 'DELETE' }),
}

export const messagingSessionsApi = {
  list: (q = '') => api(`/api/messaging-sessions${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  create: (body) => api('/api/messaging-sessions', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/messaging-sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/messaging-sessions/${id}`, { method: 'DELETE' }),
}

export const knowledgeApi = {
  list: (q = '') => api(`/api/knowledge-articles${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  create: (body) => api('/api/knowledge-articles', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/knowledge-articles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/knowledge-articles/${id}`, { method: 'DELETE' }),
}

export const productsApi = {
  list: (q = '') => api(`/api/products${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  create: (body) => api('/api/products', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/products/${id}`, { method: 'DELETE' }),
}

export const priceBooksApi = {
  list: (q = '') => api(`/api/price-books${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  create: (body) => api('/api/price-books', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/price-books/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/price-books/${id}`, { method: 'DELETE' }),
  listEntries: (id) => api(`/api/price-books/${id}/entries`),
  upsertEntry: (id, body) => api(`/api/price-books/${id}/entries`, {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  removeEntry: (id, entryId) => api(`/api/price-books/${id}/entries/${entryId}`, { method: 'DELETE' }),
}

export const tasksApi = {
  list: ({ q = '', relatedType = '', relatedId = '', mine = false, status = '', overdue = false } = {}) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (relatedType) params.set('relatedType', relatedType)
    if (relatedId) params.set('relatedId', relatedId)
    if (mine) params.set('mine', '1')
    if (status) params.set('status', status)
    if (overdue) params.set('overdue', '1')
    const qs = params.toString()
    return api(`/api/tasks${qs ? `?${qs}` : ''}`)
  },
  create: (body) => api('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/tasks/${id}`, { method: 'DELETE' }),
}

export const calendarEventsApi = {
  list: (q = '', from = '', to = '') => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const qs = params.toString()
    return api(`/api/calendar-events${qs ? `?${qs}` : ''}`)
  },
  create: (body) => api('/api/calendar-events', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/calendar-events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/calendar-events/${id}`, { method: 'DELETE' }),
}

export const campaignsApi = {
  list: (q = '') => api(`/api/campaigns${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  create: (body) => api('/api/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/campaigns/${id}`, { method: 'DELETE' }),
  addMembers: (id, leadIds) => api(`/api/campaigns/${id}/members`, {
    method: 'POST',
    body: JSON.stringify({ leadIds }),
  }),
  listMembers: (id) => api(`/api/campaigns/${id}/members`),
}

export const uploadsApi = {
  upload: (file) => {
    const form = new FormData()
    form.append('file', file)
    return apiForm('/api/uploads', form)
  },
}

export const crmApi = {
  stats: () => api('/api/crm/stats'),
  analytics: () => api('/api/crm/analytics'),
  serviceAnalytics: () => api('/api/crm/service-analytics'),
  importCsv: (objectType, file, { mapping, preview } = {}) => {
    const form = new FormData()
    form.append('file', file)
    if (mapping) form.append('mapping', JSON.stringify(mapping))
    if (preview) form.append('preview', '1')
    return apiForm(`/api/crm/import/${objectType}`, form)
  },
  downloadImportTemplate: async (objectType) => {
    const headers = {}
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`${API_BASE}/api/crm/import/template/${objectType}`, { headers })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || `Request failed (${res.status})`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${objectType}-template.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
  enrich: (body) => api('/api/crm/enrich', { method: 'POST', body: JSON.stringify(body) }),
  prospectSearch: (query, region = '', options = {}) => api('/api/crm/prospect/search', {
    method: 'POST',
    body: JSON.stringify({
      query,
      region: region || undefined,
      industrySlug: options.industrySlug || undefined,
      businessType: options.businessType || undefined,
    }),
  }),
  prospectImport: (body) => api('/api/crm/prospect/import', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  enrichRefresh: (cap) => api('/api/crm/enrich/refresh', {
    method: 'POST',
    body: JSON.stringify({ cap }),
  }),
  contactsFromAccounts: (cap = 50) => api('/api/crm/contacts/from-accounts', {
    method: 'POST',
    body: JSON.stringify({ cap }),
  }),
  prospectBulk: (body = {}) => api('/api/crm/prospect/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  prospectCleanupNoise: () => api('/api/crm/prospect/cleanup-noise', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  findContacts: (body) => api('/api/crm/prospect/find-contacts', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  findContactsBatch: (body = {}) => api('/api/crm/prospect/find-contacts-batch', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  backfillGeo: (body = {}) => api('/api/crm/prospect/backfill-geo', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  hunterContacts: (body) => api('/api/crm/prospect/hunter-contacts', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  dedupeEmails: (del = false) => api('/api/crm/contacts/dedupe-emails', {
    method: 'POST',
    body: JSON.stringify({ delete: Boolean(del) }),
  }),
  markVerified: (ids = null) => api('/api/crm/contacts/mark-verified', {
    method: 'POST',
    body: JSON.stringify(ids?.length ? { ids } : {}),
  }),
  emailDraft: (body) => api('/api/crm/email-draft', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  emailSend: (body) => api('/api/crm/email-send', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  aiSummarize: (body) => api('/api/crm/ai/summarize', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  aiCreateTask: (body) => api('/api/crm/ai/summarize/create-task', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  replyAssist: (body) => api('/api/crm/ai/reply-assist', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  sequenceLite: (body) => api('/api/crm/ai/sequence-lite', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  meetingNotes: (body) => api('/api/crm/ai/meeting-notes', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  digest: (refresh = false) => api(`/api/crm/digest${refresh ? '?refresh=1' : ''}`),
  scoreLeads: (body = {}) => api('/api/crm/leads/score', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  staleDealsScan: (body = {}) => api('/api/crm/stale-deals/scan', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  companySearch: (params = {}) => {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value != null && value !== '') query.set(key, value)
    })
    const qs = query.toString()
    return api(`/api/crm/companies/search${qs ? `?${qs}` : ''}`)
  },
  companyIntelligence: (id) => api(`/api/crm/companies/${id}/intelligence`),
  researchCompany: (id) => api(`/api/crm/companies/${id}/research`, { method: 'POST', body: JSON.stringify({}) }),
  scoreCompany: (id) => api(`/api/crm/companies/${id}/score`, { method: 'POST', body: JSON.stringify({}) }),
  companyRecommendations: (id) => api(`/api/crm/companies/${id}/recommendations`),
  companyContacts: (id) => api(`/api/crm/companies/${id}/contacts`),
  createLeadFromCompany: (body) => api('/api/crm/leads/from-company', { method: 'POST', body: JSON.stringify(body) }),
  createOpportunityFromCompany: (body) => api('/api/crm/opportunities/from-company', { method: 'POST', body: JSON.stringify(body) }),
}

