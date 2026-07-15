import React, { useState } from 'react'
import { crmApi } from '../../api/client'
import CrmModal from './CrmModal'
import { usePreferences } from '../../context/PreferencesContext'

/**
 * Paste an inbound email → suggested reply + optional Task log.
 */
export default function ReplyAssistButton({
  objectType,
  id,
  className = 'crm-btn-secondary',
  label = 'Reply assist',
}) {
  const { sales } = usePreferences()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [inbound, setInbound] = useState('')
  const [draft, setDraft] = useState(null)
  const [copied, setCopied] = useState(false)
  const [taskId, setTaskId] = useState(null)

  const run = async () => {
    if (!id || !inbound.trim()) {
      setError('Paste the inbound email first.')
      return
    }
    setBusy(true)
    setError('')
    setDraft(null)
    setCopied(false)
    setTaskId(null)
    try {
      const res = await crmApi.replyAssist({
        objectType,
        id,
        inbound: inbound.trim(),
        logAsTask: sales?.saveEmailAsTask !== false,
      })
      setDraft(res.data || {})
      setTaskId(res.data?.taskId || null)
    } catch (err) {
      setError(err.message || 'Reply assist failed.')
    } finally {
      setBusy(false)
    }
  }

  const copyAll = async () => {
    if (!draft) return
    const text = `To: ${draft.to || ''}\nSubject: ${draft.subject || ''}\n\n${draft.body || ''}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setError('Could not copy — select the text manually.')
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={!id}
        onClick={() => {
          setOpen(true)
          setError('')
          setDraft(null)
        }}
      >
        {label}
      </button>
      <CrmModal
        title="Reply assist"
        open={open}
        onClose={() => setOpen(false)}
        requiredLegend={false}
        footer={(
          <>
            <button type="button" className="crm-btn-secondary" onClick={() => setOpen(false)}>Close</button>
            {!draft ? (
              <button type="button" className="crm-btn-primary" disabled={busy || !inbound.trim()} onClick={run}>
                {busy ? 'Drafting…' : 'Suggest reply'}
              </button>
            ) : (
              <button type="button" className="crm-btn-primary" disabled={!draft?.body} onClick={copyAll}>
                {copied ? 'Copied' : 'Copy reply'}
              </button>
            )}
          </>
        )}
      >
        {error ? <p className="crm-banner-error">{error}</p> : null}
        {!draft ? (
          <label className="crm-field">
            <span>Paste inbound email</span>
            <textarea
              rows={10}
              value={inbound}
              onChange={(e) => setInbound(e.target.value)}
              placeholder="Paste the customer email here…"
              disabled={busy}
            />
          </label>
        ) : (
          <>
            <p className="crm-muted">
              {taskId
                ? 'Suggested reply saved as a Task on this record.'
                : 'Suggested reply ready. Paste into your mail client to send.'}
            </p>
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
                rows={12}
                value={draft.body || ''}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              />
            </label>
          </>
        )}
      </CrmModal>
    </>
  )
}
