import React, { useState } from 'react'
import { crmApi } from '../../api/client'
import CrmModal from './CrmModal'

/**
 * Paste meeting notes / transcript on an Opportunity → summary + Tasks.
 */
export default function MeetingNotesButton({
  opportunityId,
  className = 'crm-btn-secondary',
  label = 'Meeting notes',
  onDone,
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState(null)

  const run = async () => {
    if (!opportunityId || !notes.trim()) {
      setError('Paste meeting notes first.')
      return
    }
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await crmApi.meetingNotes({
        opportunityId,
        notes: notes.trim(),
      })
      setResult(res.data || {})
      onDone?.(res.data)
    } catch (err) {
      setError(err.message || 'Meeting notes failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={!opportunityId}
        onClick={() => {
          setOpen(true)
          setError('')
          setResult(null)
        }}
      >
        {label}
      </button>
      <CrmModal
        title="Meeting notes → tasks"
        open={open}
        onClose={() => setOpen(false)}
        requiredLegend={false}
        footer={(
          <>
            <button type="button" className="crm-btn-secondary" onClick={() => setOpen(false)}>Close</button>
            {!result ? (
              <button
                type="button"
                className="crm-btn-primary"
                disabled={busy || !notes.trim()}
                onClick={run}
              >
                {busy ? 'Processing…' : 'Create summary + tasks'}
              </button>
            ) : null}
          </>
        )}
      >
        {error ? <p className="crm-banner-error">{error}</p> : null}
        {!result ? (
          <label className="crm-field">
            <span>Paste notes or transcript</span>
            <textarea
              rows={12}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Paste call notes, Zoom transcript, or meeting minutes…"
              disabled={busy}
            />
          </label>
        ) : (
          <>
            <p className="crm-muted">
              Updated opportunity
              {result.mode === 'llm' ? ' (AI)' : ' (rules)'}
              {' · '}
              {(result.tasksCreated || []).length} task(s) created. Refresh timeline to see them.
            </p>
            {result.nextStep ? (
              <p><strong>Next step:</strong> {result.nextStep}</p>
            ) : null}
            <label className="crm-field">
              <span>Summary</span>
              <textarea rows={6} readOnly value={result.summary || ''} />
            </label>
            {(result.tasksCreated || []).length ? (
              <ul className="crm-recent-list">
                {result.tasksCreated.map((t) => (
                  <li key={t.taskId}>
                    <span>{t.subject}</span>
                    <span>{t.dueDate || ''} · {t.priority || ''}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </CrmModal>
    </>
  )
}
