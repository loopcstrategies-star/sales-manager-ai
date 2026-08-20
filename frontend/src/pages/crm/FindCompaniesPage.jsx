import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { crmApi, industriesApi } from '../../api/client'
import ProspectSearchPanel from '../../components/crm/ProspectSearchPanel'

export default function FindCompaniesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [industrySlug, setIndustrySlug] = useState(searchParams.get('industry') || '')
  const [businessType, setBusinessType] = useState(searchParams.get('businessType') || '')
  const [region, setRegion] = useState(searchParams.get('region') || '')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [industry, setIndustry] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const next = {}
    if (industrySlug) next.industry = industrySlug
    if (businessType) next.businessType = businessType
    if (region) next.region = region
    setSearchParams(next, { replace: true })
  }, [industrySlug, businessType, region, setSearchParams])

  useEffect(() => {
    let cancelled = false
    if (!industrySlug) {
      setIndustry(null)
      return undefined
    }
    ;(async () => {
      try {
        const res = await industriesApi.get(industrySlug)
        if (!cancelled) setIndustry(res.data || null)
      } catch {
        if (!cancelled) setIndustry(null)
      }
    })()
    return () => { cancelled = true }
  }, [industrySlug])

  const loadCompanies = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await crmApi.companySearch({
        q: query,
        industry: industrySlug || undefined,
        businessType: businessType || undefined,
        region: region || undefined,
      })
      setItems(res.data || [])
    } catch (err) {
      setError(err.message || 'Failed to load companies')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { loadCompanies() }, 250)
    return () => clearTimeout(t)
  }, [query, industrySlug, businessType, region])

  const summary = useMemo(() => {
    if (!industry) return 'Search existing companies or run prospecting for any industry.'
    return `${industry.name} workspace with ${industry.businessTypes?.length || 0} business types and ${industry.solutionsCatalog?.length || 0} linked solutions.`
  }, [industry])

  return (
    <div className="crm-home">
      <header className="crm-home-header">
        <h2>Find Companies</h2>
        <p>{summary}</p>
      </header>
      {error ? <p className="crm-banner-error">{error}</p> : null}
      <div className="crm-home-columns" style={{ alignItems: 'start' }}>
        <div>
          <ProspectSearchPanel
            region={region}
            onRegionChange={setRegion}
            industrySlug={industrySlug}
            onIndustryChange={setIndustrySlug}
            businessType={businessType}
            onBusinessTypeChange={setBusinessType}
            onImported={() => loadCompanies()}
          />
        </div>
        <section className="crm-home-panel">
          <div className="crm-ai-panel-head">
            <h3>Company Intelligence</h3>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saved companies"
              aria-label="Search saved companies"
            />
          </div>
          {loading ? <p className="crm-muted">Loading…</p> : null}
          {!loading && items.length === 0 ? (
            <p className="crm-muted">
              {industry ? `No ${industry.name.toLowerCase()} prospects yet. Run company discovery to find prospects.` : 'No prospects yet.'}
            </p>
          ) : null}
          <ul className="crm-recent-list">
            {items.map((item) => (
              <li key={item.companyId}>
                <div>
                  <Link to={`/sales/accounts/${item.companyId}`}>{item.companyName}</Link>
                  <div className="crm-muted">
                    {item.industry || 'Unknown'} · {item.businessType || 'Unknown'} · {item.location.country || item.location.region || 'Unknown'}
                  </div>
                </div>
                <span>{item.digitalOpportunityScore}/100</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
