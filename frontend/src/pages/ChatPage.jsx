import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { chatApi, configApi } from '../api/client'
import MessageContent from '../components/MessageContent'

export default function ChatPage() {
  const { user, workspace, logout } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [quickActions, setQuickActions] = useState([])
  const [region, setRegion] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    configApi.get().then((data) => {
      setQuickActions(data.quickActions || [])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const sendMessage = useCallback(async (text) => {
    const message = String(text || '').trim()
    if (!message || busy) return

    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setInput('')
    setBusy(true)

    try {
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }))
      const data = await chatApi.send({
        message,
        history,
        ...(sessionId ? { sessionId } : {}),
        chatInputs: { region },
      })
      if (data.sessionId) setSessionId(data.sessionId)
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, sections: data.sections }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setBusy(false)
    }
  }, [busy, messages, sessionId, region])

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>Sales Manager AI</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', opacity: 0.85 }}>{user?.name}</span>
          <Link to="/settings" style={{ color: '#fff', fontSize: '0.85rem' }}>Settings</Link>
          <button type="button" className="btn-secondary" onClick={logout} style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>
            Sign out
          </button>
        </div>
      </header>

      <div className="chat-layout">
        <aside className="chat-sidebar">
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 0 }}>
            Workspace: {workspace?.name || '—'}
          </p>
          <p style={{ fontSize: '0.85rem' }}>
            LoopC: {workspace?.loopcConnected ? `Connected (${workspace.loopcTenant})` : 'Not connected'}
          </p>
          <label style={{ fontSize: '0.85rem', display: 'block', marginTop: '1rem' }}>
            Region focus
            <select value={region} onChange={(e) => setRegion(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 6 }}>
              <option value="">Global</option>
              <option value="uzbekistan">Uzbekistan</option>
              <option value="uae">UAE</option>
              <option value="gcc">GCC</option>
              <option value="turkey">Turkey</option>
              <option value="india">India</option>
              <option value="china">China</option>
            </select>
          </label>
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
                <MessageContent content={msg.content} sections={msg.sections} />
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
