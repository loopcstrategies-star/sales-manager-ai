import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { knowledgeApi } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useServiceListQuery } from '../../hooks/useServiceListQuery'
import CrmListView from '../../components/crm/CrmListView'
import CrmModal from '../../components/crm/CrmModal'

const emptyForm = () => ({
  title: '',
  urlName: '',
  body: '',
  visibleInternal: true,
  visibleCustomer: false,
  publicationStatus: 'Draft',
})

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString()
}

export default function KnowledgePage() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [meta, setMeta] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [listError, setListError] = useState('')
  const [urlTouched, setUrlTouched] = useState(false)

  const load = useCallback(async (q = '') => {
    setLoading(true)
    setListError('')
    try {
      const res = await knowledgeApi.list(q)
      setItems(res.data || [])
    } catch (err) {
      setListError(err.message || 'Failed to load knowledge articles')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 250)
    return () => clearTimeout(t)
  }, [search, load])

  const openNew = useCallback(() => {
    setEditingId(null)
    setForm(emptyForm())
    setMeta(null)
    setUrlTouched(false)
    setErrors({})
    setModalOpen(true)
  }, [])

  const listFilter = useServiceListQuery(openNew)

  const openEdit = (row) => {
    const item = items.find((a) => a._id === row.id) || row.raw
    if (!item) return
    setEditingId(item._id)
    setForm({
      title: item.title || '',
      urlName: item.urlName || '',
      body: item.body || '',
      visibleInternal: item.visibleInternal !== false,
      visibleCustomer: Boolean(item.visibleCustomer),
      publicationStatus: item.publicationStatus || 'Draft',
    })
    setMeta({
      createdAt: item.createdAt,
      publishedAt: item.publishedAt,
      updatedAt: item.updatedAt,
      ownerName: item.ownerName || user?.name,
      articleNumber: item.articleNumber,
    })
    setUrlTouched(true)
    setErrors({})
    setModalOpen(true)
  }

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const onTitleChange = (value) => {
    setForm((f) => ({
      ...f,
      title: value,
      urlName: urlTouched ? f.urlName : slugify(value),
    }))
  }

  const validate = () => {
    const next = {}
    if (!String(form.title || '').trim()) next.title = 'Complete this field.'
    if (!String(form.urlName || '').trim()) next.urlName = 'Complete this field.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async (andNew = false) => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        urlName: form.urlName.trim(),
        body: form.body,
        visibleInternal: Boolean(form.visibleInternal),
        visibleCustomer: Boolean(form.visibleCustomer),
        publicationStatus: form.publicationStatus,
      }
      if (editingId) await knowledgeApi.update(editingId, payload)
      else await knowledgeApi.create(payload)
      await load(search)
      if (andNew) {
        setEditingId(null)
        setForm(emptyForm())
        setMeta(null)
        setUrlTouched(false)
        setErrors({})
      } else setModalOpen(false)
    } catch (err) {
      setErrors({ form: err.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const filteredItems = useMemo(() => {
    if (!listFilter) return items
    if (listFilter === 'published') return items.filter((a) => a.publicationStatus === 'Published')
    if (listFilter === 'draft') return items.filter((a) => a.publicationStatus === 'Draft')
    if (listFilter === 'archived') return []
    return items
  }, [items, listFilter])

  const rows = filteredItems.map((a) => ({
    id: a._id,
    raw: a,
    title: a.title || '—',
    summary: a.summary || '—',
    articleNumber: a.articleNumber || '—',
    publishedDate: formatDate(a.publishedAt),
    publicationStatus: a.publicationStatus || '—',
    validationStatus: a.validationStatus || '—',
  }))

  return (
    <>
      {listError ? <p className="crm-banner-error">{listError}</p> : null}
      <CrmListView
        title="Recently Viewed"
        count={rows.length}
        sortLabel="Updated a few seconds ago"
        search={search}
        onSearchChange={setSearch}
        actions={(
          <>
            <button type="button" className="crm-btn-primary" onClick={openNew}>New</button>
            <button type="button" className="crm-btn-secondary" disabled title="Coming soon">Publish</button>
            <button type="button" className="crm-btn-secondary" disabled title="Coming soon">Assign</button>
            <button type="button" className="crm-btn-secondary" disabled title="Coming soon">Archive</button>
          </>
        )}
        columns={[
          { key: 'title', label: 'Article Title' },
          { key: 'summary', label: 'Summary' },
          { key: 'articleNumber', label: 'Article Number' },
          { key: 'publishedDate', label: 'Published Date' },
          { key: 'publicationStatus', label: 'Publication Status' },
          { key: 'validationStatus', label: 'Validation Status' },
        ]}
        rows={rows}
        loading={loading}
        onRowClick={openEdit}
        emptyTitle="Solve issues faster with Knowledge"
        emptyDescription="Find or create articles with answers to frequent questions, service procedures, how-to's, FAQs, and more. Give people the information they need across channels."
        emptyActionLabel="Add an Article"
        onEmptyAction={openNew}
      />

      <CrmModal
        title={editingId ? 'Edit Knowledge' : 'New Knowledge'}
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
        <label className={`crm-field${errors.title ? ' has-error' : ''}`}>
          <span>* Title</span>
          <input value={form.title} onChange={(e) => onTitleChange(e.target.value)} />
          {errors.title ? <span className="crm-field-error">{errors.title}</span> : null}
        </label>
        <label className={`crm-field${errors.urlName ? ' has-error' : ''}`}>
          <span>* URL Name</span>
          <input
            value={form.urlName}
            onChange={(e) => {
              setUrlTouched(true)
              setField('urlName', e.target.value)
            }}
          />
          {errors.urlName ? <span className="crm-field-error">{errors.urlName}</span> : null}
        </label>

        <div className="crm-section-bar">Article Body</div>
        <label className="crm-field">
          <span>Body</span>
          <textarea rows={8} value={form.body} onChange={(e) => setField('body', e.target.value)} />
        </label>

        <div className="crm-section-bar">Visibility</div>
        <div className="crm-field-row">
          <label className="crm-checkbox">
            <input
              type="checkbox"
              checked={form.visibleInternal}
              onChange={(e) => setField('visibleInternal', e.target.checked)}
            />
            Visible In Internal App
          </label>
          <label className="crm-checkbox">
            <input
              type="checkbox"
              checked={form.visibleCustomer}
              onChange={(e) => setField('visibleCustomer', e.target.checked)}
            />
            Visible to Customer
          </label>
        </div>

        <div className="crm-section-bar">Details</div>
        <div className="crm-field-row">
          <div className="crm-readonly-field">
            <span>Article Created Date</span>
            <p>{meta?.createdAt ? formatDate(meta.createdAt) : '—'}</p>
          </div>
          <div className="crm-readonly-field">
            <span>Created By</span>
            <p>{meta?.ownerName || user?.name || '—'}</p>
          </div>
        </div>
        <div className="crm-field-row">
          <div className="crm-readonly-field">
            <span>Article Total View Count</span>
            <p>0</p>
          </div>
          <div className="crm-readonly-field">
            <span>Last Modified By</span>
            <p>{meta?.ownerName || user?.name || '—'}</p>
          </div>
        </div>
      </CrmModal>
    </>
  )
}
