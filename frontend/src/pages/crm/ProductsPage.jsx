import React, { useCallback, useEffect, useState } from 'react'
import { productsApi } from '../../api/client'
import CrmListView from '../../components/crm/CrmListView'
import CrmModal from '../../components/crm/CrmModal'

const FAMILIES = ['--None--', 'Hardware', 'Software', 'Services', 'Other']

const emptyForm = () => ({
  name: '',
  family: '',
  productCode: '',
  sku: '',
  active: true,
  description: '',
})

export default function ProductsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(emptyForm())
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [listError, setListError] = useState('')

  const load = useCallback(async (q = '') => {
    setLoading(true)
    setListError('')
    try {
      const res = await productsApi.list(q)
      setItems(res.data || [])
    } catch (err) {
      setListError(err.message || 'Failed to load products')
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
    setStep(1)
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (row) => {
    const item = items.find((p) => p._id === row.id) || row.raw
    if (!item) return
    setEditingId(item._id)
    setForm({
      name: item.name || '',
      family: item.family || '',
      productCode: item.productCode || '',
      sku: item.sku || '',
      active: item.active !== false,
      description: item.description || '',
    })
    setStep(1)
    setErrors({})
    setModalOpen(true)
  }

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const validateStep1 = () => {
    const next = {}
    if (!String(form.name || '').trim()) next.name = 'Complete this field.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async (andNew = false) => {
    if (!validateStep1()) {
      setStep(1)
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        family: form.family,
        productCode: form.productCode,
        sku: form.sku,
        active: Boolean(form.active),
        description: form.description,
      }
      if (editingId) await productsApi.update(editingId, payload)
      else await productsApi.create(payload)
      await load(search)
      if (andNew) {
        setEditingId(null)
        setForm(emptyForm())
        setStep(1)
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
    productCode: p.productCode || '—',
    description: p.description || '—',
    family: p.family || '—',
  }))

  return (
    <>
      {listError ? <p className="crm-banner-error">{listError}</p> : null}
      <CrmListView
        title="All Products"
        count={rows.length}
        sortLabel="Product Name"
        search={search}
        onSearchChange={setSearch}
        actions={(
          <>
            <button type="button" className="crm-btn-primary" onClick={openNew}>New</button>
            <button type="button" className="crm-btn-secondary" disabled title="Coming soon">Printable View</button>
          </>
        )}
        columns={[
          { key: 'name', label: 'Product Name' },
          { key: 'productCode', label: 'Product Code' },
          { key: 'description', label: 'Product Description' },
          { key: 'family', label: 'Product Family' },
        ]}
        rows={rows}
        loading={loading}
        onRowClick={openEdit}
        emptyTitle="Products are your goods and services"
        emptyDescription="Create a shared list of products so everyone in your company can make quotes and sell to customers."
        emptyActionLabel="Create a Product"
        onEmptyAction={openNew}
      />

      <CrmModal
        title={editingId ? 'Edit Product' : 'New Product'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            <div className="crm-wizard-progress" aria-hidden="true">
              <span className={`crm-wizard-dot${step === 1 ? ' active' : ''}`} />
              <span className="crm-wizard-line" />
              <span className={`crm-wizard-dot${step === 2 ? ' active' : ''}`} />
            </div>
            <div className="crm-footer-actions">
              {step === 1 ? (
                <>
                  <button type="button" className="crm-btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                  <button
                    type="button"
                    className="crm-btn-primary"
                    onClick={() => { if (validateStep1()) setStep(2) }}
                  >
                    Next
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="crm-btn-secondary" onClick={() => setStep(1)}>Back</button>
                  <button type="button" className="crm-btn-secondary" disabled={saving} onClick={() => save(true)}>Save & New</button>
                  <button type="button" className="crm-btn-primary" disabled={saving} onClick={() => save(false)}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      >
        {errors.form ? <p className="crm-banner-error">{errors.form}</p> : null}

        {step === 1 ? (
          <>
            <div className="crm-field-row">
              <label className={`crm-field${errors.name ? ' has-error' : ''}`}>
                <span>* Product Name</span>
                <input value={form.name} onChange={(e) => setField('name', e.target.value)} />
                {errors.name ? <span className="crm-field-error">{errors.name}</span> : null}
              </label>
              <label className="crm-field">
                <span>Product Family</span>
                <select
                  value={form.family || '--None--'}
                  onChange={(e) => setField('family', e.target.value === '--None--' ? '' : e.target.value)}
                >
                  {FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
            </div>
            <div className="crm-field-row">
              <label className="crm-field">
                <span>Product Code</span>
                <input value={form.productCode} onChange={(e) => setField('productCode', e.target.value)} />
              </label>
              <label className="crm-field">
                <span>Product SKU</span>
                <input value={form.sku} onChange={(e) => setField('sku', e.target.value)} />
              </label>
            </div>
            <label className="crm-checkbox">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setField('active', e.target.checked)}
              />
              Active
            </label>
            <label className="crm-field">
              <span>Product Description</span>
              <textarea rows={4} value={form.description} onChange={(e) => setField('description', e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <div className="crm-section-bar">Confirm Product</div>
            <div className="crm-field-row">
              <div className="crm-readonly-field">
                <span>Product Name</span>
                <p>{form.name || '—'}</p>
              </div>
              <div className="crm-readonly-field">
                <span>Product Family</span>
                <p>{form.family || '—'}</p>
              </div>
            </div>
            <div className="crm-field-row">
              <div className="crm-readonly-field">
                <span>Product Code</span>
                <p>{form.productCode || '—'}</p>
              </div>
              <div className="crm-readonly-field">
                <span>Product SKU</span>
                <p>{form.sku || '—'}</p>
              </div>
            </div>
            <div className="crm-readonly-field">
              <span>Active</span>
              <p>{form.active ? 'Yes' : 'No'}</p>
            </div>
            <div className="crm-readonly-field">
              <span>Description</span>
              <p>{form.description || '—'}</p>
            </div>
          </>
        )}
      </CrmModal>
    </>
  )
}
