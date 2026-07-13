import React, { useCallback, useEffect, useState } from 'react'
import { accountsApi, casesApi, contactsApi } from '../../api/client'
import CrmListView from '../../components/crm/CrmListView'
import CrmModal from '../../components/crm/CrmModal'
import LookupField from '../../components/crm/LookupField'

const STATUSES = ['New', 'Working', 'Escalated', 'Closed']
const PRIORITIES = ['Low', 'Medium', 'High']

const emptyForm = () => ({
  subject: '',
  contactId: '',
  contactName: '',
  accountId: '',
  accountName: '',
  status: 'New',
  priority: 'Medium',
  description: '',
})

export default function ServicePage() {
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
      const res = await casesApi.list(q)
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
      subject: item.subject || '',
      contactId: item.contactId || '',
      contactName: item.contactName || '',
      accountId: item.accountId || '',
      accountName: item.accountName || '',
      status: item.status || 'New',
      priority: item.priority || 'Medium',
      description: item.description || '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const save = async (andNew = false) => {
    if (!String(form.subject || '').trim()) {
      setErrors({ subject: 'Complete this field.' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        subject: form.subject.trim(),
        contactId: form.contactId || '',
        accountId: form.accountId || '',
        status: form.status,
        priority: form.priority,
        description: form.description,
      }
      if (editingId) await casesApi.update(editingId, payload)
      else await casesApi.create(payload)
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

  const searchContacts = useCallback(async (q) => {
    const res = await contactsApi.list(q)
    return (res.data || []).map((c) => ({
      id: c._id,
      label: c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' '),
    }))
  }, [])

  const searchAccounts = useCallback(async (q) => {
    const res = await accountsApi.list(q)
    return (res.data || []).map((a) => ({ id: a._id, label: a.name }))
  }, [])

  const rows = items.map((c) => ({
    id: c._id,
    subject: c.subject,
    contactName: c.contactName || '—',
    accountName: c.accountName || '—',
    status: c.status,
    priority: c.priority,
    ownerAlias: c.ownerAlias || '—',
  }))

  return (
    <>
      <CrmListView
        title="Cases"
        count={rows.length}
        sortLabel="Last Updated"
        search={search}
        onSearchChange={setSearch}
        actions={<button type="button" className="crm-btn-primary" onClick={openNew}>New</button>}
        columns={[
          { key: 'subject', label: 'Subject' },
          { key: 'contactName', label: 'Contact' },
          { key: 'accountName', label: 'Account' },
          { key: 'status', label: 'Status' },
          { key: 'priority', label: 'Priority' },
          { key: 'ownerAlias', label: 'Owner' },
        ]}
        rows={rows}
        loading={loading}
        onRowClick={openEdit}
        emptyTitle="Support your customers here."
        emptyDescription="Create cases to track service requests and issues."
        emptyActionLabel="Add a Case"
        onEmptyAction={openNew}
      />

      <CrmModal
        title={editingId ? 'Edit Case' : 'New Case'}
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
        <label className={`crm-field${errors.subject ? ' has-error' : ''}`}>
          <span>* Subject</span>
          <input value={form.subject} onChange={(e) => setField('subject', e.target.value)} />
          {errors.subject ? <span className="crm-field-error">{errors.subject}</span> : null}
        </label>
        <LookupField
          label="Contact"
          valueId={form.contactId}
          valueLabel={form.contactName}
          placeholder="Search Contacts..."
          onSearch={searchContacts}
          onSelect={(opt) => {
            setField('contactId', opt.id)
            setField('contactName', opt.label)
          }}
          onClear={() => {
            setField('contactId', '')
            setField('contactName', '')
          }}
        />
        <LookupField
          label="Account"
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
        <div className="crm-field-row">
          <label className="crm-field">
            <span>Status</span>
            <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="crm-field">
            <span>Priority</span>
            <select value={form.priority} onChange={(e) => setField('priority', e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
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
