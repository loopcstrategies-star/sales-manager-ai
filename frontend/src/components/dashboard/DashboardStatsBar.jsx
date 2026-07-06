import React from 'react'
import { Link } from 'react-router-dom'
import FeedMeta from './FeedMeta'

function PriceTilesHint() {
  return (
    <p className="settings-hint dashboard-price-hint">
      Gold/silver prices need <code>GOLDAPI_KEY</code> on the server.
      {' '}
      <Link to="/settings">Settings</Link>
      {' '}
      shows provider status (admin configures keys).
    </p>
  )
}

export default function DashboardStatsBar({ tiles, meta }) {
  const hasTiles = Boolean(tiles?.length)

  return (
    <div className="dashboard-stats-bar">
      <div className="dashboard-stats-prices">
        {hasTiles ? (
          tiles.map((t) => (
            <div key={t.symbol || t.metal} className="price-tile">
              <span className="price-tile-label">{t.metal}</span>
              <span className="price-tile-value">
                ${t.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="price-tile-unit">/ {t.unit || 'oz'}</span>
              {t.changePct != null && (
                <span className={`price-tile-change${t.changePct >= 0 ? ' up' : ' down'}`}>
                  {t.changePct >= 0 ? '+' : ''}{t.changePct.toFixed(2)}%
                </span>
              )}
            </div>
          ))
        ) : (
          <PriceTilesHint />
        )}
      </div>
      {meta && <FeedMeta meta={meta} className="dashboard-stats-meta" />}
    </div>
  )
}
