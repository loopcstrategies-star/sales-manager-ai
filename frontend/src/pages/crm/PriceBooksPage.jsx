import React, { useCallback, useEffect, useState } from 'react'
import { priceBooksApi, productsApi } from '../../api/client'
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
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [listError, setListError] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [entries, setEntries] = useState([])
  const [entryForm, setEntryForm] = useState({ productId: '', listPrice: '' })
  const [entrySaving, setEntrySaving] = useState(false)

  const load = useCallback(async (q = '') => {
    setLoading(true)
    setListError('')
    try {
      const [booksRes, productsRes] = await Promise.all([
        priceBooksApi.list(q),
        productsApi.list('').catch(() => ({ data: [] })),
      ])
      setItems(booksRes.data || [])
      setProducts(productsRes.data || [])
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

  const loadEntries = async (bookId) => {
    if (!bookId) {
      setEntries([])
      return
    }
    try {
      const res = await priceBooksApi.listEntries(bookId)
      setEntries(res.data || [])
    } catch {
      setEntries([])
    }
  }

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm())
    setErrors({})
    setEntries([])
    setEntryForm({ productId: '', listPrice: '' })
    setModalOpen(true)
  }

  const openEdit = async (row) => {
    const item = items.find((p) => p._id === row.id) || row.raw
    if (!item) return
    setEditingId(item._id)
    setForm({
      name: item.name || '',
      description: item.description || '',
      active: item.active !== false,
    })
    setErrors({})
    setEntryForm({ productId: '', listPrice: '' })
    setModalOpen(true)
    await loadEntries(item._id)
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
      let id = editingId
      if (editingId) {
        await priceBooksApi.update(editingId, payload)
      } else {
        const created = await priceBooksApi.create(payload)
        id = created.data?._id || null
        setEditingId(id)
      }
      await load(search)
      if (andNew) {
        setEditingId(null)
        setForm(emptyForm())
        setErrors({})
        setEntries([])
      } else if (id && editingId) {
        setModalOpen(false)
      }
    } catch (err) {
      setErrors({ form: err.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const addEntry = async () => {
    if (!editingId || !entryForm.productId) return
    setEntrySaving(true)
    try {
      await priceBooksApi.upsertEntry(editingId, {
        productId: entryForm.productId,
        listPrice: Number(entryForm.listPrice) || 0,
        active: true,
      })
      setEntryForm({ productId: '', listPrice: '' })
      await loadEntries(editingId)
    } catch (err) {
      setErrors({ form: err.message || 'Failed to add product' })
    } finally {
      setEntrySaving(false)
    }
  }

  const removeEntry = async (entryId) => {
    if (!editingId) return
    await priceBooksApi.removeEntry(editingId, entryId).catch(() => null)
    await loadEntries(editingId)
  }

  const deleteSelected = async () => {
    if (!selectedIds.length) return
    if (!window.confirm(`Delete ${selectedIds.length} price book(s)?`)) return
    await Promise.all(selectedIds.map((id) => priceBooksApi.remove(id).catch(() => null)))
    setSelectedIds([])
    await load(search)
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
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={(
          <button type="button" className="crm-btn-secondary" onClick={deleteSelected}>Delete</button>
        )}
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
            <div className="crm-footer-start">
              {editingId ? (
                <button
                  type="button"
                  className="crm-btn-secondary"
                  onClick={async () => {
                    if (!window.confirm('Delete this price book?')) return
                    await priceBooksApi.remove(editingId)
                    setModalOpen(false)
                    await load(search)
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
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

        {editingId ? (
          <>
            <div className="crm-section-bar">Price Book Entries</div>
            <div className="crm-field-row">
              <label className="crm-field">
                <span>Product</span>
                <select
                  value={entryForm.productId}
                  onChange={(e) => setEntryForm((f) => ({ ...f, productId: e.target.value }))}
                >
                  <option value="">Select product…</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="crm-field">
                <span>List Price</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={entryForm.listPrice}
                  onChange={(e) => setEntryForm((f) => ({ ...f, listPrice: e.target.value }))}
                />
              </label>
            </div>
            <button type="button" className="crm-btn-secondary" disabled={entrySaving || !entryForm.productId} onClick={addEntry}>
              {entrySaving ? 'Adding…' : 'Add Product'}
            </button>
            {entries.length ? (
              <table className="crm-table crm-inline-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>List Price</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e._id}>
                      <td>{e.productName || '—'}</td>
                      <td>{Number(e.listPrice || 0).toLocaleString()}</td>
                      <td>
                        <button type="button" className="crm-btn-secondary" onClick={() => removeEntry(e._id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="crm-empty-desc">No products in this price book yet.</p>
            )}
          </>
        ) : (
          <p className="crm-empty-desc">Save the price book first to add product list prices.</p>
        )}
      </CrmModal>
    </>
  )
}
