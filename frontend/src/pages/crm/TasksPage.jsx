import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { tasksApi } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

const RELATED_PATH = {
  Lead: (id) => `/sales/leads/${id}`,
  Contact: (id) => `/sales/contacts/${id}`,
  Account: (id) => `/sales/accounts/${id}`,
  Opportunity: (id) => `/sales/pipeline/${id}`,
  Case: () => '/sales/service/cases',
}

function relatedLink(task) {
  const fn = RELATED_PATH[task.relatedType]
  if (!fn || !task.relatedId) return null
  return fn(task.relatedId)
}

export default function TasksPage() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('mine-open') // mine-open | overdue | all-open | completed
  const [subject, setSubject] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('Normal')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const opts = {}
      if (filter === 'mine-open') {
        opts.mine = true
        opts.status = 'open'
      } else if (filter === 'overdue') {
        opts.mine = true
        opts.overdue = true
      } else if (filter === 'all-open') {
        opts.status = 'open'
      } else if (filter === 'completed') {
        opts.mine = true
        opts.status = 'completed'
      }
      const res = await tasksApi.list(opts)
      setItems(res.data || [])
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load tasks')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => {
    const now = new Date()
    let overdue = 0
    items.forEach((t) => {
      if (t.status !== 'Completed' && t.dueDate && new Date(t.dueDate) < now) overdue += 1
    })
    return { overdue, total: items.length }
  }, [items])

  const addTask = async (e) => {
    e.preventDefault()
    if (!subject.trim()) return
    setBusy(true)
    try {
      await tasksApi.create({
        subject: subject.trim(),
        status: 'Not Started',
        priority,
        dueDate: dueDate || null,
      })
      setSubject('')
      setDueDate('')
      setPriority('Normal')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to create task')
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
      relatedType: task.relatedType || '',
      relatedId: task.relatedId || null,
      dueDate: task.dueDate || null,
    })
    await load()
  }

  return (
    <div className="crm-home">
      <header className="crm-home-header">
        <h2>My Tasks</h2>
        <p>
          Follow-ups for {user?.name || 'you'} — overdue and open work across Leads, Accounts, and Opportunities.
        </p>
      </header>

      {error ? <p className="crm-banner-error">{error}</p> : null}

      <div className="crm-pipeline-toolbar" style={{ marginBottom: '1rem' }}>
        <div className="crm-view-toggle">
          {[
            { id: 'mine-open', label: 'My open' },
            { id: 'overdue', label: `Overdue${filter === 'overdue' || counts.overdue ? '' : ''}` },
            { id: 'all-open', label: 'All open' },
            { id: 'completed', label: 'Completed' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={filter === f.id ? 'active' : ''}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="crm-muted">{loading ? 'Loading…' : `${counts.total} shown`}</span>
      </div>

      <form className="crm-activity-form crm-activity-form-row" onSubmit={addTask} style={{ marginBottom: '1rem' }}>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="New task (no related record)…"
          aria-label="New task"
        />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="Low">Low</option>
          <option value="Normal">Normal</option>
          <option value="High">High</option>
        </select>
        <button type="submit" className="crm-btn-primary" disabled={busy || !subject.trim()}>Add task</button>
      </form>

      <section className="crm-home-panel">
        {!loading && items.length === 0 ? <p className="crm-muted">No tasks in this view.</p> : null}
        <ul className="crm-activity-list">
          {items.map((t) => {
            const link = relatedLink(t)
            const overdue = t.status !== 'Completed' && t.dueDate && new Date(t.dueDate) < new Date()
            return (
              <li key={t._id} className={`${t.status === 'Completed' ? 'is-done' : ''}${overdue ? ' is-overdue' : ''}`}>
                <label>
                  <input
                    type="checkbox"
                    checked={t.status === 'Completed'}
                    onChange={() => toggleComplete(t)}
                  />
                  <span>
                    <strong>{t.subject}</strong>
                    <em>
                      {t.priority && t.priority !== 'Normal' ? `${t.priority} · ` : ''}
                      {t.status}
                      {t.dueDate ? ` · due ${String(t.dueDate).slice(0, 10)}` : ''}
                      {overdue ? ' · overdue' : ''}
                      {t.relatedType ? ` · ${t.relatedType}` : ''}
                    </em>
                    {link ? (
                      <span style={{ display: 'block', marginTop: 4 }}>
                        <Link to={link}>Open related</Link>
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
