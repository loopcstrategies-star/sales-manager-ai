const User = require('../models/User')
const { createOrRefreshDigest } = require('../services/dailyDigest')

function hoursMs(h) {
  return Math.max(1, Number(h) || 24) * 60 * 60 * 1000
}

async function runDailyDigestJob() {
  const users = await User.find({}).select('_id workspaceId name email').limit(200).lean()
  let ok = 0
  let fail = 0
  for (const user of users) {
    if (!user.workspaceId) continue
    try {
      await createOrRefreshDigest(user)
      ok += 1
    } catch (err) {
      fail += 1
      console.error('[dailyDigest] user failed:', user._id, err.message)
    }
  }
  console.log(`[dailyDigest] refreshed ${ok} digests (${fail} failed)`)
  return { ok, fail }
}

function startDailyDigestJob() {
  const hours = Number(process.env.CRM_DAILY_DIGEST_HOURS || 24)
  const run = () => runDailyDigestJob().catch((err) => console.error('[dailyDigest]', err.message))
  // First run after 2 minutes, then on interval
  setTimeout(run, 2 * 60 * 1000)
  setInterval(run, hoursMs(hours))
  console.log(`[dailyDigest] job scheduled every ${hours}h`)
}

module.exports = { startDailyDigestJob, runDailyDigestJob }
