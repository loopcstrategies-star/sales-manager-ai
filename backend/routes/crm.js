const express = require('express')
const { protect } = require('../middleware/auth')
const Account = require('../models/Account')
const Contact = require('../models/Contact')
const Opportunity = require('../models/Opportunity')
const Case = require('../models/Case')
const Campaign = require('../models/Campaign')
const Lead = require('../models/Lead')
const { workspaceFilter } = require('../services/crmHelpers')

const router = express.Router()
router.use(protect)

router.get('/stats', async (req, res) => {
  try {
    const filter = workspaceFilter(req.user)
    const [
      accounts,
      contacts,
      openLeads,
      openDeals,
      openCases,
      campaigns,
      recentAccounts,
      recentContacts,
    ] = await Promise.all([
      Account.countDocuments(filter),
      Contact.countDocuments(filter),
      Lead.countDocuments({ ...filter, status: { $in: ['Open', 'Working'] } }),
      Opportunity.countDocuments({
        ...filter,
        stage: { $nin: ['Closed Won', 'Closed Lost'] },
      }),
      Case.countDocuments({ ...filter, status: { $ne: 'Closed' } }),
      Campaign.countDocuments(filter),
      Account.find(filter).sort({ updatedAt: -1 }).limit(5).select('name phone website updatedAt').lean(),
      Contact.find(filter)
        .sort({ updatedAt: -1 })
        .limit(5)
        .populate('accountId', 'name')
        .select('firstName lastName email title accountId updatedAt')
        .lean(),
    ])

    res.json({
      success: true,
      data: {
        counts: { accounts, contacts, openLeads, openDeals, openCases, campaigns },
        recentAccounts,
        recentContacts: recentContacts.map((c) => ({
          ...c,
          fullName: [c.firstName, c.lastName].filter(Boolean).join(' ').trim(),
          accountName: c.accountId?.name || '',
          accountId: c.accountId?._id || c.accountId || null,
        })),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load CRM stats.' })
  }
})

module.exports = router
