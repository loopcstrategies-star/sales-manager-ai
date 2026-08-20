import React from 'react'
import { getIndustryConfig, listPackagesForIndustry, listSolutionCatalog } from '../../lib/industryCatalog'

function byCategory(items) {
  return items.reduce((acc, item) => {
    const key = item.category
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})
}

export default function SolutionsPage() {
  const grouped = byCategory(listSolutionCatalog())
  const categories = Object.keys(grouped)
  const featuredIndustries = ['jewelry', 'construction', 'education']

  return (
    <div className="crm-home">
      <header className="crm-home-header">
        <h2>Solutions</h2>
        <p>Centralized LoopC solution catalog linked to industry workspaces and opportunity recommendations.</p>
      </header>
      <div className="crm-home-columns">
        {categories.map((category) => (
          <section key={category} className="crm-home-panel">
            <h3>{category.replace(/-/g, ' ')}</h3>
            <ul className="crm-recent-list">
              {grouped[category].map((solution) => (
                <li key={solution.id}>
                  <span>{solution.name}</span>
                  <span>{solution.targetIndustries.includes('all') ? 'All industries' : `${solution.targetIndustries.length} industries`}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="crm-home-columns" style={{ marginTop: '1rem' }}>
        {featuredIndustries.map((slug) => {
          const industry = getIndustryConfig(slug)
          const packages = listPackagesForIndustry(slug)
          if (!industry) return null
          return (
            <section key={slug} className="crm-home-panel">
              <h3>{industry.name} Packages</h3>
              {!packages.length ? (
                <p className="crm-muted">No packages configured.</p>
              ) : (
                <ul className="crm-recent-list">
                  {packages.map((pkg) => (
                    <li key={pkg.id}>
                      <span>{pkg.name}</span>
                      <span>{pkg.solutionIds.length} solutions</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
