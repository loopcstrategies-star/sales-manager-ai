import React, { useEffect, useState } from 'react'
import { industriesApi } from '../../api/client'

export default function SalesPlaybooksPage() {
  const [industries, setIndustries] = useState([])
  const [selectedSlug, setSelectedSlug] = useState('jewelry')
  const [playbook, setPlaybook] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await industriesApi.list()
        if (!cancelled) {
          setIndustries(res.data || [])
          const first = (res.data || [])[0]?.slug || 'jewelry'
          setSelectedSlug((current) => current || first)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load industries')
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!selectedSlug) return undefined
    ;(async () => {
      try {
        const res = await industriesApi.get(selectedSlug)
        if (!cancelled) setPlaybook(res.data || null)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load playbook')
      }
    })()
    return () => { cancelled = true }
  }, [selectedSlug])

  const pb = playbook?.salesPlaybook || {}

  return (
    <div className="crm-home">
      <header className="crm-home-header">
        <h2>Sales Playbooks</h2>
        <p>Industry-configurable discovery, qualification, objection handling, and follow-up.</p>
      </header>
      {error ? <p className="crm-banner-error">{error}</p> : null}
      <label className="crm-field" style={{ maxWidth: 320 }}>
        <span>Industry</span>
        <select value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)}>
          {industries.map((industry) => (
            <option key={industry.slug} value={industry.slug}>{industry.name}</option>
          ))}
        </select>
      </label>
      {playbook ? (
        <div className="crm-home-columns">
          <section className="crm-home-panel">
            <h3>Stages</h3>
            <ul className="crm-recent-list">
              {(pb.stages || []).map((stage) => <li key={stage}><span>{stage}</span></li>)}
            </ul>
          </section>
          <section className="crm-home-panel">
            <h3>Opening Questions</h3>
            <ul className="crm-recent-list">
              {(pb.openingQuestions || []).map((item) => <li key={item}><span>{item}</span></li>)}
            </ul>
            <h3 style={{ marginTop: '1rem' }}>Discovery Questions</h3>
            <ul className="crm-recent-list">
              {(pb.discoveryQuestions || []).map((item) => <li key={item}><span>{item}</span></li>)}
            </ul>
          </section>
          <section className="crm-home-panel">
            <h3>Objection Handling</h3>
            <ul className="crm-recent-list">
              {(pb.objectionHandling || []).map((item) => <li key={item}><span>{item}</span></li>)}
            </ul>
            <h3 style={{ marginTop: '1rem' }}>Follow-up</h3>
            <ul className="crm-recent-list">
              {(pb.followUpSequence || []).map((item) => <li key={item}><span>{item}</span></li>)}
            </ul>
            <p className="crm-muted" style={{ marginTop: '0.75rem' }}>
              Demo recommendation: {pb.demoRecommendation || 'Unknown'}
            </p>
          </section>
        </div>
      ) : null}
    </div>
  )
}
