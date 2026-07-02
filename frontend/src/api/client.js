const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

function getToken() {
  return localStorage.getItem('smai_token') || ''
}

export function setToken(token) {
  if (token) localStorage.setItem('smai_token', token)
  else localStorage.removeItem('smai_token')
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
