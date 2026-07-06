import React from 'react'
import DashboardCard from './DashboardCard'

export default function DashboardSection({
  id,
  title,
  cards,
  loading,
  expandedId,
  onToggleExpand,
  showImages,
  compact,
}) {
  return (
    <section id={id} className="dashboard-section">
      <h2>{title}</h2>
      {cards.length === 0 && !loading && (
        <p className="sidebar-meta">No cards for this section and filter.</p>
      )}
      <div className="dashboard-grid">
        {cards.map((card) => (
          <DashboardCard
            key={card.id}
            card={card}
            expanded={expandedId === card.id}
            onToggle={() => onToggleExpand(card.id)}
            showImages={showImages}
            compact={compact}
          />
        ))}
      </div>
    </section>
  )
}

export function DashboardSectionNav({ sections, active, onSelect }) {
  if (!sections?.length) return null

  return (
    <nav className="dashboard-section-nav" aria-label="Dashboard sections">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`dashboard-section-nav-btn${active === s.id ? ' active' : ''}`}
          onClick={() => onSelect(s.id)}
        >
          {s.label}
        </button>
      ))}
    </nav>
  )
}
