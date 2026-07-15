import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { chatApi } from '../../api/client'
import MessageContent from '../MessageContent'

const QUICK = [
  { id: 'pipeline', label: 'My pipeline', prompt: 'What does my CRM pipeline look like? Summarize open deals by stage and amount.' },
  { id: 'leads', label: 'My leads', prompt: 'List my open CRM leads and suggest who to call first.' },
  { id: 'stats', label: 'CRM stats', prompt: 'Give me my CRM stats: open leads, accounts, deals, and tasks due this week.' },
  { id: 'task', label: 'Create follow-up', prompt: 'Create a high-priority CRM task to follow up with my hottest open opportunity this week.' },
]

function recordContextFromPath(pathname) {
  const path = String(pathname || '')
  const match = path.match(/^\/sales\/(leads|accounts|contacts|pipeline)\/([a-f0-9]{24})\b/i)
  if (!match) {
    if (path.startsWith('/sales/pipeline')) return 'Pipeline list'
    if (path.startsWith('/sales/leads')) return 'Leads list'
    if (path.startsWith('/sales/accounts')) return 'Accounts list'
    if (path.startsWith('/sales/contacts')) return 'Contacts list'
    if (path.startsWith('/sales/tasks')) return 'Tasks'
    if (path === '/sales' || path === '/sales/') return 'Sales Home'
    return path.replace(/^\/sales\/?/, 'Sales ') || 'Sales'
  }
  const typeMap = {
    leads: 'Lead',
    accounts: 'Account',
    contacts: 'Contact',
    pipeline: 'Opportunity',
  }
  return `${typeMap[match[1]] || match[1]} ${match[2]}`
}

export default function SalesCopilotDrawer() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const bottomRef = useRef(null)
  const panelRef = useRef(null)

  const recordContext = useMemo(
    () => recordContextFromPath(location.pathname),
    [location.pathname],
  )

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy, open])

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
        chatInputs: {
          surface: 'sales-copilot',
          recordContext,
        },
      }, { timeoutMs: 45000 })
      if (data.sessionId) setSessionId(data.sessionId)
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.reply,
        sections: data.sections,
        meta: data.meta,
      }])
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message || 'Request failed'}`,
      }])
    } finally {
      setBusy(false)
    }
  }, [busy, messages, sessionId, recordContext])

  const startNew = () => {
    setMessages([])
    setSessionId(null)
    setInput('')
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="crm-copilot-fab"
          onClick={() => setOpen(true)}
          aria-label="Open sales AI assistant"
        >
          AI
        </button>
      ) : null}

      {open ? (
        <div className="crm-copilot-root">
          <button
            type="button"
            className="crm-copilot-backdrop"
            aria-label="Close assistant"
            onClick={() => setOpen(false)}
          />
          <aside
            ref={panelRef}
            className="crm-copilot-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Sales AI assistant"
          >
            <header className="crm-copilot-header">
              <div>
                <h3>Sales AI</h3>
                <p className="crm-copilot-context">{recordContext}</p>
              </div>
              <div className="crm-copilot-header-actions">
                <button type="button" className="crm-btn-secondary" onClick={startNew}>New</button>
                <button type="button" className="crm-btn-secondary" onClick={() => setOpen(false)}>Close</button>
              </div>
            </header>

            <div className="crm-copilot-chips">
              {QUICK.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className="crm-copilot-chip"
                  disabled={busy}
                  onClick={() => sendMessage(q.prompt)}
                >
                  {q.label}
                </button>
              ))}
            </div>

            <div className="crm-copilot-messages">
              {messages.length === 0 ? (
                <p className="crm-muted">
                  Ask about your pipeline, leads, or create a follow-up — uses live CRM tools.
                </p>
              ) : null}
              {messages.map((msg, i) => (
                <div key={i} className={`crm-copilot-msg crm-copilot-msg-${msg.role}`}>
                  <MessageContent content={msg.content} sections={msg.sections} meta={msg.meta} />
                </div>
              ))}
              {busy ? <p className="crm-muted">Working…</p> : null}
              <div ref={bottomRef} />
            </div>

            <form
              className="crm-copilot-composer"
              onSubmit={(e) => {
                e.preventDefault()
                sendMessage(input)
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about this page or your CRM…"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(input)
                  }
                }}
              />
              <button type="submit" className="crm-btn-primary" disabled={busy || !input.trim()}>
                Send
              </button>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  )
}
