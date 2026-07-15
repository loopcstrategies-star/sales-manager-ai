import React, { useCallback, useEffect, useState } from 'react'
import { crmApi } from '../../api/client'

export default function RecordAiPanel({ objectType, id, onTaskCreated }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!objectType || !id) return
    setLoading(true)
    setError('')
    try {
      const res = await crmApi.aiSummarize({ objectType, id })
      setData(res.data || null)
    } catch (err) {
      setError(err.message || 'AI summary failed')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [objectType, id])

  useEffect(() => {
    load()
  }, [load])

  const createTask = async () => {
    if (!data?.nextAction) return
    setBusy(true)
    setMsg('')
    try {
      const res = await crmApi.aiCreateTask({
        objectType,
        id,
        nextAction: data.nextAction,
      })
      setMsg(`Task created: ${res.data?.subject || data.nextAction}`)
      onTaskCreated?.(res.data)
    } catch (err) {
      setMsg(err.message || 'Could not create task')
    } finally {
      setBusy(false)
    }
  }

  const askAi = () => {
    window.dispatchEvent(new CustomEvent('sales-copilot-open', {
      detail: { prompt: 'Summarize this record and suggest the best next step.' },
    }))
  }

  return (
    <section className="crm-home-panel crm-ai-panel">
      <div className="crm-ai-panel-head">
        <h3>AI assistant</h3>
        <div className="crm-ai-panel-actions">
          <button type="button" className="crm-btn-secondary" disabled={loading || busy} onClick={askAi}>
            Ask AI
          </button>
          <button type="button" className="crm-btn-secondary" disabled={loading || busy} onClick={load}>
            Refresh
          </button>
        </div>
      </div>
      {loading ? <p className="crm-muted">Analyzing record…</p> : null}
      {error ? <p className="crm-banner-error">{error}</p> : null}
      {data ? (
        <>
          <p className="crm-ai-summary">{data.summary}</p>
          <div className="crm-ai-next">
            <strong>Suggested next action</strong>
            <p>{data.nextAction}</p>
            <button type="button" className="crm-btn-primary" disabled={busy} onClick={createTask}>
              {busy ? 'Creating…' : 'Create task'}
            </button>
          </div>
          {data.confidence ? (
            <p className="crm-muted crm-ai-meta">
              Source: {data.confidence === 'llm' ? 'AI + CRM data' : 'CRM rules'}
              {data.actionType ? ` · type: ${data.actionType}` : ''}
            </p>
          ) : null}
        </>
      ) : null}
      {msg ? <p className="crm-muted">{msg}</p> : null}
    </section>
  )
}
