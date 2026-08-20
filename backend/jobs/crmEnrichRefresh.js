const Lead = require('../models/Lead')
const Account = require('../models/Account')
const Contact = require('../models/Contact')
const {
  enrichFromQuery,
  applyLeadEnrichment,
  applyAccountEnrichment,
  applyContactEnrichment,
} = require('../services/crmEnrichment')
const { isSearchConfigured } = require('../services/webSearch')
const { getAggregatedSalesJobPrefs } = require('../services/userPreferences')

let intervalId = null
let running = false

function staleCutoff(days = 30) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

function isBlank(value) {
  return !String(value || '').trim()
}

function needsFillEmpty(Model, doc) {
  if (Model.modelName === 'Lead') {
    return isBlank(doc.website) || isBlank(doc.phone) || isBlank(doc.description) || isBlank(doc.industry)
  }
  if (Model.modelName === 'Account') {
    return isBlank(doc.website) || isBlank(doc.phone) || isBlank(doc.description)
  }
  if (Model.modelName === 'Contact') {
    return isBlank(doc.phone) || isBlank(doc.title) || isBlank(doc.description) || isBlank(doc.email)
  }
  return false
}

function buildCollectionFilter(Model, { workspaceId, mode, cutoff }) {
  const filter = { $and: [] }
  if (workspaceId) filter.workspaceId = workspaceId

  if (mode === 'stale') {
    filter.$and.push({
      $or: [
        { lastEnrichedAt: null },
        { lastEnrichedAt: { $lt: cutoff } },
        { lastEnrichedAt: { $exists: false } },
      ],
    })
  }

  if (Model.modelName === 'Contact') {
    filter.$and.push({
      $or: [
        { email: { $exists: true, $nin: [null, ''] } },
        { title: { $exists: true, $nin: [null, ''] } },
        { lastName: { $exists: true, $nin: [null, ''] } },
      ],
    })
  } else {
    filter.$and.push({
      $or: [
        { website: { $exists: true, $nin: [null, ''] } },
        ...(Model.modelName === 'Lead'
          ? [{ company: { $exists: true, $nin: [null, ''] } }]
          : [{ name: { $exists: true, $nin: [null, ''] } }]),
      ],
    })
  }

  if (!filter.$and.length) delete filter.$and
  return filter
}

async function enrichCollection(Model, applyFn, buildQuery, {
  workspaceId,
  cap,
  cutoff,
  overwrite,
  mode,
}) {
  const filter = buildCollectionFilter(Model, { workspaceId, mode, cutoff })
  let docs = await Model.find(filter).sort({ lastEnrichedAt: 1 }).limit(Math.max(cap * 3, cap))
  if (mode === 'fillEmpty') {
    docs = docs.filter((doc) => needsFillEmpty(Model, doc)).slice(0, cap)
  } else {
    docs = docs.slice(0, cap)
  }

  let enriched = 0
  let failed = 0
  let skipped = 0

  for (const doc of docs) {
    try {
      const query = buildQuery(doc)
      if (!query) {
        skipped += 1
        continue
      }
      const result = await enrichFromQuery(query)
      applyFn(doc, result.fields, overwrite)
      await doc.save()
      enriched += 1
    } catch {
      failed += 1
    }
  }

  return { scanned: docs.length, enriched, failed, skipped }
}

async function runCrmEnrichRefresh(options = {}) {
  if (!isSearchConfigured()) {
    return { skipped: true, reason: 'search_not_configured' }
  }
  if (running && !options.force) {
    return { skipped: true, reason: 'already_running' }
  }

  const jobPrefs = options.jobPrefs || await getAggregatedSalesJobPrefs()
  if (jobPrefs.enrichRefreshEnabled === false && !options.force) {
    return { skipped: true, reason: 'disabled_by_sales_settings' }
  }

  running = true
  const mode = ['stale', 'fillEmpty', 'force'].includes(options.mode) ? options.mode : 'stale'
  const includeContacts = options.includeContacts !== false
  const cap = Math.max(1, Math.min(Number(options.cap) || Number(process.env.CRM_ENRICH_REFRESH_CAP) || 50, 100))
  const days = Number(options.days)
    || Number(jobPrefs.enrichStaleDays)
    || Number(process.env.CRM_ENRICH_STALE_DAYS)
    || 30
  const overwrite = options.overwrite === true
    ? true
    : (mode === 'force' ? false : jobPrefs.enrichFillEmptyOnly === false)
  const cutoff = mode === 'force' ? new Date() : staleCutoff(days)
  const parts = includeContacts ? 3 : 2
  const perType = Math.max(1, Math.floor(cap / parts))

  try {
    const leads = await enrichCollection(
      Lead,
      applyLeadEnrichment,
      (d) => [d.company, d.website, d.industry].filter(Boolean).join(' '),
      { workspaceId: options.workspaceId, cap: perType, cutoff, overwrite, mode },
    )
    const accounts = await enrichCollection(
      Account,
      applyAccountEnrichment,
      (d) => [d.name, d.website, d.type].filter(Boolean).join(' '),
      { workspaceId: options.workspaceId, cap: perType, cutoff, overwrite, mode },
    )
    let contacts = { scanned: 0, enriched: 0, failed: 0, skipped: 0 }
    if (includeContacts) {
      contacts = await enrichCollection(
        Contact,
        applyContactEnrichment,
        (d) => [d.firstName, d.lastName, d.title, d.email].filter(Boolean).join(' '),
        { workspaceId: options.workspaceId, cap: perType, cutoff, overwrite, mode },
      )
    }

    const totalEnriched = leads.enriched + accounts.enriched + contacts.enriched
    const summary = {
      mode,
      cutoff: cutoff.toISOString(),
      cap,
      days,
      overwrite,
      includeContacts,
      leads,
      accounts,
      contacts,
      totalEnriched,
      moreRemain: totalEnriched >= cap || (leads.scanned + accounts.scanned + contacts.scanned) >= cap,
    }
    console.log('[crmEnrichRefresh]', JSON.stringify(summary))
    return summary
  } finally {
    running = false
  }
}

function startCrmEnrichRefreshJob() {
  if (intervalId) return
  if (String(process.env.CRM_ENRICH_REFRESH_ENABLED || 'true').toLowerCase() === 'false') {
    console.log('[crmEnrichRefresh] disabled (CRM_ENRICH_REFRESH_ENABLED=false)')
    return
  }
  if (!isSearchConfigured()) {
    console.log('[crmEnrichRefresh] skipped until search API key is configured')
    return
  }

  const hours = Math.max(1, Number(process.env.CRM_ENRICH_REFRESH_HOURS) || 24)
  const ms = hours * 60 * 60 * 1000
  console.log(`[crmEnrichRefresh] scheduled every ${hours}h (cap ${process.env.CRM_ENRICH_REFRESH_CAP || 50})`)

  setTimeout(() => {
    runCrmEnrichRefresh({ mode: 'stale', includeContacts: true })
      .catch((err) => console.error('[crmEnrichRefresh]', err.message))
  }, 60_000)
  intervalId = setInterval(() => {
    runCrmEnrichRefresh({ mode: 'stale', includeContacts: true })
      .catch((err) => console.error('[crmEnrichRefresh]', err.message))
  }, ms)
}

function stopCrmEnrichRefreshJob() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

module.exports = {
  runCrmEnrichRefresh,
  startCrmEnrichRefreshJob,
  stopCrmEnrichRefreshJob,
}
