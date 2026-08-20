/**
 * Score leads 0-100 using industry-aware rules with optional LLM nudge.
 */
const { createChatCompletion, isOpenAiConfigured } = require('./openAiClient')
const Lead = require('../models/Lead')
const { workspaceFilter } = require('./crmHelpers')
const { scoreCompanyOpportunity } = require('./industryScoring')
const { normalizeIndustryFields } = require('./industryRecord')

function ruleScoreLead(lead) {
  const opportunity = scoreCompanyOpportunity(lead)
  let score = Math.max(10, opportunity.score)
  const reasons = [...(opportunity.reasons || [])]

  if (lead.email) { score += 12; reasons.push('+email') }
  if (lead.phone) { score += 8; reasons.push('+phone') }
  if (lead.website) { score += 6; reasons.push('+website') }
  if (lead.title) { score += 4; reasons.push('+title') }
  if (['Qualified', 'Working'].includes(lead.status)) {
    score += 8
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

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons }
}

async function scoreLeadWithLlm(lead, base) {
  if (!isOpenAiConfigured()) return base
  const normalized = normalizeIndustryFields(lead)
  try {
    const raw = await createChatCompletion(
      [
        {
          role: 'system',
          content: 'Score this B2B lead 0-100 for fit based on the provided industry and visible digital opportunity. Return ONLY JSON {"score":number,"reason":"short"}. Do not invent facts.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            company: lead.company,
            name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
            industry: normalized.industry || lead.industry,
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
