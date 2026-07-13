const Lead = require('../models/Lead')
const Account = require('../models/Account')
const {
  enrichFromQuery,
  applyLeadEnrichment,
  applyAccountEnrichment,
} = require('../services/crmEnrichment')
const { isSearchConfigured } = require('../services/webSearch')

let intervalId = null
let running = false

function staleCutoff(days = 30) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

async function enrichStaleCollection(Model, applyFn, buildQuery, { workspaceId, cap, cutoff }) {
  const filter = {
    $and: [
      {
        $or: [
          { lastEnrichedAt: null },
          { lastEnrichedAt: { $lt: cutoff } },
          { lastEnrichedAt: { $exists: false } },
        ],
      },
      {
        $or: [
          { website: { $exists: true, $nin: [null, ''] } },
          ...(Model.modelName === 'Lead'
            ? [{ company: { $exists: true, $nin: [null, ''] } }]
            : [{ name: { $exists: true, $nin: [null, ''] } }]),
        ],
      },
    ],
  }
  if (workspaceId) filter.workspaceId = workspaceId

  const docs = await Model.find(filter).sort({ lastEnrichedAt: 1 }).limit(cap)
  let enriched = 0
  let failed = 0

  for (const doc of docs) {
    try {
      const query = buildQuery(doc)
      if (!query) continue
      const result = await enrichFromQuery(query)
      applyFn(doc, result.fields, false)
      await doc.save()
      enriched += 1
    } catch {
      failed += 1
    }
  }

  return { scanned: docs.length, enriched, failed }
}

async function runCrmEnrichRefresh(options = {}) {
  if (!isSearchConfigured()) {
    return { skipped: true, reason: 'search_not_configured' }
  }
  if (running && !options.force) {
    return { skipped: true, reason: 'already_running' }
  }

  running = true
  const cap = Math.max(1, Math.min(Number(options.cap) || Number(process.env.CRM_ENRICH_REFRESH_CAP) || 50, 100))
  const days = Number(options.days) || Number(process.env.CRM_ENRICH_STALE_DAYS) || 30
  const cutoff = staleCutoff(days)
  const perType = Math.max(1, Math.floor(cap / 2))

  try {
    const leads = await enrichStaleCollection(
      Lead,
      applyLeadEnrichment,
      (d) => [d.company, d.website, d.industry].filter(Boolean).join(' '),
      { workspaceId: options.workspaceId, cap: perType, cutoff },
    )
    const accounts = await enrichStaleCollection(
      Account,
      applyAccountEnrichment,
      (d) => [d.name, d.website, d.type].filter(Boolean).join(' '),
      { workspaceId: options.workspaceId, cap: perType, cutoff },
    )

    const summary = {
      cutoff: cutoff.toISOString(),
      cap,
      leads,
      accounts,
      totalEnriched: leads.enriched + accounts.enriched,
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
    runCrmEnrichRefresh().catch((err) => console.error('[crmEnrichRefresh]', err.message))
  }, 60_000)
  intervalId = setInterval(() => {
    runCrmEnrichRefresh().catch((err) => console.error('[crmEnrichRefresh]', err.message))
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
