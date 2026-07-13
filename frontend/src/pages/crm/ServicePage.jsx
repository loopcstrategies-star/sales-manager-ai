import React, { useCallback, useEffect, useState } from 'react'
import { accountsApi, casesApi, contactsApi } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import CrmListView from '../../components/crm/CrmListView'
import CrmModal from '../../components/crm/CrmModal'
import LookupField from '../../components/crm/LookupField'

const STATUSES = ['New', 'Working', 'Escalated', 'Closed']
const PRIORITIES = ['Low', 'Medium', 'High']
const ORIGINS = ['--None--', 'Phone', 'Email', 'Web', 'Other']

const emptyForm = () => ({
  subject: '',
  contactId: '',
  contactName: '',
  accountId: '',
  accountName: '',
  status: 'New',
  priority: 'Medium',
  caseOrigin: '',
  sendNotificationEmail: false,
  description: '',
})

function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export default function ServicePage() {
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
      const res = await casesApi.list(q, 'open')
      setItems(res.data || [])
    } catch (err) {
      setListError(err.message || 'Failed to load cases')
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
    const item = items.find((c) => c._id === row.id) || row.raw
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
      caseOrigin: item.caseOrigin || '',
      sendNotificationEmail: Boolean(item.sendNotificationEmail),
      description: item.description || '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const validate = () => {
    const next = {}
    if (!String(form.subject || '').trim()) next.subject = 'Complete this field.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const buildPayload = () => ({
    subject: form.subject.trim(),
    contactId: form.contactId || '',
    accountId: form.accountId || '',
    status: form.status,
    priority: form.priority,
    caseOrigin: form.caseOrigin,
    sendNotificationEmail: Boolean(form.sendNotificationEmail),
    description: form.description,
  })

  const save = async (andNew = false) => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = buildPayload()
      if (editingId) await casesApi.update(editingId, payload)
      else await casesApi.create(payload)
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
    raw: c,
    caseNumber: c.caseNumber || '—',
    contactName: c.contactName || '—',
    subject: c.subject || '—',
    status: c.status || '—',
    priority: c.priority || '—',
    openedAt: formatDateTime(c.createdAt),
    ownerAlias: c.ownerAlias || '—',
  }))

  return (
    <>
      {listError ? <p className="crm-banner-error">{listError}</p> : null}
      <CrmListView
        title="All Open Cases"
        count={rows.length}
        sortLabel="Case Number · Filtered by All cases - Case Status"
        search={search}
        onSearchChange={setSearch}
        actions={(
          <>
            <button type="button" className="crm-btn-primary" onClick={openNew}>New</button>
            <button type="button" className="crm-btn-secondary" disabled title="Coming soon">Change Owner</button>
            <button type="button" className="crm-btn-secondary" disabled title="Coming soon">Merge Cases</button>
            <button type="button" className="crm-btn-secondary" disabled title="Coming soon">Printable View</button>
          </>
        )}
        columns={[
          { key: 'caseNumber', label: 'Case Number' },
          { key: 'contactName', label: 'Contact Name' },
          { key: 'subject', label: 'Subject' },
          { key: 'status', label: 'Status' },
          { key: 'priority', label: 'Priority' },
          { key: 'openedAt', label: 'Date/Time Opened' },
          { key: 'ownerAlias', label: 'Case Owner Alias' },
        ]}
        rows={rows}
        loading={loading}
        onRowClick={openEdit}
        emptyTitle="Track customer support in one place"
        emptyDescription="Cases bring together customer questions, feedback, and issues from any channel."
        emptyActionLabel="Add a Case"
        onEmptyAction={openNew}
      />

      <CrmModal
        title={editingId ? 'Edit Case' : 'New Case'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            <label className="crm-footer-start crm-checkbox">
              <input
                type="checkbox"
                checked={form.sendNotificationEmail}
                onChange={(e) => setField('sendNotificationEmail', e.target.checked)}
              />
              Send notification email to contact
            </label>
            <div className="crm-footer-actions">
              <button type="button" className="crm-btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="button" className="crm-btn-secondary" disabled={saving} onClick={() => save(true)}>Save & New</button>
              <button type="button" className="crm-btn-primary" disabled={saving} onClick={() => save(false)}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      >
        {errors.form ? <p className="crm-banner-error">{errors.form}</p> : null}

        <div className="crm-section-bar">Case Information</div>
        <div className="crm-field-row">
          <label className="crm-field">
            <span>* Status</span>
            <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="crm-field">
            <span>Case Origin</span>
            <select
              value={form.caseOrigin || '--None--'}
              onChange={(e) => setField('caseOrigin', e.target.value === '--None--' ? '' : e.target.value)}
            >
              {ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>
        <div className="crm-field-row">
          <label className="crm-field">
            <span>Priority</span>
            <select value={form.priority} onChange={(e) => setField('priority', e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <div className="crm-owner-field">
            <span>Case Owner</span>
            <div className="crm-owner-value">
              <span className="crm-avatar">{(user?.name || 'U').slice(0, 1)}</span>
              {user?.name || '—'}
            </div>
          </div>
        </div>

        <div className="crm-section-bar">Contact Information</div>
        <div className="crm-field-row">
          <LookupField
            label="Contact Name"
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
        </div>

        <div className="crm-section-bar">Description Information</div>
        <label className={`crm-field${errors.subject ? ' has-error' : ''}`}>
          <span>* Subject</span>
          <input value={form.subject} onChange={(e) => setField('subject', e.target.value)} />
          {errors.subject ? <span className="crm-field-error">{errors.subject}</span> : null}
        </label>
        <label className="crm-field">
          <span>Description</span>
          <textarea rows={4} value={form.description} onChange={(e) => setField('description', e.target.value)} />
        </label>
      </CrmModal>
    </>
  )
}
