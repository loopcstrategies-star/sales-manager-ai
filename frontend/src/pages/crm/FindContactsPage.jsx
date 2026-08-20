import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { contactsApi, crmApi, industriesApi } from '../../api/client'

export default function FindContactsPage() {
  const [searchParams] = useSearchParams()
  const industrySlug = searchParams.get('industry') || ''
  const [industry, setIndustry] = useState(null)
  const [contacts, setContacts] = useState([])
  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [discovered, setDiscovered] = useState([])
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [contactsRes, accountsRes, industryRes] = await Promise.all([
          contactsApi.list('', { industry: industrySlug || undefined }),
          crmApi.companySearch({ industry: industrySlug || undefined }),
          industrySlug ? industriesApi.get(industrySlug) : Promise.resolve({ data: null }),
        ])
        if (!cancelled) {
          setContacts(contactsRes.data || [])
          setAccounts(accountsRes.data || [])
          setIndustry(industryRes.data || null)
          setSelectedAccountId((accountsRes.data || [])[0]?.companyId || '')
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load contacts')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [industrySlug])

  const discover = async () => {
    if (!selectedAccountId) return
    setDiscovering(true)
    setError('')
    try {
      const res = await crmApi.companyContacts(selectedAccountId)
      setDiscovered(res.data || [])
    } catch (err) {
      setError(err.message || 'Failed to discover contacts')
      setDiscovered([])
    } finally {
      setDiscovering(false)
    }
  }

  return (
    <div className="crm-home">
      <header className="crm-home-header">
        <h2>Find Contacts</h2>
        <p>
          {industry
            ? `${industry.name} decision-maker discovery uses roles like ${industry.decisionMakerRoles.slice(0, 4).join(', ')}.`
            : 'Discover and review public business contacts without claiming unverified contacts are confirmed.'}
        </p>
      </header>
      {error ? <p className="crm-banner-error">{error}</p> : null}
      {loading ? <p className="crm-muted">Loading…</p> : null}
      {!loading ? (
        <div className="crm-home-columns">
          <section className="crm-home-panel">
            <div className="crm-ai-panel-head">
              <h3>Saved Contacts</h3>
              <Link className="crm-btn-secondary" to="/sales/contacts">Open Contacts</Link>
            </div>
            {!contacts.length ? <p className="crm-muted">No contacts saved for this industry yet.</p> : (
              <ul className="crm-recent-list">
                {contacts.map((contact) => (
                  <li key={contact._id}>
                    <Link to={`/sales/contacts/${contact._id}`}>{contact.fullName || contact.lastName}</Link>
                    <span>{contact.title || 'Unknown role'} · {contact.verificationStatus || 'unverified'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="crm-home-panel">
            <div className="crm-ai-panel-head">
              <h3>Discover Decision Makers</h3>
              <button type="button" className="crm-btn-primary" disabled={discovering || !selectedAccountId} onClick={discover}>
                {discovering ? 'Researching…' : 'Find Contacts'}
              </button>
            </div>
            <label className="crm-field">
              <span>Company</span>
              <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                <option value="">Select company…</option>
                {accounts.map((account) => (
                  <option key={account.companyId} value={account.companyId}>{account.companyName}</option>
                ))}
              </select>
            </label>
            {industry ? (
              <p className="crm-muted">Target roles: {industry.decisionMakerRoles.join(', ')}</p>
            ) : null}
            {!discovered.length ? (
              <p className="crm-muted">No decision-maker research yet. Pick a company and run contact discovery.</p>
            ) : (
              <ul className="crm-recent-list">
                {discovered.map((person, index) => (
                  <li key={`${person.email || person.lastName}-${index}`}>
                    <span>{[person.firstName, person.lastName].filter(Boolean).join(' ') || person.lastName || 'Unknown'}</span>
                    <span>{person.title || 'Unknown role'} · confidence pending verification</span>
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
