import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { crmApi } from '../../api/client'

export default function ServiceAnalyticsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await crmApi.serviceAnalytics()
        if (!cancelled) {
          setData(res.data)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load service analytics')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const totals = data?.totals || {}
  const byStatus = data?.byStatus || []
  const byPriority = data?.byPriority || []
  const maxStatus = Math.max(1, ...byStatus.map((s) => s.count || 0))
  const maxPriority = Math.max(1, ...byPriority.map((s) => s.count || 0))

  return (
    <div className="crm-analytics-layout">
      <aside className="crm-analytics-sidebar" aria-label="Service analytics">
        <h2 className="crm-analytics-sidebar-title">Service</h2>
        <nav className="crm-analytics-nav">
          <button type="button" className="crm-analytics-nav-item active">Home</button>
        </nav>
        <p className="crm-muted" style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
          Live case metrics for this workspace.
        </p>
      </aside>

      <div className="crm-analytics-main">
        <header className="crm-analytics-header">
          <h1>Service Analytics</h1>
          <Link className="crm-btn-secondary" to="/sales/service/cases">Open Cases</Link>
        </header>

        {error ? <p className="crm-banner-error">{error}</p> : null}
        {loading ? <p className="crm-muted">Loading…</p> : null}

        {!loading && data ? (
          <>
            <div className="crm-stat-grid">
              <div className="crm-stat-card">
                <span className="crm-stat-label">Open cases</span>
                <strong className="crm-stat-value">{totals.open ?? 0}</strong>
              </div>
              <div className="crm-stat-card">
                <span className="crm-stat-label">Closed</span>
                <strong className="crm-stat-value">{totals.closed ?? 0}</strong>
              </div>
              <div className="crm-stat-card">
                <span className="crm-stat-label">Escalated</span>
                <strong className="crm-stat-value">{totals.escalated ?? 0}</strong>
              </div>
              <div className="crm-stat-card">
                <span className="crm-stat-label">Opened this week</span>
                <strong className="crm-stat-value">{totals.openedThisWeek ?? 0}</strong>
              </div>
              <div className="crm-stat-card">
                <span className="crm-stat-label">Total cases</span>
                <strong className="crm-stat-value">{totals.total ?? 0}</strong>
              </div>
            </div>

            <div className="crm-home-columns" style={{ marginTop: '1rem' }}>
              <section className="crm-home-panel">
                <h3>Cases by status</h3>
                <div className="crm-analytics-bars">
                  {byStatus.length === 0 ? <p className="crm-muted">No cases yet.</p> : byStatus.map((s) => (
                    <div key={s.status} className="crm-analytics-bar-row">
                      <span>{s.status}</span>
                      <div className="crm-analytics-bar-track">
                        <div
                          className="crm-analytics-bar-fill"
                          style={{ width: `${Math.round(((s.count || 0) / maxStatus) * 100)}%` }}
                        />
                      </div>
                      <em>{s.count}</em>
                    </div>
                  ))}
                </div>
              </section>
              <section className="crm-home-panel">
                <h3>Cases by priority</h3>
                <div className="crm-analytics-bars">
                  {byPriority.length === 0 ? <p className="crm-muted">No cases yet.</p> : byPriority.map((s) => (
                    <div key={s.priority} className="crm-analytics-bar-row">
                      <span>{s.priority}</span>
                      <div className="crm-analytics-bar-track">
                        <div
                          className="crm-analytics-bar-fill"
                          style={{ width: `${Math.round(((s.count || 0) / maxPriority) * 100)}%` }}
                        />
                      </div>
                      <em>{s.count}</em>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="crm-home-columns" style={{ marginTop: '1rem' }}>
              <section className="crm-home-panel">
                <h3>Owner workload</h3>
                {(data.ownerLeaderboard || []).length === 0 ? (
                  <p className="crm-muted">No owners yet.</p>
                ) : (
                  <ul className="crm-recent-list">
                    {data.ownerLeaderboard.map((r) => (
                      <li key={r.ownerId}>
                        <span>{r.ownerName}</span>
                        <span>open {r.open} · closed {r.closed}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="crm-home-panel">
                <h3>Recently updated open cases</h3>
                {(data.recentOpen || []).length === 0 ? (
                  <p className="crm-muted">No open cases.</p>
                ) : (
                  <ul className="crm-recent-list">
                    {data.recentOpen.map((c) => (
                      <li key={c.id}>
                        <Link to="/sales/service/cases">
                          {c.caseNumber ? `${c.caseNumber} · ` : ''}{c.subject}
                        </Link>
                        <span>{c.status} · {c.priority}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
