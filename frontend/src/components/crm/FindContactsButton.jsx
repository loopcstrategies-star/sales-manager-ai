import React, { useState } from 'react'
import { crmApi } from '../../api/client'

/**
 * Find publicly listed people/emails/phones for an Account via search + LLM.
 */
export default function FindContactsButton({
  accountId,
  region = '',
  onFound,
  label = 'Find contacts',
  className = 'crm-btn-secondary',
}) {
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')

  const run = async () => {
    if (!accountId) {
      setHint('Save the account first.')
      return
    }
    setBusy(true)
    setHint('')
    try {
      const res = await crmApi.findContacts({
        accountId,
        region: region || undefined,
        save: true,
      })
      const d = res.data || {}
      setHint(
        `Found ${(d.people || []).length} · saved +${d.contactsCreated || 0} · skipped ${d.contactsSkipped || 0}. From site pages + search — verify before outreach.`,
      )
      onFound?.(d)
    } catch (err) {
      setHint(err.message || 'Find contacts failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="crm-enrich-wrap">
      <button type="button" className={className} disabled={busy || !accountId} onClick={run}>
        {busy ? 'Finding contacts…' : label}
      </button>
      {hint ? <span className="crm-enrich-hint">{hint}</span> : null}
    </div>
  )
}
