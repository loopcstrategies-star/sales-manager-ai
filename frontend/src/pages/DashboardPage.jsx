import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { configApi, dashboardApi } from '../api/client'
import AppShell from '../components/AppShell'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardStatsBar from '../components/dashboard/DashboardStatsBar'
import HeadlinesRow, { DashboardHero, HeadlineTicker } from '../components/dashboard/HeadlinesRow'
import DashboardSection, { DashboardSectionNav } from '../components/dashboard/DashboardSection'
import { FILTER_CHIPS } from '../components/dashboard/dashboardUtils'
import { usePreferences } from '../context/PreferencesContext'

export default function DashboardPage() {
  const { dashboard, applyDashboardFilter, updatePreferences } = usePreferences()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [regions, setRegions] = useState([{ id: '', label: 'Global' }])
  const [region, setRegion] = useState(dashboard.defaultRegion || '')
  const [expandedId, setExpandedId] = useState(null)
  const [activeSection, setActiveSection] = useState('overview')

  useEffect(() => {
    setRegion(dashboard.defaultRegion || '')
  }, [dashboard.defaultRegion])

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
    const ms = (dashboard.pollMinutes || 5) * 60 * 1000
    const poll = setInterval(() => loadDashboard(), ms)
    return () => clearInterval(poll)
  }, [loadDashboard, dashboard.pollMinutes])

  const filteredCards = useMemo(() => {
    return applyDashboardFilter(data?.cards || [])
  }, [data?.cards, applyDashboardFilter])

  const headlines = useMemo(
    () => filteredCards.filter((c) => c.type === 'headline').slice(0, 8),
    [filteredCards],
  )
  const hero = headlines[0] || filteredCards[0]
  const heroId = hero?.id
  const metals = filteredCards.filter((c) => c.category === 'metals' && c.id !== heroId)
  const general = filteredCards.filter((c) => c.category === 'general' && c.id !== heroId)

  const sectionNav = useMemo(() => {
    const items = [{ id: 'overview', label: 'Overview' }]
    if (dashboard.sections?.metals !== false) items.push({ id: 'metals', label: 'Metals' })
    if (dashboard.sections?.general !== false) items.push({ id: 'general', label: 'General' })
    return items
  }, [dashboard.sections])

  const scrollToSection = (id) => {
    setActiveSection(id)
    const el = document.getElementById(id === 'overview' ? 'dashboard-overview' : id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleRegionChange = async (next) => {
    setRegion(next)
    try {
      await updatePreferences({ dashboard: { defaultRegion: next } })
    } catch {
      /* region still updates locally for this session */
    }
  }

  const handleTopicChange = async (topicId) => {
    try {
      await updatePreferences({ dashboard: { topicFilter: topicId } })
    } catch {
      /* ignore */
    }
  }

  return (
    <AppShell
      sidebarOpen={sidebarOpen}
      onToggleSidebar={() => setSidebarOpen((v) => !v)}
    >
      <div className="dashboard-page ui-enter">
        <DashboardHeader
          data={data}
          refreshing={refreshing}
          loading={loading}
          onRefresh={() => loadDashboard({ refresh: true })}
          regions={regions}
          region={region}
          onRegionChange={handleRegionChange}
        />

        {dashboard.showTicker && <HeadlineTicker headlines={headlines} />}

        <div className="dashboard-filters">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`filter-chip${dashboard.topicFilter === chip.id ? ' active' : ''}`}
              onClick={() => handleTopicChange(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {error && <p className="dashboard-error">{error}</p>}

        <DashboardSectionNav
          sections={sectionNav}
          active={activeSection}
          onSelect={scrollToSection}
        />

        <div id="dashboard-overview">
          {loading && !data && (
            <div className="dashboard-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} className="dashboard-card dashboard-card-skeleton" />
              ))}
            </div>
          )}

          {dashboard.showPriceTiles && (
            <DashboardStatsBar tiles={data?.priceTiles} meta={data?.meta} />
          )}

          {dashboard.showHeadlinesRow && (
            <HeadlinesRow headlines={headlines} showImages={dashboard.showImages} />
          )}

          {dashboard.showHero && !loading && (
            <DashboardHero hero={hero} showImages={dashboard.showImages} />
          )}
        </div>

        {dashboard.sections?.metals !== false && (
          <DashboardSection
            id="metals"
            title="Precious metals & jewelry"
            cards={metals}
            loading={loading}
            expandedId={expandedId}
            onToggleExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
            showImages={dashboard.showImages}
            compact={dashboard.compactCards}
          />
        )}

        {dashboard.sections?.general !== false && (
          <DashboardSection
            id="general"
            title="General market & sales"
            cards={general}
            loading={loading}
            expandedId={expandedId}
            onToggleExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
            showImages={dashboard.showImages}
            compact={dashboard.compactCards}
          />
        )}
      </div>
    </AppShell>
  )
}
