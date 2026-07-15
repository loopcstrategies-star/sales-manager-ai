import React, { useCallback, useEffect, useState } from 'react'
import { crmApi } from '../../api/client'
import { usePreferences } from '../../context/PreferencesContext'
import CrmModal from './CrmModal'

export default function RecordAiPanel({
  objectType,
  id,
  onTaskCreated,
  onRequestConvert,
  canConvert = false,
  accountRegion = '',
}) {
  const { sales } = usePreferences()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [draftOpen, setDraftOpen] = useState(false)
  const [draft, setDraft] = useState(null)
  const [copied, setCopied] = useState(false)

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

  const runDraftEmail = async () => {
    setBusy(true)
    setMsg('')
    setCopied(false)
    try {
      const res = await crmApi.emailDraft({
        objectType,
        id,
        tone: sales?.emailTone || 'professional',
        saveAsTask: sales?.saveEmailAsTask !== false,
      })
      setDraft(res.data || {})
      setDraftOpen(true)
      setMsg(res.data?.taskId ? 'Draft ready (saved as Task).' : 'Draft ready.')
    } catch (err) {
      setMsg(err.message || 'Draft failed')
    } finally {
      setBusy(false)
    }
  }

  const runEnrich = async () => {
    setBusy(true)
    setMsg('')
    try {
      await crmApi.enrich({ object: objectType, id, overwrite: false })
      setMsg('Enriched from web — refresh the record to see updates.')
      await load()
    } catch (err) {
      setMsg(err.message || 'Enrich failed')
    } finally {
      setBusy(false)
    }
  }

  const runFindContacts = async () => {
    if (objectType !== 'accounts') {
      setMsg('Open an Account detail page to find contacts.')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const res = await crmApi.findContacts({
        accountId: id,
        region: accountRegion || undefined,
        save: sales?.findContactsAutoSave !== false,
      })
      const d = res.data || {}
      setMsg(
        `Found ${(d.people || []).length} contact(s)`
        + (d.saved ? ` · saved +${d.contactsCreated || 0}` : ' · not auto-saved'),
      )
    } catch (err) {
      setMsg(err.message || 'Find contacts failed')
    } finally {
      setBusy(false)
    }
  }

  const askAi = () => {
    window.dispatchEvent(new CustomEvent('sales-copilot-open', {
      detail: { prompt: 'Summarize this record and suggest the best next step.' },
    }))
  }

  const actionType = data?.actionType || 'task'
  const primaryEmail = actionType === 'email' && ['leads', 'contacts'].includes(objectType)
  const primaryEnrich = actionType === 'enrich' && ['leads', 'accounts'].includes(objectType)
  const primaryFind = actionType === 'find_contacts' && objectType === 'accounts'

  const copyDraft = async () => {
    if (!draft) return
    const text = `To: ${draft.to || ''}\nSubject: ${draft.subject || ''}\n\n${draft.body || ''}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setMsg('Could not copy — select text manually.')
    }
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
            <div className="crm-ai-next-actions">
              {primaryEmail ? (
                <button type="button" className="crm-btn-primary" disabled={busy} onClick={runDraftEmail}>
                  {busy ? 'Working…' : 'Draft email'}
                </button>
              ) : null}
              {primaryEnrich ? (
                <button type="button" className="crm-btn-primary" disabled={busy} onClick={runEnrich}>
                  {busy ? 'Working…' : 'Enrich'}
                </button>
              ) : null}
              {primaryFind ? (
                <button type="button" className="crm-btn-primary" disabled={busy} onClick={runFindContacts}>
                  {busy ? 'Working…' : 'Find contacts'}
                </button>
              ) : null}
              {!primaryEmail && !primaryEnrich && !primaryFind ? (
                <button type="button" className="crm-btn-primary" disabled={busy} onClick={createTask}>
                  {busy ? 'Creating…' : 'Create task'}
                </button>
              ) : (
                <button type="button" className="crm-btn-secondary" disabled={busy} onClick={createTask}>
                  Create task
                </button>
              )}
              {canConvert && onRequestConvert ? (
                <button type="button" className="crm-btn-secondary" disabled={busy} onClick={onRequestConvert}>
                  Convert lead
                </button>
              ) : null}
            </div>
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

      <CrmModal
        title="Email draft"
        open={draftOpen}
        onClose={() => setDraftOpen(false)}
        requiredLegend={false}
        footer={(
          <>
            <button type="button" className="crm-btn-secondary" onClick={() => setDraftOpen(false)}>Close</button>
            <button type="button" className="crm-btn-primary" disabled={!draft?.body} onClick={copyDraft}>
              {copied ? 'Copied' : 'Copy to clipboard'}
            </button>
          </>
        )}
      >
        {draft ? (
          <>
            <label className="crm-field">
              <span>To</span>
              <input readOnly value={draft.to || '(no email on record)'} />
            </label>
            <label className="crm-field">
              <span>Subject</span>
              <input
                value={draft.subject || ''}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
              />
            </label>
            <label className="crm-field">
              <span>Body</span>
              <textarea
                rows={10}
                value={draft.body || ''}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              />
            </label>
          </>
        ) : null}
      </CrmModal>
    </section>
  )
}
