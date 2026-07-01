const Workspace = require('../models/Workspace')

function getLoopcBaseUrl() {
  return String(process.env.LOOPC_API_BASE_URL || 'https://api.loopcstrategies.com').replace(/\/$/, '')
}

async function getWorkspaceConnection(workspaceId) {
  if (!workspaceId) return null
  const ws = await Workspace.findById(workspaceId).lean()
  if (!ws?.loopcConnection?.apiKey) return null
  return ws.loopcConnection
}

async function loopcFetch(path, connection, options = {}) {
  const base = getLoopcBaseUrl()
  const url = `${base}${path}`
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Integration-Key': connection.apiKey,
      'X-Tenant': connection.tenant || 'loopc',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  let data = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { message: text } }
  if (!res.ok) {
    const err = new Error(data.message || `LoopC API ${res.status}`)
    err.statusCode = res.status
    throw err
  }
  return data
}

async function fetchCrmSnapshot(workspaceId) {
  const connection = await getWorkspaceConnection(workspaceId)
  if (!connection) return null
  const data = await loopcFetch('/api/integrations/sales-ai/crm-snapshot', connection)
  return data.snapshot || null
}

async function fetchInboxSummary(workspaceId) {
  const connection = await getWorkspaceConnection(workspaceId)
  if (!connection) return null
  const data = await loopcFetch('/api/integrations/sales-ai/inbox-summary', connection)
  return data.inbox || null
}

async function fetchMetalRates(workspaceId) {
  const connection = await getWorkspaceConnection(workspaceId)
  if (!connection) return null
  try {
    const data = await loopcFetch('/api/integrations/sales-ai/metal-rates', connection)
    return data.metals || null
  } catch {
    return null
  }
}

async function testConnection(tenant, apiKey) {
  const connection = { tenant, apiKey }
  await loopcFetch('/api/integrations/sales-ai/health', connection)
  return true
}

module.exports = {
  getLoopcBaseUrl,
  fetchCrmSnapshot,
  fetchInboxSummary,
  fetchMetalRates,
  testConnection,
}
