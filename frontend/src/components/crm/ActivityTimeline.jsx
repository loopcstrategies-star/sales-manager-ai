import React, { useCallback, useEffect, useState } from 'react'
import { tasksApi } from '../../api/client'

export default function ActivityTimeline({ relatedType, relatedId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!relatedType || !relatedId) return
    setLoading(true)
    try {
      const res = await tasksApi.list({ relatedType, relatedId })
      setItems(res.data || [])
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load activities')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [relatedType, relatedId])

  useEffect(() => { load() }, [load])

  const addTask = async (e) => {
    e.preventDefault()
    if (!subject.trim()) return
    setBusy(true)
    try {
      await tasksApi.create({
        subject: subject.trim(),
        relatedType,
        relatedId,
        status: 'Not Started',
        priority: 'Normal',
      })
      setSubject('')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to add task')
    } finally {
      setBusy(false)
    }
  }

  const toggleComplete = async (task) => {
    const next = task.status === 'Completed' ? 'Not Started' : 'Completed'
    await tasksApi.update(task._id, {
      subject: task.subject,
      status: next,
      priority: task.priority || 'Normal',
      description: task.description || '',
      relatedType: task.relatedType || relatedType,
      relatedId: task.relatedId || relatedId,
      dueDate: task.dueDate || null,
    })
    await load()
  }

  return (
    <section className="crm-activity-timeline">
      <h3>Activity</h3>
      <form className="crm-activity-form" onSubmit={addTask}>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Add a task…"
          aria-label="New task"
        />
        <button type="submit" className="crm-btn-secondary" disabled={busy || !subject.trim()}>
          Add
        </button>
      </form>
      {error ? <p className="crm-banner-error">{error}</p> : null}
      {loading ? <p className="crm-muted">Loading…</p> : null}
      {!loading && items.length === 0 ? <p className="crm-muted">No tasks yet.</p> : null}
      <ul className="crm-activity-list">
        {items.map((t) => (
          <li key={t._id} className={t.status === 'Completed' ? 'is-done' : ''}>
            <label>
              <input
                type="checkbox"
                checked={t.status === 'Completed'}
                onChange={() => toggleComplete(t)}
              />
              <span>
                <strong>{t.subject}</strong>
                <em>{t.status}{t.dueDate ? ` · due ${String(t.dueDate).slice(0, 10)}` : ''}</em>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
