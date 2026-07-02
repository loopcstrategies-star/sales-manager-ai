import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../api/client'
import AppShell from '../components/AppShell'

function formatUpdated(value) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

function groupCards(cards) {
  return {
    metals: (cards || []).filter((c) => c.category === 'metals'),
    general: (cards || []).filter((c) => c.category === 'general'),
  }
}

function DashboardCard({ card }) {
  const chatPrompt = `Discuss this market update: ${card.title}. ${card.summary}`
  return (
    <article className="dashboard-card">
      <h3 className="dashboard-card-title">{card.title}</h3>
      <p className="dashboard-card-summary">{card.summary}</p>
      <div className="dashboard-card-actions">
        {card.sourceUrl && (
          <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer" className="dashboard-card-link">
            {card.sourceName || 'Source'}
          </a>
        )}
        <Link to="/" state={{ prefill: chatPrompt }} className="dashboard-card-chat">
          Discuss in chat
        </Link>
      </div>
    </article>
  )
}

function CardSection({ title, cards, loading }) {
  if (loading) {
    return (
      <section className="dashboard-section">
        <h2>{title}</h2>
        <div className="dashboard-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="dashboard-card dashboard-card-skeleton" />
          ))}
        </div>
      </section>
    )
  }

  if (!cards.length) {
    return (
      <section className="dashboard-section">
        <h2>{title}</h2>
        <p className="sidebar-meta">No cards in this section yet.</p>
      </section>
    )
  }

  return (
    <section className="dashboard-section">
      <h2>{title}</h2>
      <div className="dashboard-grid">
        {cards.map((card) => (
          <DashboardCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  )
}

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  const loadDashboard = useCallback(async (opts = {}) => {
    const { refresh = false } = opts
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const result = refresh ? await dashboardApi.refresh() : await dashboardApi.get()
      setData(result)
    } catch (err) {
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()
    const poll = setInterval(() => loadDashboard(), 5 * 60 * 1000)
    return () => clearInterval(poll)
  }, [loadDashboard])

  const grouped = groupCards(data?.cards)

  return (
    <AppShell
      sidebarOpen={sidebarOpen}
      onToggleSidebar={() => setSidebarOpen((v) => !v)}
    >
      <div className="dashboard-page">
        <div className="dashboard-header">
          <div>
            <h2 className="dashboard-title">Market research dashboard</h2>
            <p className="dashboard-subtitle">
              Live trends from Tavily + Groq summaries
              {data?.searchProvider ? ` · ${data.searchProvider}` : ''}
            </p>
          </div>
          <div className="dashboard-header-actions">
            <span className="dashboard-updated">
              Last updated: {formatUpdated(data?.refreshedAt)}
              {data?.stale ? ' (refreshing soon)' : ''}
            </span>
            <button
              type="button"
              className="btn"
              disabled={refreshing || loading}
              onClick={() => loadDashboard({ refresh: true })}
            >
              {refreshing ? 'Refreshing…' : 'Refresh now'}
            </button>
          </div>
        </div>

        {error && <p className="dashboard-error">{error}</p>}

        <CardSection
          title="Precious metals & jewelry"
          cards={grouped.metals}
          loading={loading && !data}
        />
        <CardSection
          title="General market & sales"
          cards={grouped.general}
          loading={loading && !data}
        />
      </div>
    </AppShell>
  )
}
