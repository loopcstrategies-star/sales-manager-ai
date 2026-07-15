/**
 * Score leads 0–100 vs jewelry / UAE-GCC ICP (rules + optional LLM nudge).
 */
const { createChatCompletion, isOpenAiConfigured } = require('./openAiClient')
const Lead = require('../models/Lead')
const { workspaceFilter } = require('./crmHelpers')

function ruleScoreLead(lead) {
  let score = 20
  const reasons = []

  if (lead.email) { score += 15; reasons.push('+email') }
  if (lead.phone) { score += 10; reasons.push('+phone') }
  if (lead.website) { score += 8; reasons.push('+website') }
  if (lead.title) { score += 5; reasons.push('+title') }

  const industry = String(lead.industry || '').toLowerCase()
  const company = String(lead.company || '').toLowerCase()
  const desc = String(lead.description || '').toLowerCase()
  const blob = `${industry} ${company} ${desc}`
  if (/\b(jewel|gold|silver|diamond|precious|metal|bullion|gem)\b/.test(blob)) {
    score += 20
    reasons.push('+ICP industry')
  }
  if (/\b(uae|dubai|abu dhabi|gcc|saudi|qatar|kuwait|oman|bahrain|middle east)\b/.test(blob)
    || /\b(uae|ae)\b/i.test(String(lead.address?.country || lead.state || ''))) {
    score += 15
    reasons.push('+region')
  }
  if (['Qualified', 'Working'].includes(lead.status)) {
    score += 10
    reasons.push(`+${lead.status}`)
  }
  if (lead.status === 'Unqualified') {
    score = Math.min(score, 25)
    reasons.push('capped Unqualified')
  }
  if (!lead.email && !lead.phone) {
    score -= 10
    reasons.push('-no contact')
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, reasons }
}

async function scoreLeadWithLlm(lead, base) {
  if (!isOpenAiConfigured()) return base
  try {
    const raw = await createChatCompletion(
      [
        {
          role: 'system',
          content: 'Score this B2B jewelry/precious-metals lead 0-100 for fit. Return ONLY JSON {"score":number,"reason":"short"}. Prefer UAE/GCC and metals wholesale.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            company: lead.company,
            name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
            industry: lead.industry,
            title: lead.title,
            status: lead.status,
            country: lead.address?.country || lead.state,
            hasEmail: Boolean(lead.email),
            ruleScore: base.score,
          }),
        },
      ],
      { temperature: 0.2, maxTokens: 120 },
    )
    const m = String(raw).match(/\{[\s\S]*\}/)
    if (!m) return base
    const parsed = JSON.parse(m[0])
    const llmScore = Number(parsed.score)
    if (Number.isNaN(llmScore)) return base
    const blended = Math.round((base.score * 0.6) + (Math.max(0, Math.min(100, llmScore)) * 0.4))
    return {
      score: blended,
      reasons: [...base.reasons, parsed.reason ? `llm:${parsed.reason}` : 'llm'],
    }
  } catch {
    return base
  }
}

async function scoreAndSaveLead(lead, { useLlm = false } = {}) {
  const base = ruleScoreLead(lead)
  const result = useLlm ? await scoreLeadWithLlm(lead, base) : base
  lead.aiScore = result.score
  lead.aiScoreReasons = result.reasons.join('; ').slice(0, 500)
  lead.aiScoredAt = new Date()
  await lead.save()
  return {
    id: String(lead._id),
    aiScore: lead.aiScore,
    reasons: result.reasons,
  }
}

async function scoreWorkspaceLeads(user, { cap = 40, useLlm = false } = {}) {
  const filter = {
    ...workspaceFilter(user),
    status: { $in: ['Open', 'Working', 'Qualified'] },
  }
  const leads = await Lead.find(filter).sort({ aiScoredAt: 1, updatedAt: -1 }).limit(cap)
  const results = []
  for (const lead of leads) {
    results.push(await scoreAndSaveLead(lead, { useLlm }))
  }
  return { scored: results.length, results }
}

module.exports = {
  ruleScoreLead,
  scoreAndSaveLead,
  scoreWorkspaceLeads,
}
