import React, { useCallback, useEffect, useState } from 'react'
import { accountsApi, opportunitiesApi } from '../../api/client'
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
  description: '',
})

export default function PipelinePage() {
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
      const res = await opportunitiesApi.list(q)
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
    const item = items.find((o) => o._id === row.id)
    if (!item) return
    setEditingId(item._id)
    setForm({
      name: item.name || '',
      accountId: item.accountId || '',
      accountName: item.accountName || '',
      amount: item.amount != null ? String(item.amount) : '',
      stage: item.stage || 'Prospecting',
      closeDate: item.closeDate ? String(item.closeDate).slice(0, 10) : '',
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
        accountId: form.accountId || '',
        amount: Number(form.amount) || 0,
        stage: form.stage,
        closeDate: form.closeDate || null,
        description: form.description,
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

  const searchAccounts = useCallback(async (q) => {
    const res = await accountsApi.list(q)
    return (res.data || []).map((a) => ({ id: a._id, label: a.name }))
  }, [])

  const rows = items.map((o) => ({
    id: o._id,
    name: o.name,
    accountName: o.accountName || '—',
    amount: o.amount != null ? `$${Number(o.amount).toLocaleString()}` : '—',
    stage: o.stage,
    closeDate: o.closeDate ? String(o.closeDate).slice(0, 10) : '—',
    ownerAlias: o.ownerAlias || '—',
  }))

  return (
    <>
      <CrmListView
        title="Opportunities"
        count={rows.length}
        sortLabel="Last Updated"
        search={search}
        onSearchChange={setSearch}
        actions={<button type="button" className="crm-btn-primary" onClick={openNew}>New</button>}
        columns={[
          { key: 'name', label: 'Opportunity Name' },
          { key: 'accountName', label: 'Account' },
          { key: 'amount', label: 'Amount' },
          { key: 'stage', label: 'Stage' },
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

      <CrmModal
        title={editingId ? 'Edit Opportunity' : 'New Opportunity'}
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
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
        </label>
      </CrmModal>
    </>
  )
}
