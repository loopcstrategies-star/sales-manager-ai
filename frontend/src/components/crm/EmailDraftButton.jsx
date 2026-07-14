import React, { useState } from 'react'
import { crmApi } from '../../api/client'
import CrmModal from './CrmModal'

/**
 * Groq/OpenAI outreach draft for a Lead or Contact. Saves as a Task by default.
 */
export default function EmailDraftButton({
  objectType,
  id,
  hasEmail = true,
  className = 'crm-btn-secondary',
  label = 'Draft email',
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(null)
  const [copied, setCopied] = useState(false)

  const run = async () => {
    if (!id) return
    setOpen(true)
    setBusy(true)
    setError('')
    setDraft(null)
    setCopied(false)
    try {
      const res = await crmApi.emailDraft({
        objectType,
        id,
        saveAsTask: true,
      })
      setDraft(res.data || {})
    } catch (err) {
      setError(err.message || 'Draft failed (need GROQ_API_KEY).')
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
      <button type="button" className={className} disabled={!id || busy} onClick={run} title={!hasEmail ? 'Draft anyway — set email if you have it' : undefined}>
        {busy ? 'Drafting…' : label}
      </button>
      <CrmModal
        title="Email draft"
        open={open}
        onClose={() => setOpen(false)}
        requiredLegend={false}
        footer={(
          <>
            <button type="button" className="crm-btn-secondary" onClick={() => setOpen(false)}>Close</button>
            <button type="button" className="crm-btn-primary" disabled={!draft?.body} onClick={copyAll}>
              {copied ? 'Copied' : 'Copy to clipboard'}
            </button>
          </>
        )}
      >
        {busy ? <p className="crm-muted">Generating with Groq…</p> : null}
        {error ? <p className="crm-banner-error">{error}</p> : null}
        {draft ? (
          <>
            <p className="crm-muted">Saved as a Task on this record. Paste into your mail client to send.</p>
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
        ) : null}
      </CrmModal>
    </>
  )
}
