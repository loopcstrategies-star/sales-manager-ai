const Solution = require('../models/Solution')
const SolutionPackage = require('../models/SolutionPackage')
const { listSolutions, listPackages } = require('./industryCatalog')

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
}

async function ensureWorkspaceCatalog(user) {
  const workspaceId = user.workspaceId
  const ownerId = user._id
  const existingSolutions = await Solution.countDocuments({ workspaceId })
  if (!existingSolutions) {
    const defaults = listSolutions()
    if (defaults.length) {
      await Solution.insertMany(defaults.map((item) => ({
        workspaceId,
        ownerId,
        catalogKey: item.id,
        name: item.name,
        slug: item.slug || slugify(item.name),
        category: item.category || 'other',
        description: item.description || '',
        features: Array.isArray(item.features) ? item.features : [],
        industries: Array.isArray(item.targetIndustries) ? item.targetIndustries : [],
        businessTypes: Array.isArray(item.businessTypes) ? item.businessTypes : [],
        pricing: {
          amount: Number(item.pricing?.amount) || 0,
          cost: Number(item.pricing?.cost) || 0,
          currency: item.pricing?.currency || 'USD',
          model: item.pricing?.model || 'one-time',
        },
        salesNotes: item.salesNotes || '',
        proposalTemplate: item.proposalTemplate || '',
        deliveryNotes: item.deliveryNotes || '',
        status: 'active',
      })))
    }
  }

  const existingPackages = await SolutionPackage.countDocuments({ workspaceId })
  if (!existingPackages) {
    const defaults = typeof listPackages === 'function' ? listPackages() : []
    const packages = defaults.length ? defaults : require('../../shared/solutionPackages.json')
    if (packages.length) {
      await SolutionPackage.insertMany(packages.map((item) => ({
        workspaceId,
        ownerId,
        catalogKey: item.id,
        name: item.name,
        description: item.description || '',
        industrySlug: item.industrySlug || '',
        solutionIds: Array.isArray(item.solutionIds) ? item.solutionIds : [],
        price: Number(item.price) || 0,
        discount: Number(item.discount) || 0,
        currency: item.currency || 'USD',
        billingType: item.billingType || 'one-time',
        validityDays: Number(item.validityDays) || 30,
        status: 'active',
      })))
    }
  }
}

module.exports = {
  ensureWorkspaceCatalog,
  slugify,
}
