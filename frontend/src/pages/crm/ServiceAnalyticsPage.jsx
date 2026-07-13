import React, { useEffect, useState } from 'react'
import { casesApi } from '../../api/client'

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'browse', label: 'Browse' },
  { id: 'favorites', label: 'Favorites' },
]

const COLLECTIONS = [
  { id: 'sales', label: 'Sales', color: '#1b96ff' },
  { id: 'service', label: 'Service', color: '#e5677a' },
]

const DEMO_RECENTS = [
  { title: 'Open Cases by Priority', lastViewed: 'Today', modifiedBy: 'You', modifiedOn: 'Today' },
  { title: 'Cases Opened This Week', lastViewed: 'Today', modifiedBy: 'You', modifiedOn: 'Yesterday' },
  { title: 'Service Response Overview', lastViewed: 'Last 7 days', modifiedBy: 'You', modifiedOn: 'Last 7 days' },
]

export default function ServiceAnalyticsPage() {
  const [nav, setNav] = useState('home')
  const [listTab, setListTab] = useState('recents')
  const [search, setSearch] = useState('')
  const [recentCases, setRecentCases] = useState([])

  useEffect(() => {
    let cancelled = false
    casesApi.list('', 'open')
      .then((res) => {
        if (!cancelled) setRecentCases((res.data || []).slice(0, 5))
      })
      .catch(() => {
        if (!cancelled) setRecentCases([])
      })
    return () => { cancelled = true }
  }, [])

  const filteredDemo = DEMO_RECENTS.filter((row) => {
    if (!search.trim()) return true
    return row.title.toLowerCase().includes(search.trim().toLowerCase())
  })

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
          <h1>{nav === 'home' ? 'Analytics' : nav === 'browse' ? 'Browse' : 'Favorites'}</h1>
          <button type="button" className="crm-btn-primary" disabled title="Coming soon">Create</button>
        </header>

        <label className="crm-analytics-search">
          <span className="sr-only">Search analytics</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports and dashboards..."
          />
        </label>

        {nav === 'home' ? (
          <>
            <section className="crm-analytics-for-you" aria-label="For You">
              <h2>For You</h2>
              <div className="crm-analytics-cards">
                <div className="crm-analytics-card">
                  <h3>Recently Updated</h3>
                  <ul>
                    {recentCases.length ? recentCases.map((c) => (
                      <li key={c._id}>
                        <span className="crm-analytics-card-icon" aria-hidden="true" />
                        {c.caseNumber ? `${c.caseNumber} · ` : ''}{c.subject || 'Open case'}
                      </li>
                    )) : (
                      <li className="crm-analytics-muted">No recent open cases</li>
                    )}
                  </ul>
                </div>
                <div className="crm-analytics-card">
                  <h3>Shared With Me</h3>
                  <p className="crm-analytics-muted">Nothing shared yet.</p>
                  <button type="button" className="crm-link-btn" disabled>View All</button>
                </div>
                <div className="crm-analytics-card">
                  <h3>Created By Me</h3>
                  <p className="crm-analytics-muted">Create dashboards and reports to see them here.</p>
                  <button type="button" className="crm-link-btn" disabled>View All</button>
                </div>
              </div>
            </section>

            <section className="crm-analytics-my" aria-label="My Analytics">
              <div className="crm-analytics-my-tabs">
                <button
                  type="button"
                  className={`crm-analytics-my-tab${listTab === 'recents' ? ' active' : ''}`}
                  onClick={() => setListTab('recents')}
                >
                  Recents
                </button>
                <button
                  type="button"
                  className={`crm-analytics-my-tab${listTab === 'favorites' ? ' active' : ''}`}
                  onClick={() => setListTab('favorites')}
                >
                  Favorites
                </button>
              </div>

              {listTab === 'favorites' ? (
                <p className="crm-analytics-muted crm-analytics-empty-fav">No favorites yet.</p>
              ) : (
                <div className="crm-analytics-table-wrap">
                  <table className="crm-analytics-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Last Viewed</th>
                        <th>Last Modified By</th>
                        <th>Last Modified On</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDemo.map((row) => (
                        <tr key={row.title}>
                          <td>
                            <span className="crm-analytics-row-icon" aria-hidden="true" />
                            <button type="button" className="crm-link-btn">{row.title}</button>
                          </td>
                          <td>{row.lastViewed}</td>
                          <td>{row.modifiedBy}</td>
                          <td>{row.modifiedOn}</td>
                        </tr>
                      ))}
                      {!filteredDemo.length ? (
                        <tr>
                          <td colSpan={4} className="crm-analytics-muted">No matching items</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          <p className="crm-analytics-muted">
            {nav === 'browse'
              ? 'Browse all reports and dashboards in your workspace. Create content from the Home tab.'
              : 'Star reports and dashboards to find them quickly in Favorites.'}
          </p>
        )}
      </div>
    </div>
  )
}
