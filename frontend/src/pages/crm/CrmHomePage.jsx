import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { crmApi } from '../../api/client'
import ProspectSearchPanel from '../../components/crm/ProspectSearchPanel'
import { usePreferences } from '../../context/PreferencesContext'

export default function CrmHomePage() {
  const { sales } = usePreferences()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [backfillBusy, setBackfillBusy] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [findBusy, setFindBusy] = useState(false)
  const [geoBusy, setGeoBusy] = useState(false)
  const [fillBusy, setFillBusy] = useState(false)
  const [region, setRegion] = useState('')

  useEffect(() => {
    if (sales?.defaultProspectRegion && !region) {
      setRegion(sales.defaultProspectRegion)
    }
  }, [sales?.defaultProspectRegion, region])

  const effectiveRegion = region || sales?.defaultProspectRegion || undefined

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
        perQuery: sales?.perQuery || 8,
        queryLimit: sales?.bulkQueries || 5,
        region: effectiveRegion,
      })
      const d = res.data || {}
      let msg = `Web import · Accounts +${d.accountsCreated || 0} (upd ${d.accountsUpdated || 0}) · enriched ${d.enriched || 0} · skipped low-quality ${d.skippedLowQuality || 0} · skipped duplicates ${d.skippedDuplicates || 0} (${d.resultsSeen || 0} seen).`
      if (sales?.fillPipelineOnImport !== false) {
        setRefreshMsg(`${msg} Finding contacts on thin Accounts…`)
        const findRes = await crmApi.findContactsBatch({
          cap: sales?.batchFindCap || 25,
          thinOnly: true,
          region: effectiveRegion,
        })
        const f = findRes.data || {}
        msg += ` → Find · accounts ${f.accountsProcessed || 0} · contacts +${f.contactsCreated || 0}.`
      }
      setRefreshMsg(msg)
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
    setRefreshMsg('Finding contacts on thin Accounts (website pages + search)… may take a few minutes.')
    try {
      const res = await crmApi.findContactsBatch({
        cap: sales?.batchFindCap || 25,
        thinOnly: true,
        region: effectiveRegion,
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

  const runBackfillGeo = async () => {
    setGeoBusy(true)
    setRefreshMsg('Filling missing Region/Country from websites…')
    try {
      const res = await crmApi.backfillGeo({ region: effectiveRegion })
      const d = res.data || {}
      setRefreshMsg(
        `Geo backfill · Accounts updated ${d.accountsUpdated || 0} · Contacts updated ${d.contactsUpdated || 0}.`,
      )
      await load()
    } catch (err) {
      setRefreshMsg(err.message || 'Geo backfill failed.')
    } finally {
      setGeoBusy(false)
    }
  }

  const runFillPipeline = async () => {
    setFillBusy(true)
    setRefreshMsg('Fill pipeline · 1/3 Importing Accounts from web…')
    try {
      const importRes = await crmApi.prospectBulk({
        asAccount: true,
        asContact: false,
        asLead: false,
        perQuery: sales?.perQuery || 8,
        queryLimit: sales?.bulkQueries || 5,
        region: effectiveRegion,
      })
      const imp = importRes.data || {}
      setRefreshMsg(`Fill pipeline · 2/3 Geo… (Accounts +${imp.accountsCreated || 0})`)
      const geoRes = await crmApi.backfillGeo({ region: effectiveRegion })
      const geo = geoRes.data || {}
      setRefreshMsg(`Fill pipeline · 3/3 Finding contacts… (geo ${geo.accountsUpdated || 0})`)
      const findRes = await crmApi.findContactsBatch({
        cap: sales?.batchFindCap || 25,
        thinOnly: true,
        region: effectiveRegion,
      })
      const find = findRes.data || {}
      setRefreshMsg(
        `Fill pipeline done · Accounts +${imp.accountsCreated || 0} · geo ${geo.accountsUpdated || 0} · find accounts ${find.accountsProcessed || 0} · contacts +${find.contactsCreated || 0} · review Needs verify.`,
      )
      await load()
    } catch (err) {
      setRefreshMsg(err.message || 'Fill pipeline failed.')
    } finally {
      setFillBusy(false)
    }
  }

  const counts = data?.counts || {}
  const anyBusy = bulkBusy || cleanupBusy || findBusy || backfillBusy || geoBusy || fillBusy

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
            <div className="crm-stat-card">
              <span className="crm-stat-label">Needs verify</span>
              <strong className="crm-stat-value">{counts.needsVerify ?? 0}</strong>
            </div>
            <div className="crm-stat-card">
              <span className="crm-stat-label">Missing email</span>
              <strong className="crm-stat-value">{counts.missingEmail ?? 0}</strong>
            </div>
            <div className="crm-stat-card">
              <span className="crm-stat-label">Thin Accounts</span>
              <strong className="crm-stat-value">{counts.thinAccounts ?? 0}</strong>
            </div>
            <div className="crm-stat-card">
              <span className="crm-stat-label">Avg contacts / Account</span>
              <strong className="crm-stat-value">{counts.avgContactsPerAccount ?? 0}</strong>
            </div>
          </div>

          {(counts.thinAccounts > 0) ? (
            <p className="crm-banner-warn">
              {counts.thinAccounts} Accounts still need real people emails.
              Use <strong>Find contacts on Accounts</strong> (website + search), then verify under{' '}
              <Link to="/sales/contacts?needsVerify=1">Contacts needing verify</Link>.
            </p>
          ) : null}

          {(counts.openDeals === 0 && (counts.accounts || 0) > 0) ? (
            <p className="crm-banner-warn">
              You have {counts.accounts} Accounts but no open deals.
              Open an Account and click <strong>New Opportunity</strong>, or go to{' '}
              <Link to="/sales/pipeline">Pipeline</Link>.
            </p>
          ) : null}

          <div className="crm-home-columns" style={{ marginBottom: '1rem' }}>
            <section className="crm-home-panel">
              <h3>Accounts by Region</h3>
              {(data?.byRegion || []).length === 0 ? (
                <p className="crm-muted">No region data yet — Fill missing countries or import with a Region.</p>
              ) : (
                <ul className="crm-recent-list">
                  {data.byRegion.slice(0, 8).map((r) => (
                    <li key={r.label}>
                      <Link to={`/sales/accounts?region=${encodeURIComponent(r.label === 'Unknown' ? '' : r.label)}`}>
                        {r.label}
                      </Link>
                      <span>{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="crm-home-panel">
              <h3>Accounts by Country</h3>
              {(data?.byCountry || []).length === 0 ? (
                <p className="crm-muted">No country data yet.</p>
              ) : (
                <ul className="crm-recent-list">
                  {data.byCountry.slice(0, 8).map((r) => (
                    <li key={r.label}>
                      <Link to={`/sales/accounts?country=${encodeURIComponent(r.label === 'Unknown' ? '' : r.label)}`}>
                        {r.label}
                      </Link>
                      <span>{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="crm-home-columns" style={{ marginBottom: '1rem' }}>
            <section className="crm-home-panel">
              <h3>Contacts by source</h3>
              {(data?.contactSourceMix || []).length === 0 ? (
                <p className="crm-muted">No contacts yet.</p>
              ) : (
                <ul className="crm-recent-list">
                  {data.contactSourceMix.map((r) => (
                    <li key={r.label}>
                      <Link to={`/sales/contacts?source=${encodeURIComponent(r.label)}`}>
                        {r.label === 'web_llm' ? 'AI / web' : r.label}
                      </Link>
                      <span>{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="crm-home-panel">
              <h3>Contacts by Country</h3>
              {(data?.contactsByCountry || []).length === 0 ? (
                <p className="crm-muted">No contact country data yet.</p>
              ) : (
                <ul className="crm-recent-list">
                  {data.contactsByCountry.slice(0, 8).map((r) => (
                    <li key={r.label}>
                      <span>{r.label}</span>
                      <span>{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="crm-home-actions">
            <button
              type="button"
              className="crm-btn-primary"
              disabled={anyBusy}
              onClick={runFillPipeline}
            >
              {fillBusy ? 'Filling pipeline…' : 'Fill pipeline'}
            </button>
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
              {findBusy ? 'Finding contacts…' : 'Find contacts on thin Accounts'}
            </button>
            <button
              type="button"
              className="crm-btn-secondary"
              disabled={anyBusy}
              onClick={runBackfillGeo}
            >
              {geoBusy ? 'Filling countries…' : 'Fill missing countries'}
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
            <Link className="crm-btn-secondary" to="/sales/tasks">My Tasks</Link>
            <Link className="crm-btn-secondary" to="/sales/settings">Sales settings</Link>
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
            <button
              type="button"
              className="crm-btn-secondary"
              disabled={anyBusy}
              onClick={async () => {
                if (!window.confirm('Delete duplicate contacts that share the same email (keeps newest)?')) return
                setRefreshMsg('Deduping emails…')
                try {
                  const res = await crmApi.dedupeEmails(true)
                  const d = res.data || {}
                  setRefreshMsg(`Dedupe · removed ${d.deleted || 0} duplicates (${d.duplicateCount || 0} found).`)
                  await load()
                } catch (err) {
                  setRefreshMsg(err.message || 'Dedupe failed.')
                }
              }}
            >
              Dedupe contact emails
            </button>
            <Link className="crm-btn-secondary" to="/sales/contacts?needsVerify=1">Contacts needing verify</Link>
          </div>
          <p className="crm-muted">
            <strong>Fill pipeline</strong> runs Import → Geo → Find contacts (caps in{' '}
            <Link to="/sales/settings">Sales settings</Link>).
            Free contacts path: <strong>Import Contacts (CSV)</strong> or{' '}
            <strong>Find contacts on thin Accounts</strong> (site pages + search + Groq).
            Needs <code>GROQ_API_KEY</code> and <code>BRAVE_API_KEY</code> (or Tavily) on Railway.
            Web import tags Accounts with Region; enable scheduled find under Settings for ongoing growth.
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
