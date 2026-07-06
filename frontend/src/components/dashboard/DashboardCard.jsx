import React from 'react'
import { Link } from 'react-router-dom'
import CardImage from './CardImage'
import { relativeTime } from './dashboardUtils'

export default function DashboardCard({
  card,
  expanded,
  onToggle,
  showImages = true,
  compact = false,
}) {
  const chatPrompt = `Discuss this market update: ${card.title}. ${card.summary}`
  return (
    <article className={`dashboard-card dashboard-card-${card.category}${card.type === 'headline' ? ' is-headline' : ''}${compact ? ' compact' : ''}`}>
      {showImages && <CardImage src={card.imageUrl} className="dashboard-card-image" />}
      <div className="dashboard-card-badges">
        {card.type === 'headline' && <span className="badge badge-headline">Headline</span>}
        {card.sourceName && <span className="badge badge-source">{card.sourceName}</span>}
        {card.publishedAt && <span className="badge badge-time">{relativeTime(card.publishedAt)}</span>}
      </div>
      <h3 className="dashboard-card-title">{card.title}</h3>
      <p className="dashboard-card-summary">
        {expanded ? card.summary : `${card.summary.slice(0, compact ? 120 : 180)}${card.summary.length > (compact ? 120 : 180) ? '…' : ''}`}
      </p>
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
