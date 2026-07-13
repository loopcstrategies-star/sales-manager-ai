import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { calendarEventsApi } from '../../api/client'
import CrmModal from '../../components/crm/CrmModal'

const HOURS = Array.from({ length: 12 }, (_, i) => i + 7) // 7am–6pm

function startOfWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function formatWeekRange(weekStart) {
  const end = addDays(weekStart, 6)
  const opts = { day: 'numeric', month: 'long', year: 'numeric' }
  return `${weekStart.toLocaleDateString(undefined, opts)} — ${end.toLocaleDateString(undefined, opts)}`
}

function toLocalInput(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const emptyForm = (weekStart) => {
  const start = new Date(weekStart)
  start.setHours(9, 0, 0, 0)
  const end = new Date(start)
  end.setHours(10, 0, 0, 0)
  return {
    title: '',
    startAt: toLocalInput(start),
    endAt: toLocalInput(end),
    description: '',
  }
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [showMyEvents, setShowMyEvents] = useState(true)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(() => emptyForm(startOfWeek(new Date())))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const load = useCallback(async () => {
    setLoading(true)
    setListError('')
    try {
      const res = await calendarEventsApi.list('', weekStart.toISOString(), weekEnd.toISOString())
      setItems(res.data || [])
    } catch (err) {
      setListError(err.message || 'Failed to load events')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [weekStart, weekEnd])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm(weekStart))
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (ev) => {
    setEditingId(ev._id)
    setForm({
      title: ev.title || '',
      startAt: toLocalInput(ev.startAt),
      endAt: toLocalInput(ev.endAt),
      description: ev.description || '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    if (!String(form.title || '').trim()) {
      setErrors({ title: 'Complete this field.' })
      return
    }
    if (!form.startAt || !form.endAt) {
      setErrors({ form: 'Start and end are required.' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
        description: form.description,
      }
      if (editingId) await calendarEventsApi.update(editingId, payload)
      else await calendarEventsApi.create(payload)
      setModalOpen(false)
      await load()
    } catch (err) {
      setErrors({ form: err.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const visibleEvents = showMyEvents ? items : []

  const eventsForDayHour = (day, hour) => visibleEvents.filter((ev) => {
    const start = new Date(ev.startAt)
    return sameDay(start, day) && start.getHours() === hour
  })

  const monthDays = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1)
    const start = startOfWeek(first)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [monthCursor])

  const monthLabel = monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="crm-calendar-page">
      {listError ? <p className="crm-banner-error">{listError}</p> : null}

      <header className="crm-calendar-header">
        <div>
          <h1 className="crm-calendar-title">Calendar</h1>
          <p className="crm-calendar-range">{formatWeekRange(weekStart)}</p>
        </div>
        <div className="crm-calendar-header-actions">
          <button type="button" className="crm-btn-secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
          <button
            type="button"
            className="crm-btn-secondary"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
          >
            Today
          </button>
          <button type="button" className="crm-btn-secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
          <button type="button" className="crm-btn-primary" onClick={openNew}>New Event</button>
        </div>
      </header>

      <div className="crm-calendar-body">
        <div className="crm-calendar-grid-wrap">
          {loading ? <p className="crm-analytics-muted">Loading…</p> : null}
          <div className="crm-calendar-grid">
            <div className="crm-calendar-corner" />
            {days.map((day) => (
              <div key={day.toISOString()} className="crm-calendar-day-head">
                <span>{day.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <strong>{day.getDate()}</strong>
              </div>
            ))}
            {HOURS.map((hour) => (
              <React.Fragment key={hour}>
                <div className="crm-calendar-hour">
                  {hour > 12 ? `${hour - 12} pm` : hour === 12 ? '12 pm' : `${hour} am`}
                </div>
                {days.map((day) => (
                  <div key={`${day.toISOString()}-${hour}`} className="crm-calendar-cell">
                    {eventsForDayHour(day, hour).map((ev) => (
                      <button
                        key={ev._id}
                        type="button"
                        className="crm-calendar-event"
                        onClick={() => openEdit(ev)}
                      >
                        {ev.title}
                      </button>
                    ))}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        <aside className="crm-calendar-rail">
          <div className="crm-mini-cal">
            <div className="crm-mini-cal-head">
              <button type="button" className="crm-link-btn" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>‹</button>
              <strong>{monthLabel}</strong>
              <button type="button" className="crm-link-btn" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>›</button>
            </div>
            <div className="crm-mini-cal-dow">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="crm-mini-cal-grid">
              {monthDays.map((d) => {
                const inMonth = d.getMonth() === monthCursor.getMonth()
                const isToday = sameDay(d, new Date())
                const inWeek = d >= weekStart && d < weekEnd
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    className={`crm-mini-cal-day${!inMonth ? ' muted' : ''}${isToday ? ' today' : ''}${inWeek ? ' in-week' : ''}`}
                    onClick={() => setWeekStart(startOfWeek(d))}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="crm-calendar-lists">
            <h3>My Calendars</h3>
            <label className="crm-checkbox">
              <input
                type="checkbox"
                checked={showMyEvents}
                onChange={(e) => setShowMyEvents(e.target.checked)}
              />
              My Events
            </label>
            <h3>Other Calendars</h3>
            <p className="crm-analytics-muted">No other calendars yet.</p>
          </div>
        </aside>
      </div>

      <CrmModal
        title={editingId ? 'Edit Event' : 'New Event'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            <button type="button" className="crm-btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className="crm-btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      >
        {errors.form ? <p className="crm-banner-error">{errors.form}</p> : null}
        <label className={`crm-field${errors.title ? ' has-error' : ''}`}>
          <span>* Subject</span>
          <input value={form.title} onChange={(e) => setField('title', e.target.value)} />
          {errors.title ? <span className="crm-field-error">{errors.title}</span> : null}
        </label>
        <div className="crm-field-row">
          <label className="crm-field">
            <span>Start</span>
            <input type="datetime-local" value={form.startAt} onChange={(e) => setField('startAt', e.target.value)} />
          </label>
          <label className="crm-field">
            <span>End</span>
            <input type="datetime-local" value={form.endAt} onChange={(e) => setField('endAt', e.target.value)} />
          </label>
        </div>
        <label className="crm-field">
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
        </label>
      </CrmModal>
    </div>
  )
}
