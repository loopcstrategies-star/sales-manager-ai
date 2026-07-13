import React, { useState } from 'react'
import { crmApi } from '../../api/client'

/**
 * Enrich from live web search. Works on saved records (id) or draft form fields.
 */
export default function CrmEnrichButton({
  objectType,
  id,
  draft,
  overwrite = false,
  onEnriched,
  label = 'Enrich from web',
  className = 'crm-btn-secondary',
}) {
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')

  const run = async () => {
    setBusy(true)
    setHint('')
    try {
      const res = await crmApi.enrich({
        object: objectType,
        id: id || undefined,
        draft: draft || undefined,
        overwrite,
      })
      onEnriched?.(res.data)
    } catch (err) {
      setHint(err.message || 'Enrichment failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="crm-enrich-wrap">
      <button type="button" className={className} disabled={busy} onClick={run}>
        {busy ? 'Enriching…' : label}
      </button>
      {hint ? <span className="crm-enrich-hint">{hint}</span> : null}
    </div>
  )
}
