import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { industriesApi } from '../../api/client'

export default function IndustriesPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await industriesApi.list()
        if (!cancelled) {
          setItems(res.data || [])
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load industries')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="crm-home">
      <header className="crm-home-header">
        <h2>Industries</h2>
        <p>One CRM, many configurable industry workspaces.</p>
      </header>
      {error ? <p className="crm-banner-error">{error}</p> : null}
      {loading ? <p className="crm-muted">Loading…</p> : null}
      {!loading ? (
        <div className="crm-stat-grid">
          {items.map((industry) => (
            <button
              key={industry.slug}
              type="button"
              className="crm-stat-card"
              onClick={() => navigate(`/sales/find-companies?industry=${encodeURIComponent(industry.slug)}`)}
              style={{ textAlign: 'left' }}
            >
              <span className="crm-stat-label">{industry.name}</span>
              <strong className="crm-stat-value">{industry.businessCategoryCount || industry.businessTypes?.length || 0} business types</strong>
              <p className="crm-muted">{industry.description}</p>
              <p className="crm-muted">
                Solutions {industry.solutionCount || 0} · Leads {industry.leadsCount || 0} · Opportunities {industry.opportunitiesCount || 0}
              </p>
              <span className="crm-muted">Open workspace</span>
            </button>
          ))}
        </div>
      ) : null}
      <p className="crm-muted" style={{ marginTop: '1rem' }}>
        Need a new vertical? Add one through configuration and it will appear here without creating a separate CRM.
      </p>
      <p className="crm-muted">
        Explore current playbooks in <Link to="/sales/playbooks">Sales Playbooks</Link>.
      </p>
    </div>
  )
}
