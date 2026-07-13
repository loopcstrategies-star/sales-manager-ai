import React, { useCallback, useEffect, useState } from 'react'
import { campaignsApi } from '../../api/client'
import CrmListView from '../../components/crm/CrmListView'
import CrmModal from '../../components/crm/CrmModal'

const STATUSES = ['Planned', 'In Progress', 'Completed', 'Aborted']
const TYPES = ['Email', 'Event', 'Social', 'Webinar', 'Other']

const emptyForm = () => ({
  name: '',
  status: 'Planned',
  type: 'Email',
  startDate: '',
  endDate: '',
  description: '',
})

export default function MarketingPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const res = await campaignsApi.list(q)
      setItems(res.data || [])
    } catch {
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
    const item = items.find((c) => c._id === row.id)
    if (!item) return
    setEditingId(item._id)
    setForm({
      name: item.name || '',
      status: item.status || 'Planned',
      type: item.type || 'Email',
      startDate: item.startDate ? String(item.startDate).slice(0, 10) : '',
      endDate: item.endDate ? String(item.endDate).slice(0, 10) : '',
      description: item.description || '',
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
        status: form.status,
        type: form.type,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        description: form.description,
      }
      if (editingId) await campaignsApi.update(editingId, payload)
      else await campaignsApi.create(payload)
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

  const rows = items.map((c) => ({
    id: c._id,
    name: c.name,
    type: c.type,
    status: c.status,
    startDate: c.startDate ? String(c.startDate).slice(0, 10) : '—',
    endDate: c.endDate ? String(c.endDate).slice(0, 10) : '—',
    ownerAlias: c.ownerAlias || '—',
  }))

  return (
    <>
      <CrmListView
        title="Campaigns"
        count={rows.length}
        sortLabel="Last Updated"
        search={search}
        onSearchChange={setSearch}
        actions={<button type="button" className="crm-btn-primary" onClick={openNew}>New</button>}
        columns={[
          { key: 'name', label: 'Campaign Name' },
          { key: 'type', label: 'Type' },
          { key: 'status', label: 'Status' },
          { key: 'startDate', label: 'Start Date' },
          { key: 'endDate', label: 'End Date' },
          { key: 'ownerAlias', label: 'Owner' },
        ]}
        rows={rows}
        loading={loading}
        onRowClick={openEdit}
        emptyTitle="Plan and run marketing campaigns."
        emptyDescription="Create campaigns to organize outreach by type and status."
        emptyActionLabel="Add a Campaign"
        onEmptyAction={openNew}
      />

      <CrmModal
        title={editingId ? 'Edit Campaign' : 'New Campaign'}
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
        <label className={`crm-field${errors.name ? ' has-error' : ''}`}>
          <span>* Campaign Name</span>
          <input value={form.name} onChange={(e) => setField('name', e.target.value)} />
          {errors.name ? <span className="crm-field-error">{errors.name}</span> : null}
        </label>
        <div className="crm-field-row">
          <label className="crm-field">
            <span>Type</span>
            <select value={form.type} onChange={(e) => setField('type', e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="crm-field">
            <span>Status</span>
            <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <div className="crm-field-row">
          <label className="crm-field">
            <span>Start Date</span>
            <input type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} />
          </label>
          <label className="crm-field">
            <span>End Date</span>
            <input type="date" value={form.endDate} onChange={(e) => setField('endDate', e.target.value)} />
          </label>
        </div>
        <label className="crm-field">
          <span>Description</span>
          <textarea rows={4} value={form.description} onChange={(e) => setField('description', e.target.value)} />
        </label>
      </CrmModal>
    </>
  )
}
