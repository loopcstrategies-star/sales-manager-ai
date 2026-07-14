const mongoose = require('mongoose')
const Account = require('../models/Account')
const Contact = require('../models/Contact')
const { findContactsForCompany, isStubContact } = require('./contactFind')
const { resolveCountry, normalizeRegionLabel } = require('./prospectQuality')
const { isSearchConfigured } = require('./webSearch')
const { isOpenAiConfigured } = require('./openAiClient')
const { getAggregatedSalesJobPrefs, DEFAULT_SALES } = require('./userPreferences')

function applyAccountGeo(account, { website, region } = {}) {
  const regionLabel = normalizeRegionLabel(region || account.region)
  if (regionLabel && !String(account.region || '').trim()) {
    account.region = regionLabel
  }

  const billing = { ...(account.billingAddress?.toObject?.() || account.billingAddress || {}) }
  const country = resolveCountry({
    website: website || account.website,
    region: regionLabel || account.region,
    existingCountry: billing.country,
  })
  if (country && !String(billing.country || '').trim()) {
    billing.country = country
    account.billingAddress = billing
  }
  return account
}

async function accountHasRealEmailedContact(filter, accountId) {
  const contacts = await Contact.find({ ...filter, accountId })
    .select('email lastName firstName source')
    .limit(30)
    .lean()
  return contacts.some((c) => {
    const email = String(c.email || '').trim()
    return email && !isStubContact(c)
  })
}

async function savePeopleToAccount({
  filter,
  account,
  found,
  region,
  maxContacts = 5,
  needsVerify = true,
  source = 'web_llm',
  workspaceId,
  ownerId,
}) {
  let created = 0
  let skipped = 0

  applyAccountGeo(account, {
    website: account.website,
    region: account.region || region,
  })
  if (found.companyPhone && !account.phone) {
    account.phone = String(found.companyPhone).slice(0, 60)
  }
  await account.save()

  const acctCountry = String(account.billingAddress?.country || '').trim()
  const note = source === 'hunter'
    ? 'Found via Hunter.io domain search. Confirm before outreach.'
    : 'Found via web+LLM from public snippets. Verify before outreach.'
  const people = (found.people || []).slice(0, Math.max(1, Math.min(15, Number(maxContacts) || 5)))

  for (const person of people) {
    const email = String(person.email || '').trim().toLowerCase()
    const lastName = String(person.lastName || 'Contact').trim()
    const firstName = String(person.firstName || '').trim()
    if (email) {
      const existingEmail = await Contact.findOne({ ...filter, accountId: account._id, email })
      if (existingEmail) {
        skipped += 1
        continue
      }
    } else {
      const existingName = await Contact.findOne({
        ...filter,
        accountId: account._id,
        lastName,
        firstName,
      })
      if (existingName) {
        skipped += 1
        continue
      }
    }

    await Contact.create({
      firstName: firstName.slice(0, 100),
      lastName: lastName.slice(0, 100),
      email: email.slice(0, 200),
      phone: String(person.phone || '').slice(0, 60),
      title: String(person.title || '').slice(0, 120),
      accountId: account._id,
      description: note,
      mailingAddress: acctCountry ? { country: acctCountry } : {},
      source,
      needsVerify: Boolean(needsVerify),
      workspaceId,
      ownerId,
      lastEnrichedAt: new Date(),
    })
    created += 1
  }

  return { created, skipped }
}

/**
 * Find contacts for thin (or selected) accounts in a workspace.
 */
async function runThinAccountFind(options = {}) {
  const {
    workspaceId,
    ownerId,
    accountIds = null,
    thinOnly = true,
    region = '',
    cap = DEFAULT_SALES.batchFindCap,
    maxContacts = DEFAULT_SALES.findContactsMax,
    needsVerify = DEFAULT_SALES.findContactsNeedsVerify,
  } = options

  if (!workspaceId || !ownerId) {
    return { skipped: true, reason: 'missing_workspace_or_owner' }
  }
  if (!isSearchConfigured() || !isOpenAiConfigured()) {
    return { skipped: true, reason: 'search_or_llm_not_configured' }
  }

  const filter = { workspaceId }
  let accounts
  if (Array.isArray(accountIds) && accountIds.length) {
    const ids = accountIds
      .map((id) => {
        try {
          return new mongoose.Types.ObjectId(String(id))
        } catch {
          return null
        }
      })
      .filter(Boolean)
    accounts = await Account.find({ ...filter, _id: { $in: ids } }).limit(Math.min(ids.length, 100))
  } else {
    accounts = await Account.find(filter).sort({ updatedAt: -1 }).limit(200)
  }

  const limit = Math.max(1, Math.min(50, Number(cap) || 25))
  const summary = {
    accountsProcessed: 0,
    contactsCreated: 0,
    contactsSkipped: 0,
    skipped: 0,
    errors: [],
    region,
    thinOnly,
    cap: limit,
  }

  for (const account of accounts) {
    if (summary.accountsProcessed >= limit) break
    if (!account.website && !account.name) {
      summary.skipped += 1
      continue
    }
    if (thinOnly) {
      const hasReal = await accountHasRealEmailedContact(filter, account._id)
      if (hasReal) {
        summary.skipped += 1
        continue
      }
    }

    try {
      if (region) {
        applyAccountGeo(account, { website: account.website, region })
        await account.save()
      }
      const found = await findContactsForCompany({
        name: account.name,
        website: account.website,
        region: region || account.region,
      })
      summary.accountsProcessed += 1
      if (!found.ok) {
        summary.errors.push({ accountId: account._id, name: account.name, message: found.error })
        continue
      }
      const result = await savePeopleToAccount({
        filter,
        account,
        found,
        region: region || account.region,
        maxContacts,
        needsVerify,
        source: 'web_llm',
        workspaceId,
        ownerId,
      })
      summary.contactsCreated += result.created
      summary.contactsSkipped += result.skipped
    } catch (e) {
      summary.errors.push({ accountId: account._id, name: account.name, message: e.message || 'Failed' })
    }
  }

  return summary
}

/**
 * Job runner: process thin accounts across workspaces for users who enabled scheduled find.
 */
async function runScheduledThinAccountFind(options = {}) {
  const jobPrefs = options.jobPrefs || await getAggregatedSalesJobPrefs()
  if (!jobPrefs.scheduledFindEnabled && !options.force) {
    return { skipped: true, reason: 'disabled_by_sales_settings' }
  }
  if (!isSearchConfigured() || !isOpenAiConfigured()) {
    return { skipped: true, reason: 'search_or_llm_not_configured' }
  }

  const User = require('../models/User')
  const users = await User.find({}).select('_id workspaceId').lean()
  if (!users.length) {
    return { skipped: true, reason: 'no_users' }
  }

  const byWorkspace = new Map()
  for (const u of users) {
    if (!u.workspaceId) continue
    const key = String(u.workspaceId)
    if (!byWorkspace.has(key)) byWorkspace.set(key, u)
  }

  const totals = {
    workspaces: 0,
    accountsProcessed: 0,
    contactsCreated: 0,
    contactsSkipped: 0,
    skipped: 0,
    errors: 0,
  }

  for (const [wsKey, user] of byWorkspace) {
    const prefs = jobPrefs
    const summary = await runThinAccountFind({
      workspaceId: user.workspaceId,
      ownerId: user._id,
      thinOnly: true,
      region: prefs.defaultProspectRegion || '',
      cap: prefs.batchFindCap,
      maxContacts: prefs.findContactsMax,
      needsVerify: prefs.findContactsNeedsVerify !== false,
      ...options,
    })
    if (summary.skipped && summary.reason) continue
    totals.workspaces += 1
    totals.accountsProcessed += summary.accountsProcessed || 0
    totals.contactsCreated += summary.contactsCreated || 0
    totals.contactsSkipped += summary.contactsSkipped || 0
    totals.skipped += summary.skipped || 0
    totals.errors += (summary.errors || []).length
  }

  console.log('[thinAccountFind]', JSON.stringify(totals))
  return totals
}

module.exports = {
  accountHasRealEmailedContact,
  savePeopleToAccount,
  runThinAccountFind,
  runScheduledThinAccountFind,
}
