import React, { useState } from 'react'
import { crmApi } from '../../api/client'

/**
 * Day 0 email draft Task + Day 3 follow-up Task.
 */
export default function SequenceLiteButton({
  objectType,
  id,
  className = 'crm-btn-secondary',
  label = 'Start sequence',
  onDone,
}) {
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!id || busy) return
    if (!window.confirm('Create Day 0 outreach draft + Day 3 follow-up task on this record?')) return
    setBusy(true)
    try {
      const res = await crmApi.sequenceLite({ objectType, id })
      onDone?.(res.data)
    } catch (err) {
      window.alert(err.message || 'Sequence failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className={className} disabled={!id || busy} onClick={run}>
      {busy ? 'Starting…' : label}
    </button>
  )
}
