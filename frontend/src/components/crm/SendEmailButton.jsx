import React, { useState } from 'react'
import { crmApi } from '../../api/client'
import CrmModal from './CrmModal'
import { usePreferences } from '../../context/PreferencesContext'

/**
 * Draft (optional) + send outreach via SendGrid, or log as Task if send is not configured.
 */
export default function SendEmailButton({
  objectType,
  id,
  hasEmail = true,
  className = 'crm-btn-secondary',
  label = 'Send Email',
}) {
  const { sales, providers } = usePreferences()
  const sendConfigured = Boolean(providers?.sendgrid)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const run = async () => {
    if (!id) return
    setOpen(true)
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await crmApi.emailSend({
        objectType,
        id,
        tone: sales?.emailTone || 'professional',
      })
      setResult(res.data || {})
    } catch (err) {
      setError(err.message || 'Send failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={!id || busy}
        onClick={run}
        title={hasEmail ? undefined : 'Needs an email on the record'}
      >
        {busy ? 'Sending…' : label}
      </button>
      <CrmModal
        title="Send email"
        open={open}
        onClose={() => setOpen(false)}
        requiredLegend={false}
        footer={(
          <button type="button" className="crm-btn-secondary" onClick={() => setOpen(false)}>Close</button>
        )}
      >
        {busy ? <p className="crm-muted">Drafting and sending…</p> : null}
        {error ? <p className="crm-banner-error">{error}</p> : null}
        {result ? (
          <div>
            <p>
              {result.sent
                ? `Sent to ${result.to} via ${result.provider}.`
                : `Not sent via provider${result.error ? `: ${result.error}` : '.'}`}
            </p>
            {result.taskId ? (
              <p className="crm-muted">Logged as CRM task ({String(result.taskId).slice(-6)}).</p>
            ) : null}
            {!sendConfigured ? (
              <p className="crm-muted">
                Tip: set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL on the API to enable live send.
              </p>
            ) : null}
            {result.subject ? (
              <>
                <p><strong>Subject:</strong> {result.subject}</p>
              </>
            ) : null}
          </div>
        ) : null}
      </CrmModal>
    </>
  )
}
