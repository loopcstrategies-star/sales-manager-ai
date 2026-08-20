const express = require('express')
const { protect } = require('../middleware/auth')
const Account = require('../models/Account')
const Contact = require('../models/Contact')
const Lead = require('../models/Lead')
const Opportunity = require('../models/Opportunity')
const { workspaceFilter } = require('../services/crmHelpers')
const { enrichFromQuery, applyAccountEnrichment } = require('../services/crmEnrichment')
const { findContactsForCompany } = require('../services/contactFind')
const { scoreCompanyOpportunity } = require('../services/industryScoring')
const { getIndustry } = require('../services/industryCatalog')
const { attachIndustryMetadata } = require('../services/industryRecord')

const router = express.Router()
router.use(protect)

function serializeIntelligence(account) {
  const scored = scoreCompanyOpportunity(account)
  return {
    companyId: String(account._id),
    companyName: account.name,
    website: account.website || '',
    industry: account.industry || '',
    industrySlug: account.industrySlug || '',
    businessType: account.businessType || account.type || '',
    location: {
      country: account.billingAddress?.country || '',
      city: account.billingAddress?.city || '',
      region: account.region || '',
    },
    description: account.description || '',
    companySize: account.researchSummary?.verifiedData?.companySize || account.researchSummary?.inferredData?.companySize || 'Unknown',
    websiteStatus: scored.facts.websiteStatus,
    ecommerceStatus: scored.facts.ecommerce,
    mobileAppStatus: scored.facts.mobileApp,
    socialPresence: scored.facts.socialPresence,
    technologyStack: account.researchSummary?.verifiedData?.technologyStack || account.researchSummary?.inferredData?.technologyStack || [],
    currentSoftware: account.researchSummary?.verifiedData?.currentSoftware || account.researchSummary?.inferredData?.currentSoftware || [],
    digitalOpportunityScore: scored.score,
    scoreGrade: scored.grade,
    researchConfidence: account.researchSummary?.confidence || 0,
    lastResearchedDate: account.researchSummary?.researchedAt || account.lastEnrichedAt || null,
    verifiedData: account.researchSummary?.verifiedData || {},
    inferredData: account.researchSummary?.inferredData || {},
    unknownData: account.researchSummary?.unknownData || [],
    aiSummary: {
      whatThisCompanyDoes: account.description || 'Unknown',
      visibleTechnology: Array.isArray(account.researchSummary?.inferredData?.technologyStack)
        ? account.researchSummary.inferredData.technologyStack.join(', ')
        : 'Unknown',
      digitalGaps: scored.missingInformation,
      recommendedSolutions: scored.recommendations.map((item) => item.name),
    },
    reasons: scored.reasons,
    strongestOpportunities: scored.strongestOpportunities,
    recommendations: scored.recommendations,
    opportunityScore: scored.opportunityScore ?? scored.score,
    confidenceScore: scored.confidenceScore ?? null,
    solutionFitScore: scored.solutionFitScore ?? null,
    scoreBreakdown: scored.scoreBreakdown || [],
    nextBestAction: scored.nextBestAction || null,
  }
}

router.get('/companies/search', async (req, res) => {
  try {
    const filter = { ...workspaceFilter(req.user) }
    const q = String(req.query.q || '').trim()
    const industry = String(req.query.industry || '').trim()
    const businessType = String(req.query.businessType || '').trim()
    const region = String(req.query.region || '').trim()
    if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    if (industry) filter.industrySlug = industry
    if (businessType) filter.businessType = businessType
    if (region) filter.region = region
    const items = await Account.find(filter).sort({ updatedAt: -1 }).limit(200).lean()
    res.json({ success: true, data: items.map((item) => serializeIntelligence(item)) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to search companies.' })
  }
})

router.get('/companies/:id/intelligence', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, ...workspaceFilter(req.user) }).lean()
    if (!account) return res.status(404).json({ success: false, message: 'Company not found.' })
    res.json({ success: true, data: serializeIntelligence(account) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load company intelligence.' })
  }
})

router.post('/companies/:id/research', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, ...workspaceFilter(req.user) })
    if (!account) return res.status(404).json({ success: false, message: 'Company not found.' })
    const query = [account.name, account.website, account.industry || account.type].filter(Boolean).join(' ')
    const result = await enrichFromQuery(query)
    applyAccountEnrichment(account, result.fields || {}, false)
    attachIndustryMetadata(account, {
      industry: result.fields?.industry || account.industry,
      type: account.type,
    }, { copyIndustryToType: true })
    await account.save()
    res.json({ success: true, data: serializeIntelligence(account.toObject()) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Research failed.' })
  }
})

router.post('/companies/:id/score', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, ...workspaceFilter(req.user) }).lean()
    if (!account) return res.status(404).json({ success: false, message: 'Company not found.' })
    const data = scoreCompanyOpportunity(account)
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Scoring failed.' })
  }
})

router.get('/companies/:id/recommendations', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, ...workspaceFilter(req.user) }).lean()
    if (!account) return res.status(404).json({ success: false, message: 'Company not found.' })
    const data = scoreCompanyOpportunity(account)
    res.json({ success: true, data: data.recommendations })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Recommendation load failed.' })
  }
})

router.get('/companies/:id/contacts', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, ...workspaceFilter(req.user) }).lean()
    if (!account) return res.status(404).json({ success: false, message: 'Company not found.' })
    const savedContacts = await Contact.find({ ...workspaceFilter(req.user), accountId: account._id }).lean()
    if (savedContacts.length) {
      return res.json({ success: true, data: savedContacts })
    }
    const industry = getIndustry(account.industrySlug || account.industryId || account.industry)
    const found = await findContactsForCompany({
      name: account.name,
      website: account.website,
      region: account.region,
      targetRoles: industry?.decisionMakerRoles || [],
    })
    res.json({ success: true, data: found.people || [], meta: { sources: found.sources || [] } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Contact lookup failed.' })
  }
})

router.post('/leads/from-company', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.body.companyId, ...workspaceFilter(req.user) })
    if (!account) return res.status(404).json({ success: false, message: 'Company not found.' })
    const created = await Lead.create({
      lastName: req.body.lastName || 'Prospect',
      firstName: req.body.firstName || '',
      company: account.name,
      website: account.website || '',
      industry: account.industry || '',
      industryId: account.industryId || '',
      industrySlug: account.industrySlug || '',
      businessType: account.businessType || '',
      description: account.description || '',
      phone: account.phone || '',
      address: account.billingAddress || {},
      leadSource: 'Company Intelligence',
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    res.status(201).json({ success: true, data: created })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Lead create failed.' })
  }
})

router.post('/opportunities/from-company', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.body.companyId, ...workspaceFilter(req.user) })
    if (!account) return res.status(404).json({ success: false, message: 'Company not found.' })
    const scored = scoreCompanyOpportunity(account.toObject())
    const created = await Opportunity.create({
      name: req.body.name || `${account.name} - Opportunity`,
      accountId: account._id,
      industryId: account.industryId || '',
      industrySlug: account.industrySlug || '',
      businessType: account.businessType || '',
      description: account.description || '',
      score: scored.score,
      scoreGrade: scored.grade,
      scoreReasons: scored.reasons,
      strongestOpportunities: scored.strongestOpportunities,
      missingInformation: scored.missingInformation,
      recommendedSolutionIds: scored.recommendations.map((item) => item.solutionId),
      workspaceId: req.user.workspaceId,
      ownerId: req.user._id,
    })
    res.status(201).json({ success: true, data: created })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Opportunity create failed.' })
  }
})

module.exports = router
