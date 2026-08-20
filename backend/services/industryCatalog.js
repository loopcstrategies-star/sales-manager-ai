const industries = require('../../shared/industries.json')
const solutionCatalog = require('../../shared/solutionCatalog.json')

const industryBySlug = new Map(industries.map((industry) => [industry.slug, industry]))
const industryById = new Map(industries.map((industry) => [industry.id, industry]))
const solutionById = new Map(solutionCatalog.map((solution) => [solution.id, solution]))

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function listIndustries() {
  return industries.map(clone)
}

function getIndustry(slugOrId) {
  const key = String(slugOrId || '').trim()
  return clone(industryBySlug.get(key) || industryById.get(key) || null)
}

function listSolutions() {
  return solutionCatalog.map(clone)
}

function getSolution(solutionId) {
  return clone(solutionById.get(String(solutionId || '').trim()) || null)
}

function listSolutionsForIndustry(industrySlug) {
  const slug = String(industrySlug || '').trim()
  return solutionCatalog
    .filter((solution) => solution.targetIndustries.includes('all') || solution.targetIndustries.includes(slug))
    .map(clone)
}

function summarizeIndustry(industrySlug) {
  const industry = getIndustry(industrySlug)
  if (!industry) return null
  const solutions = listSolutionsForIndustry(industry.slug)
  return {
    ...industry,
    businessCategoryCount: industry.businessTypes.length,
    solutionCount: solutions.length,
    solutions,
  }
}

module.exports = {
  listIndustries,
  getIndustry,
  listSolutions,
  getSolution,
  listSolutionsForIndustry,
  summarizeIndustry,
}
