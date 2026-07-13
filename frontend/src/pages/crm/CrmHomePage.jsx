import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { crmApi } from '../../api/client'

export default function CrmHomePage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await crmApi.stats()
        if (!cancelled) setData(res.data)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load home')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const counts = data?.counts || {}

  return (
    <div className="crm-home">
      <header className="crm-home-header">
        <h2>Home</h2>
        <p>Your CRM snapshot — contacts, accounts, deals, and service.</p>
      </header>

      {error ? <p className="crm-banner-error">{error}</p> : null}
      {loading ? <p className="crm-muted">Loading…</p> : null}

      {!loading && !error ? (
        <>
          <div className="crm-stat-grid">
            <div className="crm-stat-card">
              <span className="crm-stat-label">Contacts</span>
              <strong className="crm-stat-value">{counts.contacts ?? 0}</strong>
            </div>
            <div className="crm-stat-card">
              <span className="crm-stat-label">Accounts</span>
              <strong className="crm-stat-value">{counts.accounts ?? 0}</strong>
            </div>
            <div className="crm-stat-card">
              <span className="crm-stat-label">Open Deals</span>
              <strong className="crm-stat-value">{counts.openDeals ?? 0}</strong>
            </div>
            <div className="crm-stat-card">
              <span className="crm-stat-label">Open Cases</span>
              <strong className="crm-stat-value">{counts.openCases ?? 0}</strong>
            </div>
            <div className="crm-stat-card">
              <span className="crm-stat-label">Campaigns</span>
              <strong className="crm-stat-value">{counts.campaigns ?? 0}</strong>
            </div>
          </div>

          <div className="crm-home-actions">
            <Link className="crm-btn-primary" to="/sales/contacts">New Contact</Link>
            <Link className="crm-btn-secondary" to="/sales/accounts">New Account</Link>
            <Link className="crm-btn-secondary" to="/sales/pipeline">View Pipeline</Link>
          </div>

          <div className="crm-home-columns">
            <section className="crm-home-panel">
              <h3>Recent Contacts</h3>
              {(data?.recentContacts || []).length === 0 ? (
                <p className="crm-muted">No contacts yet.</p>
              ) : (
                <ul className="crm-recent-list">
                  {data.recentContacts.map((c) => (
                    <li key={c._id}>
                      <Link to="/sales/contacts">{c.fullName || 'Contact'}</Link>
                      <span>{c.accountName || c.email || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="crm-home-panel">
              <h3>Recent Accounts</h3>
              {(data?.recentAccounts || []).length === 0 ? (
                <p className="crm-muted">No accounts yet.</p>
              ) : (
                <ul className="crm-recent-list">
                  {data.recentAccounts.map((a) => (
                    <li key={a._id}>
                      <Link to="/sales/accounts">{a.name}</Link>
                      <span>{a.website || a.phone || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  )
}
