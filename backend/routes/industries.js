const express = require('express')
const { protect } = require('../middleware/auth')
const Account = require('../models/Account')
const Lead = require('../models/Lead')
const Opportunity = require('../models/Opportunity')
const { workspaceFilter } = require('../services/crmHelpers')
const {
  listIndustries,
  getIndustry,
  listSolutionsForIndustry,
} = require('../services/industryCatalog')

const router = express.Router()
router.use(protect)

async function industryCounts(user, slug) {
  const filter = workspaceFilter(user)
  const [leadsCount, opportunitiesCount] = await Promise.all([
    Lead.countDocuments({
      ...filter,
      $or: [
        { industrySlug: slug },
        { industry: new RegExp(`^${slug.replace(/-/g, ' ')}$`, 'i') },
      ],
    }),
    Opportunity.countDocuments({
      ...filter,
      $or: [
        { industrySlug: slug },
        { industryId: slug },
      ],
    }),
  ])

  const accountsCount = await Account.countDocuments({
    ...filter,
    $or: [
      { industrySlug: slug },
      { industryId: slug },
    ],
  })

  return { leadsCount, opportunitiesCount, accountsCount }
}

router.get('/', async (req, res) => {
  try {
    const industries = await Promise.all(
      listIndustries().map(async (industry) => {
        const counts = await industryCounts(req.user, industry.slug)
        const solutions = listSolutionsForIndustry(industry.slug)
        return {
          ...industry,
          businessCategoryCount: industry.businessTypes.length,
          solutionCount: solutions.length,
          ...counts,
        }
      }),
    )

    res.json({ success: true, data: industries })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load industries.' })
  }
})

router.get('/:slug', async (req, res) => {
  try {
    const industry = getIndustry(req.params.slug)
    if (!industry) {
      return res.status(404).json({ success: false, message: 'Industry not found.' })
    }
    const counts = await industryCounts(req.user, industry.slug)
    res.json({
      success: true,
      data: {
        ...industry,
        ...counts,
        solutionsCatalog: listSolutionsForIndustry(industry.slug),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load industry.' })
  }
})

router.get('/:slug/categories', (req, res) => {
  const industry = getIndustry(req.params.slug)
  if (!industry) return res.status(404).json({ success: false, message: 'Industry not found.' })
  res.json({ success: true, data: industry.categories || [] })
})

router.get('/:slug/solutions', (req, res) => {
  const industry = getIndustry(req.params.slug)
  if (!industry) return res.status(404).json({ success: false, message: 'Industry not found.' })
  res.json({ success: true, data: listSolutionsForIndustry(industry.slug) })
})

router.get('/:slug/playbook', (req, res) => {
  const industry = getIndustry(req.params.slug)
  if (!industry) return res.status(404).json({ success: false, message: 'Industry not found.' })
  res.json({ success: true, data: industry.salesPlaybook || null })
})

router.get('/:slug/questions', (req, res) => {
  const industry = getIndustry(req.params.slug)
  if (!industry) return res.status(404).json({ success: false, message: 'Industry not found.' })
  res.json({ success: true, data: industry.qualificationQuestions || [] })
})

router.get('/:slug/scoring', (req, res) => {
  const industry = getIndustry(req.params.slug)
  if (!industry) return res.status(404).json({ success: false, message: 'Industry not found.' })
  res.json({ success: true, data: industry.scoringRules || [] })
})

module.exports = router
