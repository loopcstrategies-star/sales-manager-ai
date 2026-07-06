import React from 'react'
import FeedMeta from './FeedMeta'
import { formatUpdated, isNew } from './dashboardUtils'

export default function DashboardHeader({
  data,
  refreshing,
  loading,
  onRefresh,
  regions,
  region,
  onRegionChange,
}) {
  return (
    <div className="dashboard-header">
      <div>
        <h2 className="dashboard-title">Market research dashboard</h2>
        <p className="dashboard-subtitle">
          Live news from Tavily, RSS, NewsAPI + Groq summaries
          {data?.searchProvider ? ` · ${data.searchProvider}` : ''}
          {isNew(data?.refreshedAt) && <span className="badge badge-new">NEW</span>}
        </p>
        {data?.meta && <FeedMeta meta={data.meta} />}
      </div>
      <div className="dashboard-header-actions">
        {regions?.length > 1 && (
          <label className="dashboard-region-quick">
            Region
            <select value={region} onChange={(e) => onRegionChange(e.target.value)} className="sidebar-input">
              {regions.map((r) => (
                <option key={r.id || 'global'} value={r.id}>{r.label}</option>
              ))}
            </select>
          </label>
        )}
        <span className="dashboard-updated">
          Last updated: {formatUpdated(data?.refreshedAt)}
          {data?.stale ? ' (refreshing soon)' : ''}
        </span>
        <button
          type="button"
          className="btn"
          disabled={refreshing || loading}
          onClick={onRefresh}
        >
          {refreshing ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>
    </div>
  )
}
