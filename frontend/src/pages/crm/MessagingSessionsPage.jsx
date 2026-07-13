import React, { useCallback, useEffect, useState } from 'react'
import { messagingSessionsApi } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import CrmListView from '../../components/crm/CrmListView'
import CrmModal from '../../components/crm/CrmModal'

const STATUSES = ['New', 'Active', 'Ended']
const CHANNELS = ['--None--', 'Web Chat', 'SMS', 'WhatsApp', 'Facebook', 'Other']
const PLATFORMS = ['--None--', 'Web', 'Mobile', 'API', 'Other']

const emptyForm = () => ({
  name: '',
  channel: '',
  messagingUser: '',
  platformType: '',
  status: 'New',
})

function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export default function MessagingSessionsPage() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [listError, setListError] = useState('')

  const load = useCallback(async (q = '') => {
    setLoading(true)
    setListError('')
    try {
      const res = await messagingSessionsApi.list(q)
      setItems(res.data || [])
    } catch (err) {
      setListError(err.message || 'Failed to load messaging sessions')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 250)
    return () => clearTimeout(t)
  }, [search, load])

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm())
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (row) => {
    const item = items.find((s) => s._id === row.id) || row.raw
    if (!item) return
    setEditingId(item._id)
    setForm({
      name: item.name || '',
      channel: item.channel || '',
      messagingUser: item.messagingUser || '',
      platformType: item.platformType || '',
      status: item.status || 'New',
    })
    setErrors({})
    setModalOpen(true)
  }

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const save = async (andNew = false) => {
    if (!String(form.name || '').trim()) {
      setErrors({ name: 'Complete this field.' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        channel: form.channel,
        messagingUser: form.messagingUser,
        platformType: form.platformType,
        status: form.status,
      }
      if (editingId) await messagingSessionsApi.update(editingId, payload)
      else await messagingSessionsApi.create(payload)
      await load(search)
      if (andNew) {
        setEditingId(null)
        setForm(emptyForm())
        setErrors({})
      } else setModalOpen(false)
    } catch (err) {
      setErrors({ form: err.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const rows = items.map((s) => ({
    id: s._id,
    raw: s,
    name: s.name || '—',
    channel: s.channel || '—',
    messagingUser: s.messagingUser || '—',
    ownerAlias: s.ownerAlias || '—',
    platformType: s.platformType || '—',
    status: s.status || '—',
    startTime: formatDateTime(s.startTime || s.createdAt),
    endTime: formatDateTime(s.endTime),
  }))

  return (
    <>
      {listError ? <p className="crm-banner-error">{listError}</p> : null}
      <CrmListView
        title="Recently Viewed"
        count={rows.length}
        sortLabel="Updated a few seconds ago"
        search={search}
        onSearchChange={setSearch}
        actions={(
          <button type="button" className="crm-btn-primary" onClick={openNew}>New</button>
        )}
        columns={[
          { key: 'name', label: 'Messaging Session Name' },
          { key: 'channel', label: 'Messaging Channel' },
          { key: 'messagingUser', label: 'Messaging User' },
          { key: 'ownerAlias', label: 'Session Owner' },
          { key: 'platformType', label: 'Platform Type' },
          { key: 'status', label: 'Status' },
          { key: 'startTime', label: 'Start Time' },
          { key: 'endTime', label: 'End Time' },
        ]}
        rows={rows}
        loading={loading}
        onRowClick={openEdit}
        emptyTitle="Connect with customers across channels"
        emptyDescription="Messaging creates a consistent experience between your agents and customers."
        emptyActionLabel="New Messaging Session"
        onEmptyAction={openNew}
      />

      <CrmModal
        title={editingId ? 'Edit Messaging Session' : 'New Messaging Session'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            <button type="button" className="crm-btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className="crm-btn-secondary" disabled={saving} onClick={() => save(true)}>Save & New</button>
            <button type="button" className="crm-btn-primary" disabled={saving} onClick={() => save(false)}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      >
        {errors.form ? <p className="crm-banner-error">{errors.form}</p> : null}
        <div className="crm-section-bar">Session Information</div>
        <label className={`crm-field${errors.name ? ' has-error' : ''}`}>
          <span>* Messaging Session Name</span>
          <input value={form.name} onChange={(e) => setField('name', e.target.value)} />
          {errors.name ? <span className="crm-field-error">{errors.name}</span> : null}
        </label>
        <div className="crm-field-row">
          <label className="crm-field">
            <span>Messaging Channel</span>
            <select
              value={form.channel || '--None--'}
              onChange={(e) => setField('channel', e.target.value === '--None--' ? '' : e.target.value)}
            >
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="crm-field">
            <span>Platform Type</span>
            <select
              value={form.platformType || '--None--'}
              onChange={(e) => setField('platformType', e.target.value === '--None--' ? '' : e.target.value)}
            >
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <div className="crm-field-row">
          <label className="crm-field">
            <span>Messaging User</span>
            <input value={form.messagingUser} onChange={(e) => setField('messagingUser', e.target.value)} />
          </label>
          <label className="crm-field">
            <span>Status</span>
            <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <div className="crm-owner-field">
          <span>Session Owner</span>
          <div className="crm-owner-value">
            <span className="crm-avatar">{(user?.name || 'U').slice(0, 1)}</span>
            {user?.name || '—'}
          </div>
        </div>
      </CrmModal>
    </>
  )
}
