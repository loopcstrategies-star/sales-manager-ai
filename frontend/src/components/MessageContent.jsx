import React from 'react'

function renderInlineMarkdown(text) {
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g
  const parts = []
  let lastIndex = 0
  let match = linkPattern.exec(text)
  while (match) {
    if (match.index > lastIndex) {
      parts.push(...renderBoldSpans(text.slice(lastIndex, match.index)))
    }
    parts.push(
      <a key={`${match.index}-link`} href={match[2]} target="_blank" rel="noopener noreferrer">
        {match[1]}
      </a>,
    )
    lastIndex = match.index + match[0].length
    match = linkPattern.exec(text)
  }
  if (lastIndex < text.length) {
    parts.push(...renderBoldSpans(text.slice(lastIndex)))
  }
  return parts.length ? parts : renderBoldSpans(text)
}

function renderBoldSpans(text) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

export default function MessageContent({ content, sections, meta }) {
  const blocks = String(content || '').split('\n')
  const sources = (sections || []).flatMap((s) => s.sources || [])

  return (
    <div>
      {blocks.map((line, i) => {
        if (line.startsWith('## ')) {
          return <h3 key={i} className="msg-heading">{line.slice(3)}</h3>
        }
        if (line.startsWith('- ')) {
          return <div key={i} className="msg-bullet">• {renderInlineMarkdown(line.slice(2))}</div>
        }
        if (line.startsWith('_') && line.endsWith('_')) {
          return <div key={i} className="msg-muted">{line.slice(1, -1)}</div>
        }
        if (!line.trim()) return <br key={i} />
        return <div key={i}>{renderInlineMarkdown(line)}</div>
      })}
      {meta && (meta.searchQueryCount != null || meta.searchCacheHits > 0 || meta.crmMode || (meta.toolsUsed || []).length > 0) && (
        <div className="msg-meta">
          {meta.crmMode ? 'CRM assistant' : null}
          {meta.crmMode && meta.searchQueryCount != null ? ' · ' : null}
          {meta.searchQueryCount != null && `Searches: ${meta.searchQueryCount}`}
          {meta.searchCacheHits > 0 && ` · Cached: ${meta.searchCacheHits}`}
          {meta.searchProvider && ` · ${meta.searchProvider}`}
          {(meta.toolsUsed || []).length > 0 && ` · Tools: ${[...new Set(meta.toolsUsed)].join(', ')}`}
        </div>
      )}
      {sources.length > 0 && (
        <div className="msg-sources">
          {sources.slice(0, 5).map((s) => (
            <div key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
