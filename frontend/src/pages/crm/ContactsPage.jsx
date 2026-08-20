import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { accountsApi, contactsApi, crmApi } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { isCreatedThisWeek, isOwnedBy, useServiceListQuery } from '../../hooks/useServiceListQuery'
import CrmListView from '../../components/crm/CrmListView'
import CrmModal from '../../components/crm/CrmModal'
import CrmImportModal from '../../components/crm/CrmImportModal'
import CrmEnrichButton from '../../components/crm/CrmEnrichButton'
import CustomFieldsEditor from '../../components/crm/CustomFieldsEditor'
import LookupField from '../../components/crm/LookupField'
import PhotoUpload from '../../components/crm/PhotoUpload'
import EmailDraftButton from '../../components/crm/EmailDraftButton'
import { getIndustryConfig, listIndustryConfigs } from '../../lib/industryCatalog'

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
  accountId: '',
  accountName: '',
  title: '',
  reportsToId: '',
  reportsToName: '',
  description: '',
  phone: '',
  email: '',
  mailingAddress: emptyAddress(),
  emailOptOut: false,
  photoUrl: '',
  customFields: [],
  needsVerify: false,
  source: 'manual',
  industrySlug: '',
  businessType: '',
})

const SALUTATIONS = ['--None--', 'Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.']
const COUNTRIES = ['--None--', 'United Arab Emirates', 'United States', 'United Kingdom', 'India', 'Other']
const INDUSTRIES = listIndustryConfigs()

export default function ContactsPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [countryFilter, setCountryFilter] = useState('')
  const [needsVerifyOnly, setNeedsVerifyOnly] = useState(searchParams.get('needsVerify') === '1')
  const [sourceFilter, setSourceFilter] = useState(searchParams.get('source') || '')
  const [industryFilter, setIndustryFilter] = useState(searchParams.get('industry') || '')

  const load = useCallback(async (q = '') => {
    setLoading(true)
    setListError('')
    try {
      const res = await contactsApi.list(q, {
        needsVerify: needsVerifyOnly,
        source: sourceFilter || undefined,
        industry: industryFilter || undefined,
      })
      setItems(res.data || [])
    } catch (err) {
      setListError(err.message || 'Failed to load contacts')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [needsVerifyOnly, sourceFilter, industryFilter])

  useEffect(() => {
    const t = setTimeout(() => load(search), 250)
    return () => clearTimeout(t)
  }, [search, load])

  useEffect(() => {
    const next = {}
    if (needsVerifyOnly) next.needsVerify = '1'
    if (sourceFilter) next.source = sourceFilter
    if (industryFilter) next.industry = industryFilter
    setSearchParams(next, { replace: true })
  }, [needsVerifyOnly, sourceFilter, industryFilter, setSearchParams])

  const openNew = useCallback(() => {
    setEditingId(null)
    setForm(emptyForm())
    setErrors({})
    setEnrichedHint('')
    setModalOpen(true)
  }, [])

  const listFilter = useServiceListQuery(openNew)

  const openEdit = (row) => {
    const item = items.find((c) => c._id === row.id) || row.raw
    if (!item) return
    setEditingId(item._id)
    setForm({
      salutation: item.salutation || '',
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      accountId: item.accountId || '',
      accountName: item.accountName || '',
      title: item.title || '',
      reportsToId: item.reportsToId || '',
      reportsToName: item.reportsToName || '',
      description: item.description || '',
      phone: item.phone || '',
      email: item.email || '',
      mailingAddress: { ...emptyAddress(), ...(item.mailingAddress || {}) },
      emailOptOut: Boolean(item.emailOptOut),
      photoUrl: item.photoUrl || '',
      customFields: Array.isArray(item.customFields) ? item.customFields : [],
      needsVerify: Boolean(item.needsVerify),
      source: item.source || 'manual',
      industrySlug: item.industrySlug || '',
      businessType: item.businessType || '',
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
      phone: fields.phone ?? f.phone,
      title: fields.title ?? f.title,
      description: fields.description ?? f.description,
    }))
    if (data?.record?.lastEnrichedAt) {
      setEnrichedHint(`Updated from web · ${new Date(data.record.lastEnrichedAt).toLocaleString()}`)
    }
    if (data?.record?._id) load(search)
  }

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const setAddress = (key, value) => {
    setForm((f) => ({ ...f, mailingAddress: { ...f.mailingAddress, [key]: value } }))
  }

  const validate = () => {
    const next = {}
    if (!String(form.lastName || '').trim()) next.lastName = 'Complete this field.'
    if (!String(form.accountId || '').trim()) next.accountId = 'Complete this field.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const buildPayload = () => ({
    salutation: form.salutation,
    firstName: form.firstName,
    lastName: form.lastName.trim(),
    accountId: form.accountId,
    title: form.title,
    reportsToId: form.reportsToId || '',
    description: form.description,
    phone: form.phone,
    email: form.email,
    mailingAddress: form.mailingAddress,
    emailOptOut: form.emailOptOut,
    photoUrl: form.photoUrl,
    industrySlug: form.industrySlug || '',
    businessType: form.businessType || '',
    customFields: (form.customFields || []).filter((f) => f.label || f.value),
  })

  const save = async (andNew = false) => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = buildPayload()
      if (editingId) await contactsApi.update(editingId, payload)
      else await contactsApi.create(payload)
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

  const searchAccounts = useCallback(async (q) => {
    const res = await accountsApi.list(q)
    return (res.data || []).map((a) => ({ id: a._id, label: a.name }))
  }, [])

  const searchContacts = useCallback(async (q) => {
    const res = await contactsApi.list(q)
    return (res.data || [])
      .filter((c) => c._id !== editingId)
      .map((c) => ({
        id: c._id,
        label: c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' '),
      }))
  }, [editingId])

  const filteredItems = useMemo(() => {
    let list = items
    if (listFilter === 'my') list = list.filter((c) => isOwnedBy(c, user))
    else if (listFilter === 'new-this-week') list = list.filter((c) => isCreatedThisWeek(c))
    else if (listFilter === 'birthdays') list = []
    else if (listFilter && listFilter !== 'all') {
      /* keep full list for other filters */
    }
    if (countryFilter) {
      list = list.filter((c) => String(c.mailingAddress?.country || '') === countryFilter)
    }
    if (industryFilter) {
      list = list.filter((c) => String(c.industrySlug || '') === industryFilter)
    }
    return list
  }, [items, listFilter, user, countryFilter, industryFilter])

  const countryOptions = useMemo(() => {
    const set = new Set(
      items.map((c) => String(c.mailingAddress?.country || '').trim()).filter(Boolean),
    )
    COUNTRIES.filter((c) => c !== '--None--').forEach((c) => set.add(c))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [items])

  const rows = filteredItems.map((c) => ({
    id: c._id,
    raw: c,
    name: (
      <Link to={`/sales/contacts/${c._id}`} onClick={(e) => e.stopPropagation()}>
        {c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
        {c.source && c.source !== 'manual' ? (
          <span className="crm-source-badge">{c.source === 'web_llm' ? 'AI' : c.source}</span>
        ) : null}
        {c.needsVerify ? <span className="crm-source-badge verify">verify</span> : null}
      </Link>
    ),
    accountName: c.accountName || '—',
    industry: c.industrySlug || '—',
    country: c.mailingAddress?.country || '—',
    title: c.title || '—',
    phone: c.phone || '—',
    email: c.email || '—',
    ownerAlias: c.ownerAlias || '—',
  }))

  const deleteSelected = async () => {
    if (!selectedIds.length) return
    if (!window.confirm(`Delete ${selectedIds.length} contact(s)?`)) return
    await Promise.all(selectedIds.map((id) => contactsApi.remove(id).catch(() => null)))
    setSelectedIds([])
    await load(search)
  }

  const markSelectedVerified = async () => {
    if (!selectedIds.length) return
    try {
      await crmApi.markVerified(selectedIds)
      setSelectedIds([])
      await load(search)
    } catch (err) {
      setListError(err.message || 'Could not mark verified')
    }
  }

  const markAllVerifyQueue = async () => {
    if (!needsVerifyOnly) return
    if (!window.confirm(`Mark all ${filteredItems.length} listed contacts as verified?`)) return
    try {
      await crmApi.markVerified(filteredItems.map((c) => c._id))
      setSelectedIds([])
      await load(search)
    } catch (err) {
      setListError(err.message || 'Could not mark verified')
    }
  }

  return (
    <>
      {listError ? <p className="crm-banner-error">{listError}</p> : null}
      <CrmListView
        title="All Contacts"
        count={rows.length}
        sortLabel="Name"
        search={search}
        onSearchChange={setSearch}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={(
          <>
            <button type="button" className="crm-btn-secondary" onClick={markSelectedVerified}>
              Mark verified
            </button>
            <button type="button" className="crm-btn-secondary" onClick={deleteSelected}>Delete</button>
          </>
        )}
        actions={(
          <>
            <label className="crm-inline-filter">
              <span>Industry</span>
              <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}>
                <option value="">All</option>
                {INDUSTRIES.map((industry) => (
                  <option key={industry.slug} value={industry.slug}>{industry.name}</option>
                ))}
              </select>
            </label>
            <label className="crm-inline-filter">
              <span>Source</span>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="">All</option>
                <option value="manual">manual</option>
                <option value="csv">csv</option>
                <option value="web_llm">AI / web</option>
                <option value="hunter">hunter</option>
              </select>
            </label>
            <label className="crm-inline-filter">
              <span>Country</span>
              <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
                <option value="">All</option>
                {countryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="crm-inline-filter">
              <input
                type="checkbox"
                checked={needsVerifyOnly}
                onChange={(e) => setNeedsVerifyOnly(e.target.checked)}
              />
              Needs verify
            </label>
            {needsVerifyOnly ? (
              <button type="button" className="crm-btn-secondary" onClick={markAllVerifyQueue}>
                Mark all verified
              </button>
            ) : null}
            <button type="button" className="crm-btn-secondary" onClick={() => setImportOpen(true)}>Import</button>
            <button type="button" className="crm-btn-primary" onClick={openNew}>New</button>
          </>
        )}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'accountName', label: 'Account Name' },
          { key: 'industry', label: 'Industry' },
          { key: 'country', label: 'Country' },
          { key: 'title', label: 'Title' },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'ownerAlias', label: 'Contact Owner Alias' },
        ]}
        rows={rows}
        loading={loading}
        onRowClick={openEdit}
        emptyTitle="Top sellers add their contacts first."
        emptyDescription="It's the fastest way to win more deals."
        emptyActionLabel="Add a Contact"
        onEmptyAction={openNew}
      />

      <CrmModal
        title={editingId ? 'Edit Contact' : 'New Contact'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            <div className="crm-footer-start">
              <CrmEnrichButton
                objectType="contacts"
                id={editingId}
                draft={form}
                onEnriched={applyEnrichment}
              />
              {editingId ? (
                <EmailDraftButton objectType="contacts" id={editingId} hasEmail={Boolean(form.email)} />
              ) : null}
              {editingId && form.needsVerify === true ? (
                <button
                  type="button"
                  className="crm-btn-secondary"
                  onClick={async () => {
                    await contactsApi.update(editingId, { ...buildPayload(), needsVerify: false })
                    setEnrichedHint('Marked verified.')
                    await load(search)
                    setForm((f) => ({ ...f, needsVerify: false }))
                  }}
                >
                  Mark verified
                </button>
              ) : null}
              {enrichedHint ? <span className="crm-enrich-hint">{enrichedHint}</span> : null}
              {editingId ? (
                <button
                  type="button"
                  className="crm-btn-secondary"
                  onClick={async () => {
                    if (!window.confirm('Delete this contact?')) return
                    await contactsApi.remove(editingId)
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

        <PhotoUpload value={form.photoUrl} onChange={(photoUrl) => setField('photoUrl', photoUrl)} />

        <div className="crm-section-bar">About</div>
        <label className="crm-field">
          <span>Salutation</span>
          <select
            value={form.salutation || '--None--'}
            onChange={(e) => setField('salutation', e.target.value === '--None--' ? '' : e.target.value)}
          >
            {SALUTATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="crm-field">
          <span>First Name</span>
          <input
            placeholder="First Name"
            value={form.firstName}
            onChange={(e) => setField('firstName', e.target.value)}
          />
        </label>
        <label className={`crm-field${errors.lastName ? ' has-error' : ''}`}>
          <span>* Last Name</span>
          <input value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} />
          {errors.lastName ? <span className="crm-field-error">{errors.lastName}</span> : null}
        </label>
        <LookupField
          label="Account Name"
          required
          valueId={form.accountId}
          valueLabel={form.accountName}
          placeholder="Search Accounts..."
          error={errors.accountId}
          onSearch={searchAccounts}
          onSelect={(opt) => {
            setField('accountId', opt.id)
            setField('accountName', opt.label)
            setErrors((e) => ({ ...e, accountId: undefined }))
          }}
          onClear={() => {
            setField('accountId', '')
            setField('accountName', '')
          }}
        />
        <label className="crm-field">
          <span>Title</span>
          <input value={form.title} onChange={(e) => setField('title', e.target.value)} />
        </label>
        <LookupField
          label="Reports To"
          valueId={form.reportsToId}
          valueLabel={form.reportsToName}
          placeholder="Search Contacts..."
          onSearch={searchContacts}
          onSelect={(opt) => {
            setField('reportsToId', opt.id)
            setField('reportsToName', opt.label)
          }}
          onClear={() => {
            setField('reportsToId', '')
            setField('reportsToName', '')
          }}
        />
        <label className="crm-field">
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
        </label>
        <div className="crm-owner-field">
          <span>Contact Owner</span>
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
        <p className="crm-subsection">Mailing Address</p>
        <label className="crm-field">
          <span>Mailing Country</span>
          <select
            value={form.mailingAddress.country || '--None--'}
            onChange={(e) => setAddress('country', e.target.value === '--None--' ? '' : e.target.value)}
          >
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="crm-field">
          <span>Mailing Street</span>
          <textarea rows={2} value={form.mailingAddress.street} onChange={(e) => setAddress('street', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Mailing City</span>
          <input value={form.mailingAddress.city} onChange={(e) => setAddress('city', e.target.value)} />
        </label>
        <div className="crm-field-row">
          <label className="crm-field">
            <span>Mailing Zip/Postal Code</span>
            <input value={form.mailingAddress.zip} onChange={(e) => setAddress('zip', e.target.value)} />
          </label>
          <label className="crm-field">
            <span>Mailing State/Province</span>
            <input value={form.mailingAddress.state} onChange={(e) => setAddress('state', e.target.value)} />
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

        <CustomFieldsEditor
          fields={form.customFields}
          onChange={(customFields) => setField('customFields', customFields)}
        />
      </CrmModal>

      <CrmImportModal
        objectType="contacts"
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => load(search)}
      />
    </>
  )
}
