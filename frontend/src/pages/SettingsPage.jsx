import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { integrationsApi } from '../api/client'

export default function SettingsPage() {
  const { workspace, refresh } = useAuth()
  const [tenant, setTenant] = useState(workspace?.loopcTenant || 'loopc')
  const [apiKey, setApiKey] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleConnect(e) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      await integrationsApi.connectLoopc({ tenant, apiKey })
      setMessage('LoopC Ops connected successfully.')
      setApiKey('')
      await refresh()
    } catch (err) {
      setMessage(err.message || 'Connection failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    setBusy(true)
    try {
      await integrationsApi.disconnectLoopc()
      setMessage('Disconnected from LoopC Ops.')
      await refresh()
    } catch (err) {
      setMessage(err.message || 'Disconnect failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>Settings</h1>
        <Link to="/" style={{ color: '#fff' }}>Back to chat</Link>
      </header>
      <div style={{ maxWidth: 520, margin: '2rem auto', padding: '0 1rem' }}>
        <div className="auth-card" style={{ margin: 0 }}>
          <h2 style={{ marginTop: 0 }}>Connect LoopC Ops</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Link your LoopC ops-dashboard workspace to unlock CRM pipeline and company inbox analysis.
            Generate an API key in LoopC Admin → Integrations.
          </p>
          {workspace?.loopcConnected ? (
            <div>
              <p>Connected to tenant: <strong>{workspace.loopcTenant}</strong></p>
              <button type="button" className="btn btn-secondary" onClick={handleDisconnect} disabled={busy}>
                Disconnect
              </button>
            </div>
          ) : (
            <form onSubmit={handleConnect}>
              <label style={{ fontSize: '0.85rem' }}>
                Tenant
                <input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="loopc" />
              </label>
              <label style={{ fontSize: '0.85rem' }}>
                API key
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste integration API key"
                  required
                />
              </label>
              <button className="btn" type="submit" disabled={busy}>Connect</button>
            </form>
          )}
          {message && <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>{message}</p>}
        </div>
      </div>
    </div>
  )
}
