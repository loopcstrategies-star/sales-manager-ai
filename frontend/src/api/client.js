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
  return `${API_BASE}${path}`
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`)
  }
  return data
}

export const authApi = {
  register: (body) => api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => api('/api/auth/me'),
}

export const chatApi = {
  send: (body) => api('/api/chat', { method: 'POST', body: JSON.stringify(body) }),
  sessions: () => api('/api/chat/sessions'),
  session: (id) => api(`/api/chat/sessions/${id}`),
}

export const configApi = {
  get: () => api('/api/config'),
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
  list: (q = '') => api(`/api/accounts${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  get: (id) => api(`/api/accounts/${id}`),
  create: (body) => api('/api/accounts', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/accounts/${id}`, { method: 'DELETE' }),
}

export const contactsApi = {
  list: (q = '') => api(`/api/contacts${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  get: (id) => api(`/api/contacts/${id}`),
  create: (body) => api('/api/contacts', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/contacts/${id}`, { method: 'DELETE' }),
}

export const opportunitiesApi = {
  list: (q = '') => api(`/api/opportunities${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  create: (body) => api('/api/opportunities', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/opportunities/${id}`, { method: 'DELETE' }),
}

export const leadsApi = {
  list: (q = '', view = 'open') => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (view) params.set('view', view)
    const qs = params.toString()
    return api(`/api/leads${qs ? `?${qs}` : ''}`)
  },
  get: (id) => api(`/api/leads/${id}`),
  create: (body) => api('/api/leads', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/api/leads/${id}`, { method: 'DELETE' }),
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
  prospectSearch: (query) => api('/api/crm/prospect/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
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
}

