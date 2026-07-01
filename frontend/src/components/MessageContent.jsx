import React from 'react'

function renderInlineMarkdown(text) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

export default function MessageContent({ content, sections }) {
  const blocks = String(content || '').split('\n')
  const sources = (sections || []).flatMap((s) => s.sources || [])

  return (
    <div>
      {blocks.map((line, i) => {
        if (line.startsWith('## ')) {
          return <h3 key={i} style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem' }}>{line.slice(3)}</h3>
        }
        if (line.startsWith('- ')) {
          return <div key={i} style={{ paddingLeft: 8 }}>• {renderInlineMarkdown(line.slice(2))}</div>
        }
        if (!line.trim()) return <br key={i} />
        return <div key={i}>{renderInlineMarkdown(line)}</div>
      })}
      {sources.length > 0 && (
        <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
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
