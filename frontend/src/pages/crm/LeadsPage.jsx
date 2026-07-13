import React, { useCallback, useEffect, useState } from 'react'
import { leadsApi } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import CrmListView from '../../components/crm/CrmListView'
import CrmModal from '../../components/crm/CrmModal'

const STATUSES = ['Open', 'Working', 'Qualified', 'Unqualified']

const emptyForm = () => ({
  firstName: '',
  lastName: '',
  company: '',
  title: '',
  phone: '',
  email: '',
  status: 'Open',
  state: '',
  description: '',
})

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString()
}

export default function LeadsPage() {
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
      const res = await leadsApi.list(q, 'open')
      setItems(res.data || [])
    } catch (err) {
      setListError(err.message || 'Failed to load leads')
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
    const item = items.find((l) => l._id === row.id) || row.raw
    if (!item) return
    setEditingId(item._id)
    setForm({
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      company: item.company || '',
      title: item.title || '',
      phone: item.phone || '',
      email: item.email || '',
      status: item.status || 'Open',
      state: item.state || '',
      description: item.description || '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const validate = () => {
    const next = {}
    if (!String(form.lastName || '').trim()) next.lastName = 'Complete this field.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const buildPayload = () => ({
    firstName: form.firstName,
    lastName: form.lastName.trim(),
    company: form.company,
    title: form.title,
    phone: form.phone,
    email: form.email,
    status: form.status,
    state: form.state,
    description: form.description,
  })

  const save = async (andNew = false) => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = buildPayload()
      if (editingId) await leadsApi.update(editingId, payload)
      else await leadsApi.create(payload)
      await load(search)
      if (andNew) {
        setEditingId(null)
        setForm(emptyForm())
        setErrors({})
      } else {
        setModalOpen(false)
      }
    } catch (err) {
      setErrors({ form: err.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const rows = items.map((l) => ({
    id: l._id,
    raw: l,
    name: l.fullName || [l.firstName, l.lastName].filter(Boolean).join(' '),
    company: l.company || '—',
    state: l.state || '—',
    phone: l.phone || '—',
    email: l.email || '—',
    status: l.status || '—',
    createdDate: formatDate(l.createdAt),
    ownerAlias: l.ownerAlias || '—',
  }))

  return (
    <>
      {listError ? <p className="crm-banner-error">{listError}</p> : null}
      <CrmListView
        title="All Open Leads"
        count={rows.length}
        sortLabel="Company · Filtered by All leads - Lead Status"
        search={search}
        onSearchChange={setSearch}
        actions={(
          <>
            <button type="button" className="crm-btn-primary" onClick={openNew}>New</button>
            <button type="button" className="crm-btn-secondary" disabled title="Coming soon">Import</button>
            <button type="button" className="crm-btn-secondary" disabled title="Coming soon">Add to Campaign</button>
            <button type="button" className="crm-btn-secondary" disabled title="Coming soon">Send Email</button>
          </>
        )}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'company', label: 'Company' },
          { key: 'state', label: 'State/Province' },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'status', label: 'Lead Status' },
          { key: 'createdDate', label: 'Created Date' },
          { key: 'ownerAlias', label: 'Owner Alias' },
        ]}
        rows={rows}
        loading={loading}
        onRowClick={openEdit}
        emptyTitle="Focus on the right leads"
        emptyDescription="Leads are potential customers and deals. Track progress and see which ones are most likely to close."
        emptyActionLabel="Add a Lead"
        onEmptyAction={openNew}
      />

      <CrmModal
        title={editingId ? 'Edit Lead' : 'New Lead'}
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

        <div className="crm-section-bar">About</div>
        <label className="crm-field">
          <span>First Name</span>
          <input value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} />
        </label>
        <label className={`crm-field${errors.lastName ? ' has-error' : ''}`}>
          <span>* Last Name</span>
          <input value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} />
          {errors.lastName ? <span className="crm-field-error">{errors.lastName}</span> : null}
        </label>
        <label className="crm-field">
          <span>Company</span>
          <input value={form.company} onChange={(e) => setField('company', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Title</span>
          <input value={form.title} onChange={(e) => setField('title', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Lead Status</span>
          <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="crm-owner-field">
          <span>Lead Owner</span>
          <div className="crm-owner-value">
            <span className="crm-avatar">{(user?.name || 'U').slice(0, 1)}</span>
            {user?.name || '—'}
          </div>
        </div>

        <div className="crm-section-bar">Get in Touch</div>
        <label className="crm-field">
          <span>Phone</span>
          <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>State/Province</span>
          <input value={form.state} onChange={(e) => setField('state', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
        </label>
      </CrmModal>
    </>
  )
}
