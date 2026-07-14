import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { accountsApi, opportunitiesApi, productsApi } from '../../api/client'
import CrmListView from '../../components/crm/CrmListView'
import CrmModal from '../../components/crm/CrmModal'
import LookupField from '../../components/crm/LookupField'

const STAGES = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']

const emptyForm = () => ({
  name: '',
  accountId: '',
  accountName: '',
  amount: '',
  stage: 'Prospecting',
  closeDate: '',
  nextStep: '',
  nextStepDue: '',
  description: '',
  products: [],
})

export default function PipelinePage() {
  const [items, setItems] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [view, setView] = useState('kanban')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [dragId, setDragId] = useState(null)

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const [oppRes, prodRes] = await Promise.all([
        opportunitiesApi.list(q),
        productsApi.list('').catch(() => ({ data: [] })),
      ])
      setItems(oppRes.data || [])
      setProducts(prodRes.data || [])
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

  const openEdit = (rowOrItem) => {
    const item = items.find((o) => o._id === (rowOrItem.id || rowOrItem._id)) || rowOrItem
    if (!item?._id) return
    setEditingId(item._id)
    setForm({
      name: item.name || '',
      accountId: item.accountId || '',
      accountName: item.accountName || '',
      amount: item.amount != null ? String(item.amount) : '',
      stage: item.stage || 'Prospecting',
      closeDate: item.closeDate ? String(item.closeDate).slice(0, 10) : '',
      nextStep: item.nextStep || '',
      nextStepDue: item.nextStepDue ? String(item.nextStepDue).slice(0, 10) : '',
      description: item.description || '',
      products: Array.isArray(item.products) ? item.products.map((p) => ({
        productId: p.productId || '',
        productName: p.productName || '',
        quantity: p.quantity ?? 1,
        unitPrice: p.unitPrice ?? 0,
      })) : [],
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
      const products = (form.products || []).filter((p) => p.productName || p.productId)
      const payload = {
        name: form.name.trim(),
        accountId: form.accountId || '',
        amount: Number(form.amount) || 0,
        stage: form.stage,
        closeDate: form.closeDate || null,
        nextStep: form.nextStep || '',
        nextStepDue: form.nextStepDue || null,
        description: form.description,
        products,
      }
      if (editingId) await opportunitiesApi.update(editingId, payload)
      else await opportunitiesApi.create(payload)
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

  const moveStage = async (id, stage) => {
    try {
      await opportunitiesApi.update(id, { stage })
      await load(search)
    } catch {
      /* ignore */
    }
  }

  const deleteSelected = async () => {
    if (!selectedIds.length) return
    if (!window.confirm(`Delete ${selectedIds.length} opportunit${selectedIds.length === 1 ? 'y' : 'ies'}?`)) return
    await Promise.all(selectedIds.map((id) => opportunitiesApi.remove(id).catch(() => null)))
    setSelectedIds([])
    await load(search)
  }

  const searchAccounts = useCallback(async (q) => {
    const res = await accountsApi.list(q)
    return (res.data || []).map((a) => ({ id: a._id, label: a.name }))
  }, [])

  const addProductLine = () => {
    setForm((f) => ({
      ...f,
      products: [...(f.products || []), { productId: '', productName: '', quantity: 1, unitPrice: 0 }],
    }))
  }

  const setProductLine = (idx, patch) => {
    setForm((f) => {
      const products = [...(f.products || [])]
      products[idx] = { ...products[idx], ...patch }
      const amount = products.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.unitPrice) || 0), 0)
      return { ...f, products, amount: String(amount) }
    })
  }

  const rows = items.map((o) => ({
    id: o._id,
    name: <Link to={`/sales/pipeline/${o._id}`} onClick={(e) => e.stopPropagation()}>{o.name}</Link>,
    accountName: o.accountName || '—',
    amount: o.amount != null ? `$${Number(o.amount).toLocaleString()}` : '—',
    stage: o.stage,
    nextStep: o.nextStep || '—',
    closeDate: o.closeDate ? String(o.closeDate).slice(0, 10) : '—',
    ownerAlias: o.ownerAlias || '—',
  }))

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s, []]))
    items.forEach((o) => {
      const stage = STAGES.includes(o.stage) ? o.stage : 'Prospecting'
      map[stage].push(o)
    })
    return map
  }, [items])

  return (
    <>
      <div className="crm-pipeline-toolbar">
        <div className="crm-view-toggle">
          <button type="button" className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}>Kanban</button>
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
        </div>
        <button type="button" className="crm-btn-primary" onClick={openNew}>New</button>
      </div>

      {view === 'kanban' ? (
        <div className="crm-kanban">
          {loading ? <p className="crm-muted">Loading…</p> : null}
          {!loading && STAGES.map((stage) => (
            <div
              key={stage}
              className="crm-kanban-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) moveStage(dragId, stage)
                setDragId(null)
              }}
            >
              <header>
                <h3>{stage}</h3>
                <span>{byStage[stage].length}</span>
              </header>
              <div className="crm-kanban-cards">
                {byStage[stage].map((o) => (
                  <article
                    key={o._id}
                    className="crm-kanban-card"
                    draggable
                    onDragStart={() => setDragId(o._id)}
                    onDoubleClick={() => openEdit(o)}
                  >
                    <Link to={`/sales/pipeline/${o._id}`}>{o.name}</Link>
                    <p>{o.accountName || 'No account'}</p>
                    <strong>${Number(o.amount || 0).toLocaleString()}</strong>
                    {o.nextStep ? (
                      <span
                        className={`crm-kanban-next${
                          o.nextStepDue && new Date(o.nextStepDue) < new Date()
                          && !['Closed Won', 'Closed Lost'].includes(o.stage)
                            ? ' is-overdue'
                            : ''
                        }`}
                      >
                        Next: {o.nextStep}
                        {o.nextStepDue ? ` · ${String(o.nextStepDue).slice(0, 10)}` : ''}
                      </span>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <CrmListView
          title="Opportunities"
          count={rows.length}
          sortLabel="Last Updated"
          search={search}
          onSearchChange={setSearch}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          bulkActions={(
            <button type="button" className="crm-btn-secondary" onClick={deleteSelected}>Delete</button>
          )}
          actions={<button type="button" className="crm-btn-primary" onClick={openNew}>New</button>}
          columns={[
            { key: 'name', label: 'Opportunity Name' },
            { key: 'accountName', label: 'Account' },
            { key: 'amount', label: 'Amount' },
            { key: 'stage', label: 'Stage' },
            { key: 'nextStep', label: 'Next Step' },
            { key: 'closeDate', label: 'Close Date' },
            { key: 'ownerAlias', label: 'Owner' },
          ]}
          rows={rows}
          loading={loading}
          onRowClick={openEdit}
          emptyTitle="Track deals in your pipeline."
          emptyDescription="Create opportunities to manage stages from prospecting to close."
          emptyActionLabel="Add an Opportunity"
          onEmptyAction={openNew}
        />
      )}

      <CrmModal
        title={editingId ? 'Edit Opportunity' : 'New Opportunity'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            {editingId ? (
              <button
                type="button"
                className="crm-btn-secondary"
                onClick={async () => {
                  if (!window.confirm('Delete this opportunity?')) return
                  await opportunitiesApi.remove(editingId)
                  setModalOpen(false)
                  await load(search)
                }}
              >
                Delete
              </button>
            ) : null}
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
          <span>* Opportunity Name</span>
          <input value={form.name} onChange={(e) => setField('name', e.target.value)} />
          {errors.name ? <span className="crm-field-error">{errors.name}</span> : null}
        </label>
        <LookupField
          label="Account Name"
          valueId={form.accountId}
          valueLabel={form.accountName}
          placeholder="Search Accounts..."
          onSearch={searchAccounts}
          onSelect={(opt) => {
            setField('accountId', opt.id)
            setField('accountName', opt.label)
          }}
          onClear={() => {
            setField('accountId', '')
            setField('accountName', '')
          }}
        />
        <label className="crm-field">
          <span>Amount</span>
          <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setField('amount', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Stage</span>
          <select value={form.stage} onChange={(e) => setField('stage', e.target.value)}>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="crm-field">
          <span>Close Date</span>
          <input type="date" value={form.closeDate} onChange={(e) => setField('closeDate', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Next Step</span>
          <input
            value={form.nextStep}
            onChange={(e) => setField('nextStep', e.target.value)}
            placeholder="e.g. Call buyer, send quote…"
          />
        </label>
        <label className="crm-field">
          <span>Next Step Due</span>
          <input type="date" value={form.nextStepDue} onChange={(e) => setField('nextStepDue', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
        </label>

        <div className="crm-section-bar">Products</div>
        {(form.products || []).map((line, idx) => (
          <div key={idx} className="crm-opp-product-row">
            <select
              value={line.productId || ''}
              onChange={(e) => {
                const p = products.find((x) => x._id === e.target.value)
                setProductLine(idx, {
                  productId: e.target.value,
                  productName: p?.name || line.productName,
                })
              }}
            >
              <option value="">Select product…</option>
              {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
            <input
              type="number"
              min="0"
              value={line.quantity}
              onChange={(e) => setProductLine(idx, { quantity: Number(e.target.value) })}
              aria-label="Quantity"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={line.unitPrice}
              onChange={(e) => setProductLine(idx, { unitPrice: Number(e.target.value) })}
              aria-label="Unit price"
            />
          </div>
        ))}
        <button type="button" className="crm-btn-secondary" onClick={addProductLine}>Add product</button>
      </CrmModal>
    </>
  )
}
