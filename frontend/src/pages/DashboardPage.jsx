import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { configApi, dashboardApi } from '../api/client'
import AppShell from '../components/AppShell'

function formatUpdated(value) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

function relativeTime(value) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function isNew(refreshedAt) {
  if (!refreshedAt) return false
  return Date.now() - new Date(refreshedAt).getTime() < 60 * 60 * 1000
}

const FILTER_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'gold', label: 'Gold' },
  { id: 'uae', label: 'UAE' },
  { id: 'b2b', label: 'B2B' },
  { id: 'macro', label: 'Macro' },
]

function matchFilter(card, filter) {
  if (filter === 'all') return true
  const hay = `${card.title} ${card.summary} ${(card.tags || []).join(' ')}`.toLowerCase()
  if (filter === 'gold') return /gold|silver|jewelry|metal|lbma/i.test(hay)
  if (filter === 'uae') return /uae|dubai|gcc|gulf|middle east/i.test(hay)
  if (filter === 'b2b') return /b2b|wholesale|trade|distribution|sales/i.test(hay)
  if (filter === 'macro') return /economy|market|stock|inflation|fed|trade/i.test(hay)
  return true
}

function DashboardCard({ card, expanded, onToggle }) {
  const chatPrompt = `Discuss this market update: ${card.title}. ${card.summary}`
  return (
    <article className={`dashboard-card dashboard-card-${card.category}${card.type === 'headline' ? ' is-headline' : ''}`}>
      {card.imageUrl && (
        <img src={card.imageUrl} alt="" className="dashboard-card-image" loading="lazy" />
      )}
      <div className="dashboard-card-badges">
        {card.type === 'headline' && <span className="badge badge-headline">Headline</span>}
        {card.sourceName && <span className="badge badge-source">{card.sourceName}</span>}
        {card.publishedAt && <span className="badge badge-time">{relativeTime(card.publishedAt)}</span>}
      </div>
      <h3 className="dashboard-card-title">{card.title}</h3>
      <p className="dashboard-card-summary">{expanded ? card.summary : `${card.summary.slice(0, 180)}${card.summary.length > 180 ? '…' : ''}`}</p>
      {(card.tags || []).length > 0 && (
        <div className="dashboard-card-tags">
          {card.tags.map((tag) => (
            <span key={tag} className="tag-pill">{tag}</span>
          ))}
        </div>
      )}
      <div className="dashboard-card-actions">
        <button type="button" className="dashboard-card-expand" onClick={onToggle}>
          {expanded ? 'Show less' : 'Read more'}
        </button>
        {card.sourceUrl && (
          <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer" className="dashboard-card-link">
            Source
          </a>
        )}
        <Link to="/" state={{ prefill: chatPrompt }} className="dashboard-card-chat">
          Discuss in chat
        </Link>
      </div>
    </article>
  )
}

function PriceTiles({ tiles }) {
  if (!tiles?.length) return null
  return (
    <div className="price-tiles">
      {tiles.map((t) => (
        <div key={t.symbol || t.metal} className="price-tile">
          <span className="price-tile-label">{t.metal}</span>
          <span className="price-tile-value">${t.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          <span className="price-tile-unit">/ {t.unit || 'oz'}</span>
          {t.changePct != null && (
            <span className={`price-tile-change${t.changePct >= 0 ? ' up' : ' down'}`}>
              {t.changePct >= 0 ? '+' : ''}{t.changePct.toFixed(2)}%
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function HeadlineTicker({ headlines }) {
  if (!headlines.length) return null
  const text = headlines.map((h) => h.title).join('   •   ')
  return (
    <div className="headline-ticker-wrap">
      <span className="headline-ticker-label">Latest</span>
      <div className="headline-ticker">
        <span className="headline-ticker-track">{text}   •   {text}</span>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [regions, setRegions] = useState([{ id: '', label: 'Global' }])
  const [region, setRegion] = useState('')
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    configApi.get().then((cfg) => {
      if (cfg.regions?.length) setRegions(cfg.regions)
    }).catch(() => {})
  }, [])

  const loadDashboard = useCallback(async (opts = {}) => {
    const { refresh = false } = opts
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const result = refresh
        ? await dashboardApi.refresh(region)
        : await dashboardApi.get(region)
      setData(result)
    } catch (err) {
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [region])

  useEffect(() => {
    loadDashboard()
    const poll = setInterval(() => loadDashboard(), 5 * 60 * 1000)
    return () => clearInterval(poll)
  }, [loadDashboard])

  const filteredCards = useMemo(() => {
    return (data?.cards || []).filter((c) => matchFilter(c, filter))
  }, [data?.cards, filter])

  const headlines = useMemo(() => filteredCards.filter((c) => c.type === 'headline').slice(0, 8), [filteredCards])
  const hero = headlines[0] || filteredCards[0]
  const metals = filteredCards.filter((c) => c.category === 'metals' && c.id !== hero?.id)
  const general = filteredCards.filter((c) => c.category === 'general' && c.id !== hero?.id)

  const sidebarExtra = (
    <label className="sidebar-label">
      Region focus
      <select
        value={region}
        onChange={(e) => setRegion(e.target.value)}
        className="sidebar-input"
      >
        {regions.map((r) => (
          <option key={r.id || 'global'} value={r.id}>{r.label}</option>
        ))}
      </select>
    </label>
  )

  return (
    <AppShell
      sidebarOpen={sidebarOpen}
      onToggleSidebar={() => setSidebarOpen((v) => !v)}
      sidebarExtra={sidebarExtra}
    >
      <div className="dashboard-page">
        <div className="dashboard-header">
          <div>
            <h2 className="dashboard-title">Market research dashboard</h2>
            <p className="dashboard-subtitle">
              Live news from Tavily, RSS, NewsAPI + Groq summaries
              {data?.searchProvider ? ` · ${data.searchProvider}` : ''}
              {isNew(data?.refreshedAt) && <span className="badge badge-new">NEW</span>}
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

        <HeadlineTicker headlines={headlines} />

        <div className="dashboard-filters">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`filter-chip${filter === chip.id ? ' active' : ''}`}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {error && <p className="dashboard-error">{error}</p>}

        {loading && !data && (
          <div className="dashboard-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="dashboard-card dashboard-card-skeleton" />
            ))}
          </div>
        )}

        {!loading && hero && (
          <article className="dashboard-hero">
            {hero.imageUrl && <img src={hero.imageUrl} alt="" className="dashboard-hero-image" loading="lazy" />}
            <div className="dashboard-hero-body">
              <span className="badge badge-headline">Top story</span>
              <h2>{hero.title}</h2>
              <p>{hero.summary}</p>
              <div className="dashboard-card-actions">
                {hero.sourceUrl && (
                  <a href={hero.sourceUrl} target="_blank" rel="noopener noreferrer" className="dashboard-card-link">
                    Read full article
                  </a>
                )}
                <Link to="/" state={{ prefill: `Discuss: ${hero.title}` }} className="dashboard-card-chat">
                  Discuss in chat
                </Link>
              </div>
            </div>
          </article>
        )}

        <PriceTiles tiles={data?.priceTiles} />

        <section className="dashboard-section">
          <h2>Precious metals & jewelry</h2>
          {metals.length === 0 && !loading && <p className="sidebar-meta">No metals cards for this filter.</p>}
          <div className="dashboard-grid">
            {metals.map((card) => (
              <DashboardCard
                key={card.id}
                card={card}
                expanded={expandedId === card.id}
                onToggle={() => setExpandedId((id) => (id === card.id ? null : card.id))}
              />
            ))}
          </div>
        </section>

        <section className="dashboard-section">
          <h2>General market & sales</h2>
          {general.length === 0 && !loading && <p className="sidebar-meta">No general cards for this filter.</p>}
          <div className="dashboard-grid">
            {general.map((card) => (
              <DashboardCard
                key={card.id}
                card={card}
                expanded={expandedId === card.id}
                onToggle={() => setExpandedId((id) => (id === card.id ? null : card.id))}
              />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
