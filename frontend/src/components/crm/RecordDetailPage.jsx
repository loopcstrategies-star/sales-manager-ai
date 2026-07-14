import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  accountsApi,
  contactsApi,
  leadsApi,
  opportunitiesApi,
  casesApi,
  crmApi,
} from '../../api/client'
import { usePreferences } from '../../context/PreferencesContext'
import ActivityTimeline from './ActivityTimeline'
import FindContactsButton from './FindContactsButton'

const CONFIG = {
  leads: {
    label: 'Lead',
    listPath: '/sales/leads',
    relatedType: 'Lead',
    load: (id) => leadsApi.get(id),
    title: (d) => [d.firstName, d.lastName].filter(Boolean).join(' ') || d.company,
  },
  accounts: {
    label: 'Account',
    listPath: '/sales/accounts',
    relatedType: 'Account',
    load: (id) => accountsApi.get(id),
    title: (d) => d.name,
  },
  contacts: {
    label: 'Contact',
    listPath: '/sales/contacts',
    relatedType: 'Contact',
    load: (id) => contactsApi.get(id),
    title: (d) => d.fullName || [d.firstName, d.lastName].filter(Boolean).join(' '),
  },
  opportunities: {
    label: 'Opportunity',
    listPath: '/sales/pipeline',
    relatedType: 'Opportunity',
    load: (id) => opportunitiesApi.get(id),
    title: (d) => d.name,
  },
}

export default function RecordDetailPage({ objectType }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { providers } = usePreferences()
  const hunterConfigured = Boolean(providers?.hunter)
  const cfg = CONFIG[objectType]
  const [data, setData] = useState(null)
  const [related, setRelated] = useState({ contacts: [], opportunities: [], cases: [] })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await cfg.load(id)
        if (cancelled) return
        setData(res.data)
        setError('')

        if (objectType === 'accounts' && res.data?._id) {
          const [cRes, oRes, caseRes] = await Promise.all([
            contactsApi.list(''),
            opportunitiesApi.list(''),
            casesApi.list('', 'all').catch(() => ({ data: [] })),
          ])
          const aid = String(res.data._id)
          setRelated({
            contacts: (cRes.data || []).filter((c) => String(c.accountId) === aid).slice(0, 20),
            opportunities: (oRes.data || []).filter((o) => String(o.accountId) === aid).slice(0, 20),
            cases: (caseRes.data || []).filter((c) => String(c.accountId) === aid).slice(0, 20),
          })
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load record')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [cfg, id, objectType])

  if (!cfg) return <p className="crm-banner-error">Unknown record type.</p>
  if (loading) return <p className="crm-muted">Loading…</p>
  if (error) return <p className="crm-banner-error">{error}</p>
  if (!data) return null

  const createOpportunity = async () => {
    if (objectType !== 'accounts') return
    setActionBusy(true)
    setActionMsg('')
    try {
      const close = new Date()
      close.setDate(close.getDate() + 30)
      const res = await opportunitiesApi.create({
        name: `${data.name} — Opportunity`,
        accountId: data._id,
        amount: 0,
        stage: 'Prospecting',
        closeDate: close.toISOString().slice(0, 10),
        description: 'Created from Account.',
      })
      setActionMsg('Opportunity created.')
      navigate(`/sales/pipeline/${res.data._id}`)
    } catch (err) {
      setActionMsg(err.message || 'Could not create opportunity.')
    } finally {
      setActionBusy(false)
    }
  }

  const runHunter = async () => {
    if (objectType !== 'accounts') return
    setActionBusy(true)
    setActionMsg('')
    try {
      const res = await crmApi.hunterContacts({ accountId: data._id })
      const d = res.data || {}
      setActionMsg(`Hunter · contacts +${d.contactsCreated || 0} (skipped ${d.contactsSkipped || 0}).`)
      const cRes = await contactsApi.list('')
      const aid = String(data._id)
      setRelated((prev) => ({
        ...prev,
        contacts: (cRes.data || []).filter((c) => String(c.accountId) === aid).slice(0, 20),
      }))
    } catch (err) {
      setActionMsg(err.message || 'Hunter failed (set HUNTER_API_KEY on Railway).')
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="crm-record-detail">
      <header className="crm-record-header">
        <div>
          <p className="crm-muted">{cfg.label}</p>
          <h2>{cfg.title(data)}</h2>
          {actionMsg ? <p className="crm-muted">{actionMsg}</p> : null}
        </div>
        <div className="crm-record-actions">
          {objectType === 'accounts' ? (
            <>
              <FindContactsButton
                accountId={data._id}
                className="crm-btn-primary"
                onFound={async () => {
                  const [cRes] = await Promise.all([contactsApi.list('')])
                  const aid = String(data._id)
                  setRelated((prev) => ({
                    ...prev,
                    contacts: (cRes.data || []).filter((c) => String(c.accountId) === aid).slice(0, 20),
                  }))
                }}
              />
              {hunterConfigured ? (
                <button type="button" className="crm-btn-secondary" disabled={actionBusy} onClick={runHunter}>
                  {actionBusy ? 'Working…' : 'Hunter emails'}
                </button>
              ) : null}
              <button type="button" className="crm-btn-secondary" disabled={actionBusy} onClick={createOpportunity}>
                New Opportunity
              </button>
            </>
          ) : null}
          <Link className="crm-btn-secondary" to={cfg.listPath}>Back to list</Link>
          <button type="button" className="crm-btn-secondary" onClick={() => navigate(cfg.listPath)}>
            Close
          </button>
        </div>
      </header>

      <div className="crm-record-grid">
        <section className="crm-home-panel">
          <h3>Details</h3>
          <dl className="crm-detail-dl">
            {objectType === 'leads' ? (
              <>
                <div><dt>Company</dt><dd>{data.company || '—'}</dd></div>
                <div><dt>Status</dt><dd>{data.status || '—'}</dd></div>
                <div><dt>Email</dt><dd>{data.email || '—'}</dd></div>
                <div><dt>Phone</dt><dd>{data.phone || '—'}</dd></div>
                <div><dt>Website</dt><dd>{data.website || '—'}</dd></div>
                <div><dt>Industry</dt><dd>{data.industry || '—'}</dd></div>
              </>
            ) : null}
            {objectType === 'accounts' ? (
              <>
                <div><dt>Website</dt><dd>{data.website || '—'}</dd></div>
                <div><dt>Phone</dt><dd>{data.phone || '—'}</dd></div>
                <div><dt>Type</dt><dd>{data.type || '—'}</dd></div>
                <div><dt>Region</dt><dd>{data.region || '—'}</dd></div>
                <div><dt>Country</dt><dd>{data.billingAddress?.country || '—'}</dd></div>
                <div><dt>Billing City</dt><dd>{data.billingAddress?.city || '—'}</dd></div>
              </>
            ) : null}
            {objectType === 'contacts' ? (
              <>
                <div><dt>Account</dt><dd>{data.accountName || '—'}</dd></div>
                <div><dt>Title</dt><dd>{data.title || '—'}</dd></div>
                <div><dt>Email</dt><dd>{data.email || '—'}</dd></div>
                <div><dt>Phone</dt><dd>{data.phone || '—'}</dd></div>
                <div><dt>Country</dt><dd>{data.mailingAddress?.country || '—'}</dd></div>
              </>
            ) : null}
            {objectType === 'opportunities' ? (
              <>
                <div><dt>Account</dt><dd>{data.accountName || '—'}</dd></div>
                <div><dt>Contact</dt><dd>{data.contactName || '—'}</dd></div>
                <div><dt>Amount</dt><dd>${Number(data.amount || 0).toLocaleString()}</dd></div>
                <div><dt>Stage</dt><dd>{data.stage || '—'}</dd></div>
                <div><dt>Close Date</dt><dd>{data.closeDate ? String(data.closeDate).slice(0, 10) : '—'}</dd></div>
              </>
            ) : null}
            <div><dt>Description</dt><dd>{data.description || '—'}</dd></div>
          </dl>

          {objectType === 'opportunities' && (data.products || []).length ? (
            <>
              <h4>Products</h4>
              <ul className="crm-recent-list">
                {data.products.map((p, i) => (
                  <li key={p._id || i}>
                    <span>{p.productName || 'Product'}</span>
                    <span>{p.quantity} × ${Number(p.unitPrice || 0).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <ActivityTimeline relatedType={cfg.relatedType} relatedId={id} />
      </div>

      {objectType === 'accounts' ? (
        <div className="crm-home-columns" style={{ marginTop: '1rem' }}>
          <section className="crm-home-panel">
            <h3>Related Contacts</h3>
            {related.contacts.length === 0 ? <p className="crm-muted">None</p> : (
              <ul className="crm-recent-list">
                {related.contacts.map((c) => (
                  <li key={c._id}>
                    <Link to={`/sales/contacts/${c._id}`}>{c.fullName || c.lastName}</Link>
                    <span>{c.email || c.title || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="crm-home-panel">
            <h3>Related Opportunities</h3>
            {related.opportunities.length === 0 ? <p className="crm-muted">None</p> : (
              <ul className="crm-recent-list">
                {related.opportunities.map((o) => (
                  <li key={o._id}>
                    <Link to={`/sales/pipeline/${o._id}`}>{o.name}</Link>
                    <span>{o.stage} · ${Number(o.amount || 0).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}
