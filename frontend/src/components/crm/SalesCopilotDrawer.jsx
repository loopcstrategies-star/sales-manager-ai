import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { chatApi } from '../../api/client'
import MessageContent from '../MessageContent'

const BASE_QUICK = [
  { id: 'pipeline', label: 'My pipeline', prompt: 'What does my CRM pipeline look like? Summarize open deals by stage and amount.' },
  { id: 'leads', label: 'My leads', prompt: 'List my open CRM leads and suggest who to call first.' },
  { id: 'stats', label: 'CRM stats', prompt: 'Give me my CRM stats: open leads, accounts, deals, and tasks due this week.' },
  { id: 'task', label: 'Create follow-up', prompt: 'Create a high-priority CRM task to follow up with my hottest open opportunity this week.' },
  { id: 'score', label: 'Score leads', prompt: 'Score my open CRM leads with AI score.' },
]

function parsePathRecord(pathname) {
  const path = String(pathname || '')
  const match = path.match(/^\/sales\/(leads|accounts|contacts|pipeline)\/([a-f0-9]{24})\b/i)
  if (!match) {
    let label = 'Sales'
    if (path.startsWith('/sales/pipeline')) label = 'Pipeline list'
    else if (path.startsWith('/sales/leads')) label = 'Leads list'
    else if (path.startsWith('/sales/accounts')) label = 'Accounts list'
    else if (path.startsWith('/sales/contacts')) label = 'Contacts list'
    else if (path.startsWith('/sales/tasks')) label = 'Tasks'
    else if (path === '/sales' || path === '/sales/' || path.startsWith('/sales/home')) label = 'Sales Home'
    return { label, objectType: null, id: null, structured: label }
  }
  const route = match[1].toLowerCase()
  const id = match[2]
  const objectType = route === 'pipeline' ? 'opportunities' : route
  const typeMap = {
    leads: 'Lead',
    accounts: 'Account',
    contacts: 'Contact',
    pipeline: 'Opportunity',
  }
  return {
    label: `${typeMap[route]} ${id.slice(-6)}`,
    objectType,
    id,
    structured: `${objectType}:${id}`,
  }
}

export default function SalesCopilotDrawer({ openSignal = 0, seedPrompt = '' }) {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const bottomRef = useRef(null)
  const panelRef = useRef(null)

  const record = useMemo(() => parsePathRecord(location.pathname), [location.pathname])

  const chips = useMemo(() => {
    const list = [...BASE_QUICK]
    if (record.objectType && record.id) {
      list.unshift(
        { id: 'sum', label: 'Summarize this', prompt: 'Summarize this record.' },
      )
      if (record.objectType === 'leads' || record.objectType === 'contacts') {
        list.splice(1, 0, { id: 'draft', label: 'Draft email', prompt: 'Draft an email for this lead or contact.' })
      }
      if (record.objectType === 'leads' || record.objectType === 'accounts') {
        list.splice(1, 0, { id: 'enrich', label: 'Enrich', prompt: 'Enrich this lead or account from the web.' })
      }
      if (record.objectType === 'leads') {
        list.splice(1, 0, { id: 'score-one', label: 'Score this', prompt: 'Score this lead with AI score.' })
      }
    }
    return list
  }, [record.objectType, record.id])

  useEffect(() => {
    if (openSignal > 0) {
      setOpen(true)
      if (seedPrompt) setInput(seedPrompt)
    }
  }, [openSignal, seedPrompt])

  useEffect(() => {
    const onOpen = (e) => {
      setOpen(true)
      const prompt = String(e?.detail?.prompt || '').trim()
      if (prompt) setInput(prompt)
    }
    window.addEventListener('sales-copilot-open', onOpen)
    return () => window.removeEventListener('sales-copilot-open', onOpen)
  }, [])

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
  }, [messages, busy, status, open])

  const sendMessage = useCallback(async (text) => {
    const message = String(text || '').trim()
    if (!message || busy) return

    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setInput('')
    setBusy(true)
    setStatus('Reading CRM…')

    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: '',
      streaming: true,
    }])

    try {
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }))
      const data = await chatApi.stream({
        message,
        history,
        ...(sessionId ? { sessionId } : {}),
        chatInputs: {
          surface: 'sales-copilot',
          recordContext: record.structured,
        },
      }, {
        timeoutMs: 45000,
        onEvent: ({ type, data: evt }) => {
          if (type === 'status' && evt?.status) setStatus(evt.status)
          if (type === 'delta' && evt?.text) {
            setMessages((prev) => {
              const next = [...prev]
              const i = next.length - 1
              if (next[i]?.role === 'assistant') {
                next[i] = {
                  ...next[i],
                  content: `${next[i].content || ''}${evt.text}`,
                  streaming: true,
                }
              }
              return next
            })
          }
        },
      })
      if (data.sessionId) setSessionId(data.sessionId)
      setStatus(data.meta?.status || (data.meta?.fastPath ? 'Done' : 'Answer ready'))
      setMessages((prev) => {
        const next = [...prev]
        const i = next.length - 1
        if (next[i]?.role === 'assistant') {
          next[i] = {
            role: 'assistant',
            content: data.reply,
            sections: data.sections,
            meta: data.meta,
          }
        }
        return next
      })
    } catch (err) {
      setStatus('')
      setMessages((prev) => {
        const next = [...prev]
        const i = next.length - 1
        if (next[i]?.role === 'assistant' && next[i].streaming) {
          next[i] = { role: 'assistant', content: `Error: ${err.message || 'Request failed'}` }
          return next
        }
        return [...prev, {
          role: 'assistant',
          content: `Error: ${err.message || 'Request failed'}`,
        }]
      })
    } finally {
      setBusy(false)
      setTimeout(() => setStatus(''), 1200)
    }
  }, [busy, messages, sessionId, record.structured])

  const startNew = () => {
    setMessages([])
    setSessionId(null)
    setInput('')
    setStatus('')
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
                <p className="crm-copilot-context">{record.label}</p>
              </div>
              <div className="crm-copilot-header-actions">
                <Link className="crm-btn-secondary" to="/" state={messages.length ? { prefill: messages.filter((m) => m.role === 'user').slice(-1)[0]?.content } : undefined}>
                  Chat
                </Link>
                <button type="button" className="crm-btn-secondary" onClick={startNew}>New</button>
                <button type="button" className="crm-btn-secondary" onClick={() => setOpen(false)}>Close</button>
              </div>
            </header>

            <div className="crm-copilot-chips">
              {chips.map((q) => (
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
                  Ask about your pipeline or the open record — chips use live CRM tools.
                </p>
              ) : null}
              {messages.map((msg, i) => (
                <div key={i} className={`crm-copilot-msg crm-copilot-msg-${msg.role}`}>
                  <MessageContent
                    content={msg.content || (msg.streaming ? '…' : '')}
                    sections={msg.sections}
                    meta={msg.meta}
                  />
                </div>
              ))}
              {busy ? <p className="crm-muted">{status || 'Working…'}</p> : null}
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
