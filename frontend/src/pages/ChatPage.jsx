import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { chatApi, configApi } from '../api/client'
import MessageContent from '../components/MessageContent'

function formatSessionDate(value) {
  if (!value) return ''
  const d = new Date(value)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ChatPage() {
  const { user, workspace, logout } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const [quickActions, setQuickActions] = useState([])
  const [regions, setRegions] = useState([{ id: '', label: 'Global' }])
  const [effectiveMode, setEffectiveMode] = useState('template')
  const [llmProvider, setLlmProvider] = useState('none')
  const [region, setRegion] = useState('')
  const [constraints, setConstraints] = useState('')
  const [depth, setDepth] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const bottomRef = useRef(null)

  const loadSessions = useCallback(() => {
    chatApi.sessions().then((data) => {
      setSessions(data.sessions || [])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    configApi.get().then((data) => {
      setQuickActions(data.quickActions || [])
      if (data.regions?.length) setRegions(data.regions)
      setEffectiveMode(data.effectiveSynthesisMode || 'template')
      setLlmProvider(data.llmProvider || 'none')
    }).catch(() => {})
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const startNewChat = useCallback(() => {
    setMessages([])
    setSessionId(null)
    setInput('')
  }, [])

  const loadSession = useCallback(async (id) => {
    if (busy) return
    try {
      const data = await chatApi.session(id)
      const loaded = (data.session?.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        sections: m.sections,
      }))
      setMessages(loaded)
      setSessionId(data.session.id)
    } catch (err) {
      setMessages([{ role: 'assistant', content: `Error loading session: ${err.message}` }])
    }
  }, [busy])

  const sendMessage = useCallback(async (text) => {
    const message = String(text || '').trim()
    if (!message || busy) return

    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setInput('')
    setBusy(true)

    try {
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }))
      const chatInputs = {
        region,
        ...(constraints.trim() ? { constraints: constraints.trim() } : {}),
        ...(depth === 'deep' ? { depth: 'deep' } : {}),
      }
      const data = await chatApi.send({
        message,
        history,
        ...(sessionId ? { sessionId } : {}),
        chatInputs,
      })
      if (data.sessionId) setSessionId(data.sessionId)
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.reply,
        sections: data.sections,
        meta: data.meta,
      }])
      loadSessions()
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setBusy(false)
    }
  }, [busy, messages, sessionId, region, constraints, depth, loadSessions])

  const exportChat = useCallback(() => {
    const text = messages.map((m) => `## ${m.role}\n\n${m.content}`).join('\n\n---\n\n')
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-ai-chat-${sessionId || 'export'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [messages, sessionId])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" className="sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sidebar">
            ☰
          </button>
          <h1>Sales Manager AI</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {messages.length > 0 && (
            <button type="button" className="btn-secondary" onClick={exportChat} style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>
              Export
            </button>
          )}
          <span style={{ fontSize: '0.85rem', opacity: 0.85 }}>{user?.name}</span>
          <button type="button" className="btn-secondary" onClick={logout} style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>
            Sign out
          </button>
        </div>
      </header>

      <div className="chat-layout">
        <aside className={`chat-sidebar${sidebarOpen ? ' open' : ''}`}>
          <button type="button" className="btn new-chat-btn" onClick={startNewChat}>
            New chat
          </button>

          <p className="sidebar-meta">
            Workspace: {workspace?.name || '—'}
          </p>
          <p className="sidebar-meta synthesis-badge">
            AI: {llmProvider === 'groq' ? 'Groq' : llmProvider === 'openai' ? 'OpenAI' : llmProvider === 'ollama' ? 'Ollama' : effectiveMode === 'template' ? 'Template (fallback)' : llmProvider}
            {effectiveMode === 'template' && llmProvider === 'none' && (
              <span className="sidebar-hint"> — add GROQ_API_KEY for full answers</span>
            )}
          </p>

          <label className="sidebar-label">
            Region focus
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="sidebar-input">
              {regions.map((r) => (
                <option key={r.id || 'global'} value={r.id}>{r.label}</option>
              ))}
            </select>
          </label>

          <label className="sidebar-label">
            Constraints (optional)
            <input
              type="text"
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="e.g. wholesale B2B only"
              className="sidebar-input"
            />
          </label>

          <label className="sidebar-label sidebar-checkbox">
            <input
              type="checkbox"
              checked={depth === 'deep'}
              onChange={(e) => setDepth(e.target.checked ? 'deep' : '')}
            />
            Deep research
          </label>

          <div className="session-list-section">
            <p className="sidebar-section-title">Recent chats</p>
            {sessions.length === 0 && (
              <p className="sidebar-meta">No saved chats yet.</p>
            )}
            <ul className="session-list">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`session-item${sessionId === s.id ? ' active' : ''}`}
                    onClick={() => loadSession(s.id)}
                  >
                    <span className="session-title">{s.title || 'Chat'}</span>
                    <span className="session-meta">{formatSessionDate(s.updatedAt)} · {s.messageCount} msgs</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="chat-main">
          <div className="messages">
            {messages.length === 0 && (
              <div>
                <p>Ask about market trends, customer demand, or sales strategy.</p>
                <div className="chip-row">
                  {quickActions.map((action) => (
                    <button key={action.id} type="button" className="chip" onClick={() => sendMessage(action.prompt)}>
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`msg msg-${msg.role}`}>
                <MessageContent content={msg.content} sections={msg.sections} meta={msg.meta} />
              </div>
            ))}
            {busy && <div className="msg msg-assistant">Researching…</div>}
            <div ref={bottomRef} />
          </div>

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              sendMessage(input)
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about markets, trends, or strategy…"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(input)
                }
              }}
            />
            <button className="btn" type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
        </div>
      </div>
    </div>
  )
}
