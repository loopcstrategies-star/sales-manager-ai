import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { crmApi } from '../../api/client'
import ProspectSearchPanel from '../../components/crm/ProspectSearchPanel'

export default function CrmHomePage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [backfillBusy, setBackfillBusy] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [findBusy, setFindBusy] = useState(false)
  const [region, setRegion] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await crmApi.stats()
      setData(res.data)
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load home')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await crmApi.stats()
        if (!cancelled) setData(res.data)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load home')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const runRefresh = async () => {
    setRefreshMsg('')
    try {
      const res = await crmApi.enrichRefresh(50)
      const d = res.data || {}
      if (d.skipped) {
        setRefreshMsg(`Refresh skipped: ${d.reason}`)
      } else {
        setRefreshMsg(`Re-enriched ${d.totalEnriched || 0} records (cap ${d.cap}).`)
      }
    } catch (err) {
      setRefreshMsg(err.message || 'Refresh failed.')
    }
  }

  const runContactsFromAccounts = async () => {
    setBackfillBusy(true)
    setRefreshMsg('')
    try {
      const res = await crmApi.contactsFromAccounts(50)
      const d = res.data || {}
      setRefreshMsg(`Stub contacts from Accounts · created ${d.created || 0}, skipped ${d.skipped || 0}.`)
      await load()
    } catch (err) {
      setRefreshMsg(err.message || 'Contact backfill failed.')
    } finally {
      setBackfillBusy(false)
    }
  }

  const runBulkImport = async () => {
    setBulkBusy(true)
    setRefreshMsg('Importing company Accounts from web… this may take a minute.')
    try {
      const res = await crmApi.prospectBulk({
        asAccount: true,
        asContact: false,
        asLead: false,
        perQuery: 8,
        region: region || undefined,
      })
      const d = res.data || {}
      setRefreshMsg(
        `Web import · Accounts +${d.accountsCreated || 0} (upd ${d.accountsUpdated || 0}) · enriched ${d.enriched || 0} · skipped low-quality ${d.skippedLowQuality || 0} · skipped duplicates ${d.skippedDuplicates || 0} (${d.resultsSeen || 0} seen).`,
      )
      await load()
    } catch (err) {
      setRefreshMsg(err.message || 'Web import failed.')
    } finally {
      setBulkBusy(false)
    }
  }

  const runCleanupNoise = async () => {
    if (!window.confirm(
      'Delete Prospect accounts that look like news/social/article imports (and related Web Search contacts/leads)?',
    )) return
    setCleanupBusy(true)
    setRefreshMsg('')
    try {
      const res = await crmApi.prospectCleanupNoise()
      const d = res.data || {}
      setRefreshMsg(
        `Cleanup · Accounts −${d.accountsDeleted || 0} · Contacts −${d.contactsDeleted || 0} · Leads −${d.leadsDeleted || 0}.`,
      )
      await load()
    } catch (err) {
      setRefreshMsg(err.message || 'Cleanup failed.')
    } finally {
      setCleanupBusy(false)
    }
  }

  const runFindContactsBatch = async () => {
    setFindBusy(true)
    setRefreshMsg('Finding public contacts for Accounts… may take a few minutes.')
    try {
      const res = await crmApi.findContactsBatch({
        cap: 15,
        region: region || undefined,
      })
      const d = res.data || {}
      setRefreshMsg(
        `Find contacts · accounts ${d.accountsProcessed || 0} · contacts +${d.contactsCreated || 0} · skipped ${d.contactsSkipped || 0} · errors ${(d.errors || []).length}. Verify before outreach.`,
      )
      await load()
    } catch (err) {
      setRefreshMsg(err.message || 'Find contacts failed.')
    } finally {
      setFindBusy(false)
    }
  }

  const counts = data?.counts || {}
  const anyBusy = bulkBusy || cleanupBusy || findBusy || backfillBusy

  return (
    <div className="crm-home">
      <header className="crm-home-header">
        <h2>Home</h2>
        <p>Worldwide CRM snapshot — companies, people contacts, deals, and service.</p>
      </header>

      {error ? <p className="crm-banner-error">{error}</p> : null}
      {loading ? <p className="crm-muted">Loading…</p> : null}

      {!loading && !error ? (
        <>
          <div className="crm-stat-grid">
            <div className="crm-stat-card">
              <span className="crm-stat-label">Open Leads</span>
              <strong className="crm-stat-value">{counts.openLeads ?? 0}</strong>
            </div>
            <div className="crm-stat-card">
              <span className="crm-stat-label">Contacts</span>
              <strong className="crm-stat-value">{counts.contacts ?? 0}</strong>
            </div>
            <div className="crm-stat-card">
              <span className="crm-stat-label">Accounts</span>
              <strong className="crm-stat-value">{counts.accounts ?? 0}</strong>
            </div>
            <div className="crm-stat-card">
              <span className="crm-stat-label">Open Deals</span>
              <strong className="crm-stat-value">{counts.openDeals ?? 0}</strong>
            </div>
            <div className="crm-stat-card">
              <span className="crm-stat-label">Open Cases</span>
              <strong className="crm-stat-value">{counts.openCases ?? 0}</strong>
            </div>
          </div>

          <div className="crm-home-actions">
            <button
              type="button"
              className="crm-btn-primary"
              disabled={anyBusy}
              onClick={runBulkImport}
            >
              {bulkBusy ? 'Importing from web…' : 'Import from web'}
            </button>
            <button
              type="button"
              className="crm-btn-primary"
              disabled={anyBusy}
              onClick={runFindContactsBatch}
            >
              {findBusy ? 'Finding contacts…' : 'Find contacts on Accounts'}
            </button>
            <button
              type="button"
              className="crm-btn-secondary"
              disabled={anyBusy}
              onClick={runCleanupNoise}
            >
              {cleanupBusy ? 'Cleaning…' : 'Clean up noise prospects'}
            </button>
            <Link className="crm-btn-secondary" to="/sales/contacts">Import Contacts (CSV)</Link>
            <Link className="crm-btn-secondary" to="/sales/leads">New Lead</Link>
            <Link className="crm-btn-secondary" to="/sales/contacts">New Contact</Link>
            <Link className="crm-btn-secondary" to="/sales/accounts">New Account</Link>
            <Link className="crm-btn-secondary" to="/sales/pipeline">View Pipeline</Link>
            <button type="button" className="crm-btn-secondary" disabled={anyBusy} onClick={runRefresh}>
              Refresh stale records
            </button>
            <button
              type="button"
              className="crm-btn-secondary"
              disabled={anyBusy}
              onClick={runContactsFromAccounts}
            >
              {backfillBusy ? 'Creating…' : 'Create stub contacts'}
            </button>
          </div>
          <p className="crm-muted">
            For real people worldwide: use <strong>Import Contacts (CSV)</strong> for lists you already have,
            or <strong>Find contacts on Accounts</strong> (search + AI from public web — verify emails before outreach).
            Web import adds companies only. Region below applies to Find companies / Import from web / Find contacts.
          </p>
          {refreshMsg ? <p className="crm-muted">{refreshMsg}</p> : null}

          <ProspectSearchPanel
            region={region}
            onRegionChange={setRegion}
            onImported={() => load()}
          />

          <div className="crm-home-columns">
            <section className="crm-home-panel">
              <h3>Recent Contacts</h3>
              {(data?.recentContacts || []).length === 0 ? (
                <p className="crm-muted">No contacts yet.</p>
              ) : (
                <ul className="crm-recent-list">
                  {data.recentContacts.map((c) => (
                    <li key={c._id}>
                      <Link to="/sales/contacts">{c.fullName || 'Contact'}</Link>
                      <span>{c.accountName || c.email || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="crm-home-panel">
              <h3>Recent Accounts</h3>
              {(data?.recentAccounts || []).length === 0 ? (
                <p className="crm-muted">No accounts yet.</p>
              ) : (
                <ul className="crm-recent-list">
                  {data.recentAccounts.map((a) => (
                    <li key={a._id}>
                      <Link to="/sales/accounts">{a.name}</Link>
                      <span>{a.website || a.phone || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  )
}
