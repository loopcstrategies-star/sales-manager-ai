import industries from '../../../shared/industries.json'
import solutionCatalog from '../../../shared/solutionCatalog.json'
import solutionPackages from '../../../shared/solutionPackages.json'

export function listIndustryConfigs() {
  return industries.map((industry) => ({ ...industry }))
}

export function getIndustryConfig(slugOrId) {
  const key = String(slugOrId || '').trim()
  return industries.find((industry) => industry.slug === key || industry.id === key) || null
}

export function listSolutionsForIndustry(slug) {
  return solutionCatalog.filter((solution) => (
    solution.targetIndustries.includes('all') || solution.targetIndustries.includes(slug)
  ))
}

export function listSolutionCatalog() {
  return solutionCatalog.map((solution) => ({ ...solution }))
}

export function listPackagesForIndustry(slug) {
  return solutionPackages.filter((item) => item.industrySlug === slug)
}
