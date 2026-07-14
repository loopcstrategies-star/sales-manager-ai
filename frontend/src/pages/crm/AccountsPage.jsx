import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { accountsApi, crmApi } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { usePreferences } from '../../context/PreferencesContext'
import { isCreatedThisWeek, isOwnedBy, useServiceListQuery } from '../../hooks/useServiceListQuery'
import CrmListView from '../../components/crm/CrmListView'
import CrmModal from '../../components/crm/CrmModal'
import CrmImportModal from '../../components/crm/CrmImportModal'
import CrmEnrichButton from '../../components/crm/CrmEnrichButton'
import FindContactsButton from '../../components/crm/FindContactsButton'
import CustomFieldsEditor from '../../components/crm/CustomFieldsEditor'
import LookupField from '../../components/crm/LookupField'

const emptyAddress = () => ({
  country: '',
  street: '',
  city: '',
  zip: '',
  state: '',
})

const emptyForm = () => ({
  name: '',
  website: '',
  type: '',
  description: '',
  parentAccountId: '',
  parentAccountName: '',
  phone: '',
  label: '',
  region: '',
  billingAddress: emptyAddress(),
  shippingAddress: emptyAddress(),
  customFields: [],
})

const ACCOUNT_TYPES = ['--None--', 'Customer', 'Partner', 'Prospect', 'Other']
const ACCOUNT_LABELS = ['Hot', 'Warm', 'Cold', 'VIP', 'Partner', 'Prospect']
const REGIONS = ['', 'Middle East', 'Europe', 'India', 'Asia Pacific', 'Americas', 'Africa']
const COUNTRIES = [
  '--None--',
  'United Arab Emirates',
  'Saudi Arabia',
  'India',
  'United States',
  'United Kingdom',
  'Italy',
  'Germany',
  'France',
  'Belgium',
  'China',
  'Hong Kong',
  'Singapore',
  'Turkey',
  'Other',
]

function AddressFields({ prefix, value, onChange }) {
  const set = (key, v) => onChange({ ...value, [key]: v })
  return (
    <div className="crm-address-block">
      <label className="crm-field">
        <span>{prefix} Country</span>
        <select value={value.country || '--None--'} onChange={(e) => set('country', e.target.value === '--None--' ? '' : e.target.value)}>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="crm-field">
        <span>{prefix} Street</span>
        <textarea rows={2} value={value.street} onChange={(e) => set('street', e.target.value)} />
      </label>
      <label className="crm-field">
        <span>{prefix} City</span>
        <input value={value.city} onChange={(e) => set('city', e.target.value)} />
      </label>
      <div className="crm-field-row">
        <label className="crm-field">
          <span>{prefix} Zip/Postal Code</span>
          <input value={value.zip} onChange={(e) => set('zip', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>{prefix} State/Province</span>
          <input value={value.state} onChange={(e) => set('state', e.target.value)} />
        </label>
      </div>
    </div>
  )
}

export default function AccountsPage() {
  const { user } = useAuth()
  const { sales } = usePreferences()
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
  const [regionFilter, setRegionFilter] = useState(searchParams.get('region') || '')
  const [countryFilter, setCountryFilter] = useState(searchParams.get('country') || '')
  const [labelFilter, setLabelFilter] = useState(searchParams.get('label') || '')
  const [labelModalOpen, setLabelModalOpen] = useState(false)
  const [bulkLabel, setBulkLabel] = useState('Hot')
  const [labelBusy, setLabelBusy] = useState(false)
  const [findBusy, setFindBusy] = useState(false)
  const [findHint, setFindHint] = useState('')

  const load = useCallback(async (q = '') => {
    setLoading(true)
    setListError('')
    try {
      const res = await accountsApi.list(q)
      setItems(res.data || [])
    } catch (err) {
      setListError(err.message || 'Failed to load accounts')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 250)
    return () => clearTimeout(t)
  }, [search, load])

  useEffect(() => {
    const next = {}
    if (regionFilter) next.region = regionFilter
    if (countryFilter) next.country = countryFilter
    if (labelFilter) next.label = labelFilter
    setSearchParams(next, { replace: true })
  }, [regionFilter, countryFilter, labelFilter, setSearchParams])

  const openNew = useCallback(() => {
    setEditingId(null)
    setForm(emptyForm())
    setErrors({})
    setEnrichedHint('')
    setModalOpen(true)
  }, [])

  const listFilter = useServiceListQuery(openNew)

  const openEdit = (row) => {
    const item = items.find((a) => a._id === row.id) || row.raw
    if (!item) return
    setEditingId(item._id)
    setForm({
      name: item.name || '',
      website: item.website || '',
      type: item.type || '',
      description: item.description || '',
      parentAccountId: item.parentAccountId || '',
      parentAccountName: item.parentAccountName || '',
      phone: item.phone || '',
      label: item.label || '',
      region: item.region || '',
      billingAddress: { ...emptyAddress(), ...(item.billingAddress || {}) },
      shippingAddress: { ...emptyAddress(), ...(item.shippingAddress || {}) },
      customFields: Array.isArray(item.customFields) ? item.customFields : [],
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
      description: fields.description ?? f.description,
      type: fields.type ?? f.type,
      region: fields.region ?? f.region,
      billingAddress: {
        ...f.billingAddress,
        city: fields.billingAddress?.city ?? fields.city ?? f.billingAddress.city,
        country: fields.billingAddress?.country ?? fields.country ?? f.billingAddress.country,
      },
    }))
    if (data?.record?.lastEnrichedAt) {
      setEnrichedHint(`Updated from web · ${new Date(data.record.lastEnrichedAt).toLocaleString()}`)
    }
    if (data?.record?._id) load(search)
  }

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const validate = () => {
    const next = {}
    if (!String(form.name || '').trim()) next.name = 'Complete this field.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const buildPayload = () => ({
    name: form.name.trim(),
    website: form.website,
    type: form.type,
    description: form.description,
    parentAccountId: form.parentAccountId || '',
    phone: form.phone,
    label: form.label || '',
    region: form.region || '',
    billingAddress: form.billingAddress,
    shippingAddress: form.shippingAddress,
    customFields: (form.customFields || []).filter((f) => f.label || f.value),
  })

  const save = async (andNew = false) => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = buildPayload()
      if (editingId) await accountsApi.update(editingId, payload)
      else await accountsApi.create(payload)
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

  const searchParents = useCallback(async (q) => {
    const res = await accountsApi.list(q)
    return (res.data || [])
      .filter((a) => a._id !== editingId)
      .map((a) => ({ id: a._id, label: a.name }))
  }, [editingId])

  const filteredItems = useMemo(() => {
    let list = items
    if (listFilter === 'my') list = list.filter((a) => isOwnedBy(a, user))
    else if (listFilter === 'new-this-week') list = list.filter((a) => isCreatedThisWeek(a))
    if (regionFilter) {
      list = list.filter((a) => String(a.region || '') === regionFilter)
    }
    if (countryFilter) {
      list = list.filter((a) => String(a.billingAddress?.country || '') === countryFilter)
    }
    if (labelFilter) {
      list = list.filter((a) => String(a.label || '') === labelFilter)
    }
    return list
  }, [items, listFilter, user, regionFilter, countryFilter, labelFilter])

  const countryOptions = useMemo(() => {
    const set = new Set(
      items.map((a) => String(a.billingAddress?.country || '').trim()).filter(Boolean),
    )
    COUNTRIES.filter((c) => c !== '--None--').forEach((c) => set.add(c))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [items])

  const rows = filteredItems.map((a) => ({
    id: a._id,
    raw: a,
    name: (
      <Link to={`/sales/accounts/${a._id}`} onClick={(e) => e.stopPropagation()}>
        {a.name}
        {a.label ? <span className="crm-source-badge">{a.label}</span> : null}
      </Link>
    ),
    label: a.label || '—',
    region: a.region || '—',
    country: a.billingAddress?.country || '—',
    phone: a.phone || '—',
    website: a.website || '—',
    billingCity: a.billingAddress?.city || '—',
    ownerAlias: a.ownerAlias || '—',
  }))

  const deleteSelected = async () => {
    if (!selectedIds.length) return
    if (!window.confirm(`Delete ${selectedIds.length} account(s)?`)) return
    await Promise.all(selectedIds.map((id) => accountsApi.remove(id).catch(() => null)))
    setSelectedIds([])
    await load(search)
  }

  const assignLabels = async () => {
    if (!selectedIds.length) return
    setLabelBusy(true)
    try {
      await accountsApi.bulkLabel(selectedIds, bulkLabel)
      setLabelModalOpen(false)
      setSelectedIds([])
      await load(search)
    } catch (err) {
      setListError(err.message || 'Label assign failed')
    } finally {
      setLabelBusy(false)
    }
  }

  const findContactsSelected = async () => {
    if (!selectedIds.length) return
    setFindBusy(true)
    setFindHint('')
    setListError('')
    try {
      const res = await crmApi.findContactsBatch({
        accountIds: selectedIds,
        thinOnly: false,
        cap: Math.min(selectedIds.length, sales?.batchFindCap || 25),
        region: sales?.defaultProspectRegion || undefined,
      })
      const d = res.data || {}
      setFindHint(
        `Find contacts · processed ${d.accountsProcessed || 0} · +${d.contactsCreated || 0} contacts · skipped ${d.contactsSkipped || 0} · errors ${(d.errors || []).length}.`,
      )
      setSelectedIds([])
      await load(search)
    } catch (err) {
      setListError(err.message || 'Find contacts failed')
    } finally {
      setFindBusy(false)
    }
  }

  const labelOptions = useMemo(() => {
    const set = new Set(ACCOUNT_LABELS)
    items.forEach((a) => {
      const l = String(a.label || '').trim()
      if (l) set.add(l)
    })
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [items])

  return (
    <>
      {listError ? <p className="crm-banner-error">{listError}</p> : null}
      {findHint ? <p className="crm-muted">{findHint}</p> : null}
      <CrmListView
        title="All Accounts"
        count={rows.length}
        sortLabel="Account Name"
        search={search}
        onSearchChange={setSearch}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={(
          <>
            <button
              type="button"
              className="crm-btn-secondary"
              disabled={findBusy || !selectedIds.length}
              onClick={findContactsSelected}
            >
              {findBusy ? 'Finding contacts…' : 'Find contacts'}
            </button>
            <button
              type="button"
              className="crm-btn-secondary"
              onClick={() => {
                setBulkLabel('Hot')
                setLabelModalOpen(true)
              }}
            >
              Assign Label
            </button>
            <button type="button" className="crm-btn-secondary" onClick={deleteSelected}>Delete</button>
          </>
        )}
        actions={(
          <>
            <label className="crm-inline-filter">
              <span>Label</span>
              <select value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)}>
                <option value="">All</option>
                {labelOptions.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="crm-inline-filter">
              <span>Region</span>
              <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
                <option value="">All</option>
                {REGIONS.filter(Boolean).map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
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
            <button type="button" className="crm-btn-primary" onClick={openNew}>New</button>
            <button type="button" className="crm-btn-secondary" onClick={() => setImportOpen(true)}>Import</button>
          </>
        )}
        columns={[
          { key: 'name', label: 'Account Name' },
          { key: 'label', label: 'Label' },
          { key: 'region', label: 'Region' },
          { key: 'country', label: 'Country' },
          { key: 'phone', label: 'Phone' },
          { key: 'website', label: 'Website' },
          { key: 'billingCity', label: 'Billing City' },
          { key: 'ownerAlias', label: 'Account Owner Alias' },
        ]}
        rows={rows}
        loading={loading}
        onRowClick={openEdit}
        emptyTitle="Accounts show where your contacts work."
        emptyDescription="Improve your reporting and deal tracking with accounts."
        emptyActionLabel="Add an Account"
        onEmptyAction={openNew}
      />

      <CrmModal
        title={editingId ? 'Edit Account' : 'New Account'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            <div className="crm-footer-start">
              <CrmEnrichButton
                objectType="accounts"
                id={editingId}
                draft={form}
                onEnriched={applyEnrichment}
              />
              {editingId ? (
                <FindContactsButton
                  accountId={editingId}
                  onFound={() => setEnrichedHint('Contacts saved — open the Account to review.')}
                />
              ) : null}
              {enrichedHint ? <span className="crm-enrich-hint">{enrichedHint}</span> : null}
              {editingId ? (
                <button
                  type="button"
                  className="crm-btn-secondary"
                  onClick={async () => {
                    if (!window.confirm('Delete this account?')) return
                    await accountsApi.remove(editingId)
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
        <label className={`crm-field${errors.name ? ' has-error' : ''}`}>
          <span>* Account Name</span>
          <input value={form.name} onChange={(e) => setField('name', e.target.value)} />
          {errors.name ? <span className="crm-field-error">{errors.name}</span> : null}
        </label>
        <label className="crm-field">
          <span>Website</span>
          <input value={form.website} onChange={(e) => setField('website', e.target.value)} />
        </label>
        <label className="crm-field">
          <span>Type</span>
          <select
            value={form.type || '--None--'}
            onChange={(e) => setField('type', e.target.value === '--None--' ? '' : e.target.value)}
          >
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="crm-field">
          <span>Label</span>
          <input
            list="account-label-options"
            value={form.label}
            onChange={(e) => setField('label', e.target.value)}
            placeholder="Hot, VIP, Partner…"
          />
          <datalist id="account-label-options">
            {ACCOUNT_LABELS.map((l) => <option key={l} value={l} />)}
          </datalist>
        </label>
        <label className="crm-field">
          <span>Region</span>
          <select
            value={form.region || ''}
            onChange={(e) => setField('region', e.target.value)}
          >
            <option value="">Worldwide / Unknown</option>
            {REGIONS.filter(Boolean).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="crm-field">
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
        </label>
        <LookupField
          label="Parent Account"
          valueId={form.parentAccountId}
          valueLabel={form.parentAccountName}
          placeholder="Search Accounts..."
          onSearch={searchParents}
          onSelect={(opt) => {
            setField('parentAccountId', opt.id)
            setField('parentAccountName', opt.label)
          }}
          onClear={() => {
            setField('parentAccountId', '')
            setField('parentAccountName', '')
          }}
        />
        <div className="crm-owner-field">
          <span>Account Owner</span>
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
        <p className="crm-subsection">Billing Address</p>
        <AddressFields
          prefix="Billing"
          value={form.billingAddress}
          onChange={(billingAddress) => setField('billingAddress', billingAddress)}
        />
        <p className="crm-subsection">Shipping Address</p>
        <AddressFields
          prefix="Shipping"
          value={form.shippingAddress}
          onChange={(shippingAddress) => setField('shippingAddress', shippingAddress)}
        />

        <CustomFieldsEditor
          fields={form.customFields}
          onChange={(customFields) => setField('customFields', customFields)}
        />
      </CrmModal>

      <CrmImportModal
        objectType="accounts"
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => load(search)}
      />

      <CrmModal
        title="Assign Label"
        open={labelModalOpen}
        onClose={() => setLabelModalOpen(false)}
        requiredLegend={false}
        footer={(
          <>
            <button type="button" className="crm-btn-secondary" onClick={() => setLabelModalOpen(false)}>Cancel</button>
            <button type="button" className="crm-btn-primary" disabled={labelBusy || !selectedIds.length} onClick={assignLabels}>
              {labelBusy ? 'Saving…' : `Apply to ${selectedIds.length}`}
            </button>
          </>
        )}
      >
        <p className="crm-muted">Set a segment label on {selectedIds.length} selected account(s).</p>
        <label className="crm-field">
          <span>Label</span>
          <input
            list="bulk-account-label-options"
            value={bulkLabel}
            onChange={(e) => setBulkLabel(e.target.value)}
            placeholder="Hot, VIP…"
          />
          <datalist id="bulk-account-label-options">
            {ACCOUNT_LABELS.map((l) => <option key={l} value={l} />)}
          </datalist>
        </label>
      </CrmModal>
    </>
  )
}
