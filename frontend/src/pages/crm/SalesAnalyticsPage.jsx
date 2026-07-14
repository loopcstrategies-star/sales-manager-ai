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
                <span className="crm-stat-label">Weighted forecast</span>
                <strong className="crm-stat-value">${Number(totals.weightedPipeline || 0).toLocaleString()}</strong>
              </div>
              <div className="crm-stat-card">
                <span className="crm-stat-label">Avg deal size</span>
                <strong className="crm-stat-value">${Number(totals.avgDealSize || 0).toLocaleString()}</strong>
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
                <span className="crm-stat-label">Overdue closes</span>
                <strong className="crm-stat-value">{totals.overdue ?? 0}</strong>
              </div>
              <div className="crm-stat-card">
                <span className="crm-stat-label">Closing this month (weighted)</span>
                <strong className="crm-stat-value">${Number(totals.closingThisMonthWeighted || 0).toLocaleString()}</strong>
              </div>
              <div className="crm-stat-card">
                <span className="crm-stat-label">Needs verify</span>
                <strong className="crm-stat-value">{data.contactQuality?.needsVerify ?? 0}</strong>
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
                    <em>
                      {s.count} · ${Number(s.amount || 0).toLocaleString()}
                      {s.weighted != null ? ` · w $${Number(s.weighted || 0).toLocaleString()}` : ''}
                    </em>
                  </div>
                ))}
              </div>
              <p className="crm-muted" style={{ marginTop: '0.5rem' }}>
                Stage defaults: Prospecting 10%, Qualification 25%, Proposal 50%, Negotiation 75%.
              </p>
            </section>

            <section className="crm-home-panel" style={{ marginTop: '1rem' }}>
              <h3>Forecast by close month (weighted)</h3>
              {(data.forecastByMonth || []).length === 0 ? (
                <p className="crm-muted">Set close dates on open Opportunities to see monthly forecast.</p>
              ) : (
                <ul className="crm-recent-list">
                  {data.forecastByMonth.map((m) => (
                    <li key={m.month}>
                      <span>{m.month}</span>
                      <span>
                        {m.count} deals · ${Number(m.amount || 0).toLocaleString()} · weighted ${Number(m.weighted || 0).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="crm-home-columns" style={{ marginTop: '1rem' }}>
              <section className="crm-home-panel">
                <h3>Pipeline $ by Country</h3>
                {(data.pipelineByCountry || []).length === 0 ? (
                  <p className="crm-muted">No open pipeline with country yet.</p>
                ) : (
                  <ul className="crm-recent-list">
                    {data.pipelineByCountry.map((r) => (
                      <li key={r.label}>
                        <span>{r.label}</span>
                        <span>{r.count} · ${Number(r.amount || 0).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="crm-home-panel">
                <h3>Owner leaderboard</h3>
                {(data.ownerLeaderboard || []).length === 0 ? (
                  <p className="crm-muted">No owners yet.</p>
                ) : (
                  <ul className="crm-recent-list">
                    {data.ownerLeaderboard.map((r) => (
                      <li key={r.ownerId}>
                        <span>{r.ownerName}</span>
                        <span>
                          open {r.openCount} · ${Number(r.openAmount || 0).toLocaleString()}
                          {r.wonCount ? ` · won $${Number(r.wonAmount || 0).toLocaleString()}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="crm-home-columns" style={{ marginTop: '1rem' }}>
              <section className="crm-home-panel">
                <h3>Contact quality</h3>
                <ul className="crm-recent-list">
                  <li>
                    <Link to="/sales/contacts?needsVerify=1">Needs verify</Link>
                    <span>{data.contactQuality?.needsVerify ?? 0} ({data.contactQuality?.verifyPct ?? 0}%)</span>
                  </li>
                  <li>
                    <span>Missing email</span>
                    <span>{data.contactQuality?.missingEmail ?? 0}</span>
                  </li>
                </ul>
                <h4 style={{ marginTop: '0.75rem' }}>By source</h4>
                {(data.contactQuality?.sourceMix || []).length === 0 ? (
                  <p className="crm-muted">No contacts.</p>
                ) : (
                  <ul className="crm-recent-list">
                    {data.contactQuality.sourceMix.map((r) => (
                      <li key={r.label}>
                        <Link to={`/sales/contacts?source=${encodeURIComponent(r.label)}`}>
                          {r.label === 'web_llm' ? 'AI / web' : r.label}
                        </Link>
                        <span>{r.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="crm-home-panel">
                <h3>Accounts by Region</h3>
                {(data.byRegion || []).length === 0 ? (
                  <p className="crm-muted">No region data.</p>
                ) : (
                  <ul className="crm-recent-list">
                    {data.byRegion.map((r) => (
                      <li key={r.label}>
                        <Link to={`/sales/accounts?region=${encodeURIComponent(r.label === 'Unknown' ? '' : r.label)}`}>
                          {r.label}
                        </Link>
                        <span>{r.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="crm-home-columns" style={{ marginTop: '1rem' }}>
              <section className="crm-home-panel">
                <h3>Accounts by Country</h3>
                {(data.byCountry || []).length === 0 ? (
                  <p className="crm-muted">No country data.</p>
                ) : (
                  <ul className="crm-recent-list">
                    {data.byCountry.map((r) => (
                      <li key={r.label}>
                        <Link to={`/sales/accounts?country=${encodeURIComponent(r.label === 'Unknown' ? '' : r.label)}`}>
                          {r.label}
                        </Link>
                        <span>{r.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="crm-home-panel">
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
            </div>
          </>
        ) : null}

        {nav !== 'home' ? (
          <p className="crm-muted">Saved folders and favorites will appear here. Use Home for live pipeline metrics.</p>
        ) : null}
      </div>
    </div>
  )
}
