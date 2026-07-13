import React, { useCallback, useEffect, useState } from 'react'
import { priceBooksApi } from '../../api/client'
import CrmListView from '../../components/crm/CrmListView'
import CrmModal from '../../components/crm/CrmModal'

const emptyForm = () => ({
  name: '',
  description: '',
  active: true,
})

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString()
}

export default function PriceBooksPage() {
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
      const res = await priceBooksApi.list(q)
      setItems(res.data || [])
    } catch (err) {
      setListError(err.message || 'Failed to load price books')
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
    const item = items.find((p) => p._id === row.id) || row.raw
    if (!item) return
    setEditingId(item._id)
    setForm({
      name: item.name || '',
      description: item.description || '',
      active: item.active !== false,
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
        description: form.description,
        active: Boolean(form.active),
      }
      if (editingId) await priceBooksApi.update(editingId, payload)
      else await priceBooksApi.create(payload)
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

  const rows = items.map((p) => ({
    id: p._id,
    raw: p,
    name: p.name || '—',
    description: p.description || '—',
    updatedAt: formatDate(p.updatedAt),
    active: p.active === false ? 'No' : 'Yes',
  }))

  return (
    <>
      {listError ? <p className="crm-banner-error">{listError}</p> : null}
      <CrmListView
        title="Recently Viewed"
        count={rows.length}
        sortLabel="Last Modified Date"
        search={search}
        onSearchChange={setSearch}
        actions={(
          <button type="button" className="crm-btn-primary" onClick={openNew}>New</button>
        )}
        columns={[
          { key: 'name', label: 'Price Book Name' },
          { key: 'description', label: 'Description' },
          { key: 'updatedAt', label: 'Last Modified Date' },
          { key: 'active', label: 'Active' },
        ]}
        rows={rows}
        loading={loading}
        onRowClick={openEdit}
        emptyTitle="You haven't viewed any Price Books recently"
        emptyDescription="Try switching list views or create a price book to get started."
        emptyActionLabel="New Price Book"
        onEmptyAction={openNew}
      />

      <CrmModal
        title={editingId ? 'Edit Price Book' : 'New Price Book'}
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
        <div className="crm-section-bar">Information</div>
        <label className={`crm-field${errors.name ? ' has-error' : ''}`}>
          <span>* Price Book Name</span>
          <input value={form.name} onChange={(e) => setField('name', e.target.value)} />
          {errors.name ? <span className="crm-field-error">{errors.name}</span> : null}
        </label>
        <label className="crm-field">
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
        </label>
        <label className="crm-checkbox">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setField('active', e.target.checked)}
          />
          Active
        </label>
      </CrmModal>
    </>
  )
}
