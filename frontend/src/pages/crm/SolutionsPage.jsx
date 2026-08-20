import React, { useEffect, useMemo, useState } from 'react'
import { packagesApi, solutionsApi } from '../../api/client'
import { listIndustryConfigs } from '../../lib/industryCatalog'

const emptySolution = {
  name: '',
  category: 'websites',
  description: '',
  industries: [],
  pricing: { amount: 0, currency: 'USD', model: 'one-time' },
  status: 'active',
}

const emptyPackage = {
  name: '',
  description: '',
  industrySlug: '',
  solutionIds: [],
  price: 0,
  currency: 'USD',
  billingType: 'one-time',
  status: 'active',
}

export default function SolutionsPage() {
  const [tab, setTab] = useState('solutions')
  const [solutions, setSolutions] = useState([])
  const [packages, setPackages] = useState([])
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(emptySolution)
  const [editingId, setEditingId] = useState('')
  const [pkgForm, setPkgForm] = useState(emptyPackage)
  const [editingPkgId, setEditingPkgId] = useState('')
  const industries = listIndustryConfigs()

  async function load() {
    setBusy(true)
    setError('')
    try {
      const [solRes, pkgRes] = await Promise.all([
        solutionsApi.list({ q, category, status: 'active' }),
        packagesApi.list({ status: 'active' }),
      ])
      setSolutions(solRes.data || [])
      setPackages(pkgRes.data || [])
    } catch (err) {
      setError(err.message || 'Failed to load catalog.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const grouped = useMemo(() => solutions.reduce((acc, item) => {
    const key = item.category || 'other'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {}), [solutions])

  async function saveSolution(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (editingId) await solutionsApi.update(editingId, form)
      else await solutionsApi.create(form)
      setForm(emptySolution)
      setEditingId('')
      await load()
    } catch (err) {
      setError(err.message || 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  async function savePackage(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (editingPkgId) await packagesApi.update(editingPkgId, pkgForm)
      else await packagesApi.create(pkgForm)
      setPkgForm(emptyPackage)
      setEditingPkgId('')
      await load()
    } catch (err) {
      setError(err.message || 'Package save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="crm-home">
      <header className="crm-home-header">
        <h2>Solution Catalog</h2>
        <p>Organization solutions and packages used for recommendations, opportunities, and proposals.</p>
      </header>

      <div className="crm-toolbar" style={{ gap: '0.5rem', marginBottom: '1rem' }}>
        <button type="button" className={tab === 'solutions' ? 'primary' : ''} onClick={() => setTab('solutions')}>All Solutions</button>
        <button type="button" className={tab === 'categories' ? 'primary' : ''} onClick={() => setTab('categories')}>Categories</button>
        <button type="button" className={tab === 'packages' ? 'primary' : ''} onClick={() => setTab('packages')}>Packages</button>
        <button type="button" className={tab === 'pricing' ? 'primary' : ''} onClick={() => setTab('pricing')}>Pricing</button>
      </div>

      {error ? <p className="crm-error">{error}</p> : null}
      {busy ? <p className="crm-muted">Loading…</p> : null}

      {(tab === 'solutions' || tab === 'categories' || tab === 'pricing') ? (
        <>
          <div className="crm-toolbar" style={{ gap: '0.5rem', marginBottom: '1rem' }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search solutions" />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {[...new Set(solutions.map((item) => item.category).filter(Boolean))].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <button type="button" onClick={load}>Filter</button>
          </div>

          <form className="crm-home-panel" onSubmit={saveSolution} style={{ marginBottom: '1rem' }}>
            <h3>{editingId ? 'Edit Solution' : 'Create Solution'}</h3>
            <div className="crm-form-grid">
              <label>
                Name
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label>
                Category
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </label>
              <label>
                Price
                <input
                  type="number"
                  min="0"
                  value={form.pricing?.amount || 0}
                  onChange={(e) => setForm({
                    ...form,
                    pricing: { ...form.pricing, amount: Number(e.target.value) || 0 },
                  })}
                />
              </label>
              <label>
                Industries
                <select
                  multiple
                  value={form.industries}
                  onChange={(e) => setForm({
                    ...form,
                    industries: Array.from(e.target.selectedOptions).map((opt) => opt.value),
                  })}
                >
                  <option value="all">all</option>
                  {industries.map((industry) => (
                    <option key={industry.slug} value={industry.slug}>{industry.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </label>
            <div className="crm-toolbar" style={{ gap: '0.5rem' }}>
              <button type="submit" className="primary" disabled={busy}>{editingId ? 'Update' : 'Create'}</button>
              {editingId ? (
                <button type="button" onClick={() => { setEditingId(''); setForm(emptySolution) }}>Cancel</button>
              ) : null}
            </div>
          </form>

          <div className="crm-home-columns">
            {(tab === 'categories' ? Object.keys(grouped) : ['all']).map((key) => (
              <section key={key} className="crm-home-panel">
                <h3>{tab === 'categories' ? key : 'Solutions'}</h3>
                <ul className="crm-recent-list">
                  {(tab === 'categories' ? grouped[key] : solutions).map((solution) => (
                    <li key={solution._id}>
                      <span>
                        {solution.name}
                        {tab === 'pricing' ? ` · ${solution.pricing?.currency || 'USD'} ${solution.pricing?.amount || 0}` : ''}
                      </span>
                      <span>
                        <button type="button" onClick={() => { setEditingId(solution._id); setForm({
                          name: solution.name,
                          category: solution.category || 'other',
                          description: solution.description || '',
                          industries: solution.industries || [],
                          pricing: solution.pricing || emptySolution.pricing,
                          status: solution.status || 'active',
                        }) }}>Edit</button>
                        {' '}
                        <button type="button" onClick={async () => { await solutionsApi.duplicate(solution._id); load() }}>Duplicate</button>
                        {' '}
                        <button type="button" onClick={async () => { await solutionsApi.archive(solution._id); load() }}>Archive</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : null}

      {tab === 'packages' ? (
        <div className="crm-home-columns">
          <section className="crm-home-panel">
            <h3>{editingPkgId ? 'Edit Package' : 'Create Package'}</h3>
            <form onSubmit={savePackage}>
              <div className="crm-form-grid">
                <label>
                  Name
                  <input required value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} />
                </label>
                <label>
                  Industry
                  <select
                    value={pkgForm.industrySlug}
                    onChange={(e) => setPkgForm({ ...pkgForm, industrySlug: e.target.value })}
                  >
                    <option value="">Any</option>
                    {industries.map((industry) => (
                      <option key={industry.slug} value={industry.slug}>{industry.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Price
                  <input
                    type="number"
                    min="0"
                    value={pkgForm.price}
                    onChange={(e) => setPkgForm({ ...pkgForm, price: Number(e.target.value) || 0 })}
                  />
                </label>
                <label>
                  Billing
                  <select
                    value={pkgForm.billingType}
                    onChange={(e) => setPkgForm({ ...pkgForm, billingType: e.target.value })}
                  >
                    <option value="one-time">one-time</option>
                    <option value="monthly">monthly</option>
                    <option value="yearly">yearly</option>
                    <option value="custom">custom</option>
                  </select>
                </label>
              </div>
              <label>
                Solutions in package
                <select
                  multiple
                  value={pkgForm.solutionIds}
                  onChange={(e) => setPkgForm({
                    ...pkgForm,
                    solutionIds: Array.from(e.target.selectedOptions).map((opt) => opt.value),
                  })}
                >
                  {solutions.map((solution) => (
                    <option key={solution._id} value={solution.catalogKey || solution._id}>
                      {solution.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Description
                <textarea
                  value={pkgForm.description}
                  onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })}
                  rows={3}
                />
              </label>
              <div className="crm-toolbar" style={{ gap: '0.5rem' }}>
                <button type="submit" className="primary" disabled={busy}>{editingPkgId ? 'Update' : 'Create'}</button>
                {editingPkgId ? (
                  <button type="button" onClick={() => { setEditingPkgId(''); setPkgForm(emptyPackage) }}>Cancel</button>
                ) : null}
              </div>
            </form>
          </section>
          <section className="crm-home-panel">
            <h3>Packages</h3>
            {!packages.length ? <p className="crm-muted">No packages yet. Defaults seed on first open.</p> : (
              <ul className="crm-recent-list">
                {packages.map((pkg) => (
                  <li key={pkg._id}>
                    <span>{pkg.name}</span>
                    <span>
                      {(pkg.solutionIds || []).length} solutions · {pkg.billingType} · {pkg.currency} {pkg.price}
                      {' '}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPkgId(pkg._id)
                          setPkgForm({
                            name: pkg.name,
                            description: pkg.description || '',
                            industrySlug: pkg.industrySlug || '',
                            solutionIds: pkg.solutionIds || [],
                            price: pkg.price || 0,
                            currency: pkg.currency || 'USD',
                            billingType: pkg.billingType || 'one-time',
                            status: pkg.status || 'active',
                          })
                        }}
                      >
                        Edit
                      </button>
                      {' '}
                      <button type="button" onClick={async () => { await packagesApi.archive(pkg._id); load() }}>Archive</button>
                    </span>
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
