import React, { useState } from 'react'
import { crmApi } from '../../api/client'

export default function ProspectSearchPanel({ onImported }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState({})
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [asAccount, setAsAccount] = useState(true)
  const [asLead, setAsLead] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const search = async (e) => {
    e?.preventDefault?.()
    if (!query.trim()) return
    setBusy(true)
    setError('')
    setMessage('')
    setSelected({})
    try {
      const res = await crmApi.prospectSearch(query.trim())
      setResults(res.data?.results || [])
      if (!(res.data?.results || []).length) setMessage('No results. Try a different query.')
    } catch (err) {
      setResults([])
      setError(err.message || 'Search failed.')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const selectedItems = results.filter((r) => selected[r.id])

  const importSelected = async () => {
    if (!selectedItems.length) return
    setImporting(true)
    setError('')
    try {
      const res = await crmApi.prospectImport({
        items: selectedItems,
        asAccount,
        asLead,
      })
      const d = res.data || {}
      setMessage(
        `Imported · Accounts +${d.accountsCreated || 0} (upd ${d.accountsUpdated || 0}) · Leads +${d.leadsCreated || 0}`,
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
      <p className="crm-muted">Search the web, then add selected results as Accounts and/or Leads.</p>
      <form className="crm-prospect-form" onSubmit={search}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. jewelry manufacturers Dubai"
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
            {results.map((r) => (
              <li key={r.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(selected[r.id])}
                    onChange={() => toggle(r.id)}
                  />
                  <span>
                    <strong>{r.title}</strong>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">{r.url}</a>
                    ) : null}
                    <em>{r.snippet}</em>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="crm-prospect-import">
            <label>
              <input type="checkbox" checked={asAccount} onChange={(e) => setAsAccount(e.target.checked)} />
              Add as Account
            </label>
            <label>
              <input type="checkbox" checked={asLead} onChange={(e) => setAsLead(e.target.checked)} />
              Add as Lead
            </label>
            <button
              type="button"
              className="crm-btn-primary"
              disabled={importing || !selectedItems.length || (!asAccount && !asLead)}
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
