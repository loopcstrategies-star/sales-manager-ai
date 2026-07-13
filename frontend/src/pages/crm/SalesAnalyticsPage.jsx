import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { crmApi } from '../../api/client'

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'browse', label: 'Browse' },
  { id: 'favorites', label: 'Favorites' },
]

const COLLECTIONS = [
  { id: 'sales', label: 'Sales', color: '#1b96ff' },
  { id: 'service', label: 'Service', color: '#e5677a' },
]

export default function SalesAnalyticsPage() {
  const [nav, setNav] = useState('home')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await crmApi.analytics()
        if (!cancelled) {
          setData(res.data)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load analytics')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const totals = data?.totals || {}
  const stages = data?.pipelineByStage || []
  const maxStageAmount = Math.max(1, ...stages.map((s) => s.amount || 0))

  return (
    <div className="crm-analytics-layout">
      <aside className="crm-analytics-sidebar" aria-label="Analytics navigation">
        <h2 className="crm-analytics-sidebar-title">Analytics</h2>
        <nav className="crm-analytics-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`crm-analytics-nav-item${nav === item.id ? ' active' : ''}`}
              onClick={() => setNav(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="crm-analytics-collections">
          <div className="crm-analytics-collections-head">
            <span>Collections</span>
          </div>
          {COLLECTIONS.map((c) => (
            <button key={c.id} type="button" className="crm-analytics-collection">
              <span className="crm-analytics-dot" style={{ background: c.color }} />
              {c.label}
            </button>
          ))}
        </div>
      </aside>

      <div className="crm-analytics-main">
        <header className="crm-analytics-header">
          <h1>{nav === 'home' ? 'Sales Analytics' : nav === 'browse' ? 'Browse' : 'Favorites'}</h1>
          <Link className="crm-btn-secondary" to="/sales/pipeline">Open Pipeline</Link>
        </header>

        {error ? <p className="crm-banner-error">{error}</p> : null}
        {loading ? <p className="crm-muted">Loading…</p> : null}

        {nav === 'home' && !loading && data ? (
          <>
            <div className="crm-stat-grid">
              <div className="crm-stat-card">
                <span className="crm-stat-label">Open Opportunities</span>
                <strong className="crm-stat-value">{totals.openOpportunities ?? 0}</strong>
              </div>
              <div className="crm-stat-card">
                <span className="crm-stat-label">Pipeline Amount</span>
                <strong className="crm-stat-value">${Number(totals.pipelineAmount || 0).toLocaleString()}</strong>
              </div>
              <div className="crm-stat-card">
                <span className="crm-stat-label">Won Amount</span>
                <strong className="crm-stat-value">${Number(totals.wonAmount || 0).toLocaleString()}</strong>
              </div>
              <div className="crm-stat-card">
                <span className="crm-stat-label">Win Rate</span>
                <strong className="crm-stat-value">{totals.winRate ?? 0}%</strong>
              </div>
              <div className="crm-stat-card">
                <span className="crm-stat-label">Open Leads</span>
                <strong className="crm-stat-value">{totals.openLeads ?? 0}</strong>
              </div>
              <div className="crm-stat-card">
                <span className="crm-stat-label">Leads This Week</span>
                <strong className="crm-stat-value">{totals.leadsThisWeek ?? 0}</strong>
              </div>
            </div>

            <section className="crm-home-panel" style={{ marginTop: '1rem' }}>
              <h3>Pipeline by Stage</h3>
              <div className="crm-analytics-bars">
                {stages.length === 0 ? <p className="crm-muted">No opportunities yet.</p> : stages.map((s) => (
                  <div key={s.stage} className="crm-analytics-bar-row">
                    <span>{s.stage}</span>
                    <div className="crm-analytics-bar-track">
                      <div
                        className="crm-analytics-bar-fill"
                        style={{ width: `${Math.round(((s.amount || 0) / maxStageAmount) * 100)}%` }}
                      />
                    </div>
                    <em>{s.count} · ${Number(s.amount || 0).toLocaleString()}</em>
                  </div>
                ))}
              </div>
            </section>

            <section className="crm-home-panel" style={{ marginTop: '1rem' }}>
              <h3>Recently Updated Opportunities</h3>
              {(data.recentOpportunities || []).length === 0 ? (
                <p className="crm-muted">No opportunities yet.</p>
              ) : (
                <ul className="crm-recent-list">
                  {data.recentOpportunities.map((o) => (
                    <li key={o.id}>
                      <Link to={`/sales/pipeline/${o.id}`}>{o.name}</Link>
                      <span>{o.stage} · ${Number(o.amount || 0).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}

        {nav !== 'home' ? (
          <p className="crm-muted">Saved folders and favorites will appear here. Use Home for live pipeline metrics.</p>
        ) : null}
      </div>
    </div>
  )
}
