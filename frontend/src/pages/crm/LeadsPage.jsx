import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { leadsApi } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import CrmListView from '../../components/crm/CrmListView'
import CrmModal from '../../components/crm/CrmModal'
import CrmImportModal from '../../components/crm/CrmImportModal'
import CrmEnrichButton from '../../components/crm/CrmEnrichButton'

const STATUSES = ['Open', 'Working', 'Qualified', 'Unqualified']
const SALUTATIONS = ['--None--', 'Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.']
const COUNTRIES = ['--None--', 'United Arab Emirates', 'United States', 'United Kingdom', 'India', 'Other']
const LEAD_SOURCES = [
  '--None--',
  'Web',
  'Phone Inquiry',
  'Partner Referral',
  'Purchased List',
  'Other',
]
const INDUSTRIES = [
  '--None--',
  'Agriculture',
  'Banking',
  'Biotechnology',
  'Communications',
  'Construction',
  'Consulting',
  'Education',
  'Electronics',
  'Energy',
  'Entertainment',
  'Finance',
  'Food & Beverage',
  'Government',
  'Healthcare',
  'Hospitality',
  'Insurance',
  'Manufacturing',
  'Media',
  'Not For Profit',
  'Recreation',
  'Retail',
  'Shipping',
  'Technology',
  'Telecommunications',
  'Transportation',
  'Utilities',
  'Other',
]

const emptyAddress = () => ({
  country: '',
  street: '',
  city: '',
  zip: '',
  state: '',
})

const emptyForm = () => ({
  salutation: '',
  firstName: '',
  lastName: '',
  company: '',
  title: '',
  website: '',
  phone: '',
  email: '',
  status: 'Open',
  address: emptyAddress(),
  emailOptOut: false,
  numberOfEmployees: '',
  annualRevenue: '',
  leadSource: '',
  industry: '',
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
  const [importOpen, setImportOpen] = useState(false)
  const [enrichedHint, setEnrichedHint] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [convertOpen, setConvertOpen] = useState(false)
  const [converting, setConverting] = useState(false)
  const [convertForm, setConvertForm] = useState({ createOpportunity: true, opportunityName: '', amount: '' })

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
    setEnrichedHint('')
    setModalOpen(true)
  }

  const openEdit = (row) => {
    const item = items.find((l) => l._id === row.id) || row.raw
    if (!item) return
    const address = item.address || {}
    setEditingId(item._id)
    setForm({
      salutation: item.salutation || '',
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      company: item.company || '',
      title: item.title || '',
      website: item.website || '',
      phone: item.phone || '',
      email: item.email || '',
      status: item.status || 'Open',
      address: {
        country: address.country || '',
        street: address.street || '',
        city: address.city || '',
        zip: address.zip || '',
        state: address.state || item.state || '',
      },
      emailOptOut: Boolean(item.emailOptOut),
      numberOfEmployees: item.numberOfEmployees || '',
      annualRevenue: item.annualRevenue || '',
      leadSource: item.leadSource || '',
      industry: item.industry || '',
      description: item.description || '',
    })
    setEnrichedHint(item.lastEnrichedAt
      ? `Updated from web · ${new Date(item.lastEnrichedAt).toLocaleString()}`
      : '')
    setErrors({})
    setModalOpen(true)
  }

  const applyEnrichment = (data) => {
    const fields = data?.record || data?.fields || {}
    setForm((f) => ({
      ...f,
      website: fields.website ?? f.website,
      phone: fields.phone ?? f.phone,
      industry: fields.industry ?? f.industry,
      description: fields.description ?? f.description,
      numberOfEmployees: fields.numberOfEmployees ?? f.numberOfEmployees,
      annualRevenue: fields.annualRevenue ?? f.annualRevenue,
      address: {
        ...f.address,
        city: fields.address?.city ?? fields.city ?? f.address.city,
        country: fields.address?.country ?? fields.country ?? f.address.country,
      },
    }))
    if (data?.record?.lastEnrichedAt) {
      setEnrichedHint(`Updated from web · ${new Date(data.record.lastEnrichedAt).toLocaleString()}`)
    }
    if (data?.record?._id) load(search)
  }

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const setAddress = (key, value) => {
    setForm((f) => ({ ...f, address: { ...f.address, [key]: value } }))
  }

  const validate = () => {
    const next = {}
    if (!String(form.lastName || '').trim()) next.lastName = 'Complete this field.'
    if (!String(form.company || '').trim()) next.company = 'Complete this field.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const buildPayload = () => ({
    salutation: form.salutation,
    firstName: form.firstName,
    lastName: form.lastName.trim(),
    company: form.company.trim(),
    title: form.title,
    website: form.website,
    phone: form.phone,
    email: form.email,
    status: form.status,
    address: {
      country: form.address.country || '',
      street: form.address.street || '',
      city: form.address.city || '',
      zip: form.address.zip || '',
      state: form.address.state || '',
    },
    emailOptOut: Boolean(form.emailOptOut),
    numberOfEmployees: form.numberOfEmployees,
    annualRevenue: form.annualRevenue,
    leadSource: form.leadSource,
    industry: form.industry,
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
    name: (
      <Link to={`/sales/leads/${l._id}`} onClick={(e) => e.stopPropagation()}>
        {l.fullName || [l.firstName, l.lastName].filter(Boolean).join(' ') || '—'}
      </Link>
    ),
    company: l.company || '—',
    state: l.address?.state || l.state || '—',
    phone: l.phone || '—',
    email: l.email || '—',
    status: l.status || '—',
    createdDate: formatDate(l.createdAt),
    ownerAlias: l.ownerAlias || '—',
  }))

  const deleteSelected = async () => {
    if (!selectedIds.length) return
    if (!window.confirm(`Delete ${selectedIds.length} lead(s)?`)) return
    await Promise.all(selectedIds.map((id) => leadsApi.remove(id).catch(() => null)))
    setSelectedIds([])
    await load(search)
  }

  const runConvert = async () => {
    if (!editingId) return
    setConverting(true)
    try {
      await leadsApi.convert(editingId, {
        createOpportunity: convertForm.createOpportunity,
        opportunityName: convertForm.opportunityName,
        amount: Number(convertForm.amount) || 0,
      })
      setConvertOpen(false)
      setModalOpen(false)
      await load(search)
    } catch (err) {
      setErrors({ form: err.message || 'Convert failed' })
    } finally {
      setConverting(false)
    }
  }

  return (
    <>
      {listError ? <p className="crm-banner-error">{listError}</p> : null}
      <CrmListView
        title="All Open Leads"
        count={rows.length}
        sortLabel="Company · Filtered by All leads - Lead Status"
        search={search}
        onSearchChange={setSearch}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={(
          <button type="button" className="crm-btn-secondary" onClick={deleteSelected}>Delete</button>
        )}
        actions={(
          <>
            <button type="button" className="crm-btn-primary" onClick={openNew}>New</button>
            <button type="button" className="crm-btn-secondary" onClick={() => setImportOpen(true)}>Import</button>
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
            <div className="crm-footer-start">
              <CrmEnrichButton
                objectType="leads"
                id={editingId}
                draft={form}
                onEnriched={applyEnrichment}
              />
              {enrichedHint ? <span className="crm-enrich-hint">{enrichedHint}</span> : null}
              {editingId ? (
                <button
                  type="button"
                  className="crm-btn-primary"
                  onClick={() => {
                    setConvertForm({
                      createOpportunity: true,
                      opportunityName: `${form.company} — Opportunity`,
                      amount: '',
                    })
                    setConvertOpen(true)
                  }}
                >
                  Convert
                </button>
              ) : null}
              {editingId ? (
                <button
                  type="button"
                  className="crm-btn-secondary"
                  onClick={async () => {
                    if (!window.confirm('Delete this lead?')) return
                    await leadsApi.remove(editingId)
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

        <div className="crm-section-bar">About</div>
        <label className="crm-field">
          <span>* Lead Status</span>
          <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <div className={`crm-field${errors.lastName ? ' has-error' : ''}`}>
          <span>* Name</span>
          <div className="crm-name-row">
            <select
              aria-label="Salutation"
              value={form.salutation || '--None--'}
              onChange={(e) => setField('salutation', e.target.value === '--None--' ? '' : e.target.value)}
            >
              {SALUTATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              placeholder="First Name"
              value={form.firstName}
              onChange={(e) => setField('firstName', e.target.value)}
            />
            <input
              placeholder="Last Name"
              value={form.lastName}
              onChange={(e) => setField('lastName', e.target.value)}
            />
          </div>
          {errors.lastName ? <span className="crm-field-error">{errors.lastName}</span> : null}
        </div>

        <label className={`crm-field${errors.company ? ' has-error' : ''}`}>
          <span>* Company</span>
          <input value={form.company} onChange={(e) => setField('company', e.target.value)} />
          {errors.company ? <span className="crm-field-error">{errors.company}</span> : null}
        </label>
        <label className="crm-field">
          <span>Title</span>
          <input value={form.title} onChange={(e) => setField('title', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Website</span>
          <input value={form.website} onChange={(e) => setField('website', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
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

        <p className="crm-subsection">Address</p>
        <label className="crm-field">
          <span>Country</span>
          <select
            value={form.address.country || '--None--'}
            onChange={(e) => setAddress('country', e.target.value === '--None--' ? '' : e.target.value)}
          >
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="crm-field">
          <span>Street</span>
          <textarea rows={2} value={form.address.street} onChange={(e) => setAddress('street', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>City</span>
          <input value={form.address.city} onChange={(e) => setAddress('city', e.target.value)} />
        </label>
        <div className="crm-field-row">
          <label className="crm-field">
            <span>Zip/Postal Code</span>
            <input value={form.address.zip} onChange={(e) => setAddress('zip', e.target.value)} />
          </label>
          <label className="crm-field">
            <span>State/Province</span>
            <select
              value={form.address.state || '--None--'}
              onChange={(e) => setAddress('state', e.target.value === '--None--' ? '' : e.target.value)}
            >
              <option value="--None--">--None--</option>
              <option value="Abu Dhabi">Abu Dhabi</option>
              <option value="Dubai">Dubai</option>
              <option value="Sharjah">Sharjah</option>
              <option value="Ajman">Ajman</option>
              <option value="Umm Al Quwain">Umm Al Quwain</option>
              <option value="Ras Al Khaimah">Ras Al Khaimah</option>
              <option value="Fujairah">Fujairah</option>
              <option value="California">California</option>
              <option value="New York">New York</option>
              <option value="Texas">Texas</option>
              <option value="England">England</option>
              <option value="Maharashtra">Maharashtra</option>
              <option value="Other">Other</option>
            </select>
          </label>
        </div>
        <label className="crm-checkbox">
          <input
            type="checkbox"
            checked={form.emailOptOut}
            onChange={(e) => setField('emailOptOut', e.target.checked)}
          />
          Email Opt Out
        </label>

        <div className="crm-section-bar">Segment</div>
        <label className="crm-field">
          <span>No. of Employees</span>
          <input value={form.numberOfEmployees} onChange={(e) => setField('numberOfEmployees', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Annual Revenue</span>
          <input value={form.annualRevenue} onChange={(e) => setField('annualRevenue', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Lead Source</span>
          <select
            value={form.leadSource || '--None--'}
            onChange={(e) => setField('leadSource', e.target.value === '--None--' ? '' : e.target.value)}
          >
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="crm-field">
          <span>Industry</span>
          <select
            value={form.industry || '--None--'}
            onChange={(e) => setField('industry', e.target.value === '--None--' ? '' : e.target.value)}
          >
            {INDUSTRIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </CrmModal>

      <CrmImportModal
        objectType="leads"
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => load(search)}
      />

      <CrmModal
        title="Convert Lead"
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        requiredLegend={false}
        footer={(
          <>
            <button type="button" className="crm-btn-secondary" onClick={() => setConvertOpen(false)}>Cancel</button>
            <button type="button" className="crm-btn-primary" disabled={converting} onClick={runConvert}>
              {converting ? 'Converting…' : 'Convert'}
            </button>
          </>
        )}
      >
        <p className="crm-muted">Creates Account + Contact{convertForm.createOpportunity ? ' + Opportunity' : ''} from this lead.</p>
        <label className="crm-checkbox">
          <input
            type="checkbox"
            checked={convertForm.createOpportunity}
            onChange={(e) => setConvertForm((f) => ({ ...f, createOpportunity: e.target.checked }))}
          />
          Create Opportunity
        </label>
        {convertForm.createOpportunity ? (
          <>
            <label className="crm-field">
              <span>Opportunity Name</span>
              <input
                value={convertForm.opportunityName}
                onChange={(e) => setConvertForm((f) => ({ ...f, opportunityName: e.target.value }))}
              />
            </label>
            <label className="crm-field">
              <span>Amount</span>
              <input
                type="number"
                min="0"
                value={convertForm.amount}
                onChange={(e) => setConvertForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </label>
          </>
        ) : null}
      </CrmModal>
    </>
  )
}
