import React from 'react'

export default function FeedMeta({ meta, className = '' }) {
  if (!meta) return null
  const pills = []
  if (meta.tavilyCount != null) pills.push({ label: 'Tavily', value: meta.tavilyCount })
  if (meta.rssCount != null) pills.push({ label: 'RSS', value: meta.rssCount })
  if (meta.newsApiCount != null) pills.push({ label: 'NewsAPI', value: meta.newsApiCount })

  if (!pills.length) return null

  return (
    <div className={`feed-meta${className ? ` ${className}` : ''}`}>
      {pills.map((p) => (
        <span key={p.label} className="feed-meta-pill">
          {p.label}: {p.value}
        </span>
      ))}
    </div>
  )
}
