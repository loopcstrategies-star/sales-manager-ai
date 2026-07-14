import React, { useState } from 'react'
import { crmApi } from '../../api/client'

export const DEFAULT_PROSPECT_QUERIES = [
  'jewelry manufacturers',
  'gold wholesale suppliers',
  'diamond trading companies',
  'precious metals bullion dealers',
  'jewellery exporters',
]

export const REGION_PRESETS = [
  { value: '', label: 'Worldwide' },
  { value: 'Middle East', label: 'Middle East' },
  { value: 'Europe', label: 'Europe' },
  { value: 'India', label: 'India' },
  { value: 'Asia Pacific', label: 'Asia Pacific' },
  { value: 'Americas', label: 'Americas' },
  { value: 'Africa', label: 'Africa' },
]

function skipLabel(reason) {
  if (reason === 'noise_host') return 'News/social — skipped'
  if (reason === 'listicle') return 'Article/list — skipped'
  if (reason === 'empty') return 'Incomplete — skipped'
  return reason ? 'Skipped' : null
}

export default function ProspectSearchPanel({ onImported, region = '', onRegionChange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState({})
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [asAccount, setAsAccount] = useState(true)
  const [asLead, setAsLead] = useState(false)
  const [asContact, setAsContact] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const search = async (e, overrideQuery) => {
    e?.preventDefault?.()
    const q = String(overrideQuery ?? query).trim()
    if (!q) return
    if (overrideQuery != null) setQuery(q)
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await crmApi.prospectSearch(q, region)
      const next = res.data?.results || []
      setResults(next)
      const defaults = {}
      next.forEach((r) => {
        if (r.importable !== false) defaults[r.id] = true
      })
      setSelected(defaults)
      if (!next.length) setMessage('No results. Try a different query or region.')
      else {
        const skipped = next.filter((r) => r.importable === false).length
        if (skipped) {
          setMessage(`${skipped} news/social/article hits marked skip — company-like results are pre-selected.`)
        }
      }
    } catch (err) {
      setResults([])
      setSelected({})
      setError(err.message || 'Search failed.')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const selectedItems = results.filter((r) => selected[r.id])
  const canImport = asAccount || asLead || asContact

  const importSelected = async () => {
    if (!selectedItems.length || !canImport) return
    setImporting(true)
    setError('')
    try {
      const force = selectedItems.some((r) => r.importable === false)
      const res = await crmApi.prospectImport({
        items: selectedItems,
        asAccount,
        asLead,
        asContact,
        force,
      })
      const d = res.data || {}
      setMessage(
        `Imported · Accounts +${d.accountsCreated || 0} (upd ${d.accountsUpdated || 0}) · Contacts +${d.contactsCreated || 0} · Leads +${d.leadsCreated || 0} · enriched ${d.enriched || 0} · skipped low-quality ${d.skippedLowQuality || 0}`,
      )
      onImported?.(d)
    } catch (err) {
      setError(err.message || 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <section className="crm-home-panel crm-prospect-panel">
      <h3>Find companies</h3>
      <p className="crm-muted">
        Search worldwide (or pick a region), then add company-like results as Accounts. News, social, and listicle pages are filtered out by default.
      </p>
      <label className="crm-prospect-region">
        <span>Region</span>
        <select
          value={region}
          onChange={(e) => onRegionChange?.(e.target.value)}
          aria-label="Prospect region"
        >
          {REGION_PRESETS.map((r) => (
            <option key={r.label} value={r.value}>{r.label}</option>
          ))}
        </select>
      </label>
      <div className="crm-prospect-chips" role="list">
        {DEFAULT_PROSPECT_QUERIES.map((chip) => (
          <button
            key={chip}
            type="button"
            className="crm-prospect-chip"
            disabled={busy}
            onClick={() => search(null, chip)}
          >
            {chip}
          </button>
        ))}
      </div>
      <form className="crm-prospect-form" onSubmit={search}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. jewelry manufacturers Italy"
          aria-label="Prospect search"
        />
        <button type="submit" className="crm-btn-primary" disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error ? <p className="crm-banner-error">{error}</p> : null}
      {message ? <p className="crm-muted">{message}</p> : null}

      {results.length ? (
        <>
          <ul className="crm-prospect-list">
            {results.map((r) => {
              const primary = r.companyName || r.title
              const showTitle = r.companyName && r.companyName !== r.title
              const skipped = r.importable === false
              return (
                <li key={r.id} className={skipped ? 'crm-prospect-skipped' : undefined}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(selected[r.id])}
                      onChange={() => toggle(r.id)}
                    />
                    <span>
                      <strong>{primary}</strong>
                      {skipped && skipLabel(r.skipReason) ? (
                        <span className="crm-prospect-badge">{skipLabel(r.skipReason)}</span>
                      ) : null}
                      {showTitle ? <em className="crm-prospect-orig">{r.title}</em> : null}
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer">{r.url}</a>
                      ) : null}
                      <em>{r.snippet}</em>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="crm-prospect-import">
            <label>
              <input type="checkbox" checked={asAccount} onChange={(e) => setAsAccount(e.target.checked)} />
              Add as Account
            </label>
            <label>
              <input type="checkbox" checked={asContact} onChange={(e) => setAsContact(e.target.checked)} />
              Add as Contact
            </label>
            <label>
              <input type="checkbox" checked={asLead} onChange={(e) => setAsLead(e.target.checked)} />
              Add as Lead
            </label>
            <button
              type="button"
              className="crm-btn-primary"
              disabled={importing || !selectedItems.length || !canImport}
              onClick={importSelected}
            >
              {importing ? 'Adding…' : `Add selected (${selectedItems.length})`}
            </button>
          </div>
        </>
      ) : null}
    </section>
  )
}
