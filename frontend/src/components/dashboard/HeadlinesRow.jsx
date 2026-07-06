import React from 'react'
import { Link } from 'react-router-dom'
import { relativeTime } from './dashboardUtils'
import CardImage from './CardImage'

export default function HeadlinesRow({ headlines, showImages = true }) {
  if (!headlines?.length) return null

  return (
    <div className="headlines-row-wrap">
      <h3 className="headlines-row-title">Headlines</h3>
      <div className="headlines-row">
        {headlines.map((h) => (
          <article key={h.id} className="headline-card">
            {showImages && <CardImage src={h.imageUrl} className="headline-card-image" />}
            <div className="headline-card-body">
              <h4>{h.title}</h4>
              <div className="headline-card-meta">
                {h.sourceName && <span>{h.sourceName}</span>}
                {h.publishedAt && <span>{relativeTime(h.publishedAt)}</span>}
              </div>
              {h.sourceUrl && (
                <a href={h.sourceUrl} target="_blank" rel="noopener noreferrer" className="headline-card-link">
                  Read
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export function HeadlineTicker({ headlines }) {
  if (!headlines?.length) return null
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

export function DashboardHero({ hero, showImages = true }) {
  if (!hero) return null

  return (
    <article className="dashboard-hero">
      {showImages && <CardImage src={hero.imageUrl} className="dashboard-hero-image" />}
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
  )
}
