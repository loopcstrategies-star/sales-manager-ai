const User = require('../models/User')
const { scoreWorkspaceLeads } = require('../services/leadScore')

function hoursMs(h) {
  return Math.max(1, Number(h) || 24) * 60 * 60 * 1000
}

async function runLeadScoreJob() {
  const users = await User.find({}).select('_id workspaceId').limit(100).lean()
  const seen = new Set()
  let scored = 0
  for (const u of users) {
    const key = String(u.workspaceId || '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    try {
      const r = await scoreWorkspaceLeads(u, { cap: 50, useLlm: false })
      scored += r.scored
    } catch (err) {
      console.error('[leadScore] failed:', key, err.message)
    }
  }
  console.log(`[leadScore] scored ${scored} leads`)
  return { scored }
}

function startLeadScoreJob() {
  const hours = Number(process.env.CRM_LEAD_SCORE_HOURS || 24)
  const run = () => runLeadScoreJob().catch((err) => console.error('[leadScore]', err.message))
  setTimeout(run, 4 * 60 * 1000)
  setInterval(run, hoursMs(hours))
  console.log(`[leadScore] job scheduled every ${hours}h`)
}

module.exports = { startLeadScoreJob, runLeadScoreJob }
