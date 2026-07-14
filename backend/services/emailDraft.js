const { createChatCompletion, isOpenAiConfigured } = require('./openAiClient')

function extractJsonObject(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : raw
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

/**
 * Draft a B2B outreach email for a Lead or Contact using Groq/OpenAI.
 */
async function draftOutreachEmail({
  kind = 'contact',
  person = {},
  company = '',
  context = '',
  tone = 'professional',
} = {}) {
  if (!isOpenAiConfigured()) {
    return {
      ok: false,
      error: 'GROQ_API_KEY or OPENAI_API_KEY is required for email drafts.',
      subject: '',
      body: '',
    }
  }

  const name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim()
    || person.fullName
    || 'there'
  const title = String(person.title || '').trim()
  const email = String(person.email || '').trim()

  const system = [
    'You write short B2B sales outreach emails for jewelry and precious metals wholesale.',
    'Return ONLY valid JSON: {"subject":"","body":""}',
    'Rules:',
    '- 120–180 words max in the body.',
    '- No inventing facts, prices, or inventory.',
    '- Include a clear soft CTA (call/meeting/reply).',
    '- Plain text only (no HTML).',
    `- Tone: ${tone || 'professional'}.`,
  ].join('\n')

  const user = [
    `Recipient name: ${name}`,
    title ? `Title: ${title}` : null,
    company ? `Company: ${company}` : null,
    email ? `Email: ${email}` : null,
    context ? `Extra context: ${String(context).slice(0, 800)}` : null,
    '',
    'Write one email subject + body.',
  ].filter(Boolean).join('\n')

  let raw
  try {
    raw = await createChatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { temperature: 0.5, maxTokens: 700, retryOnRateLimit: true },
    )
  } catch (err) {
    return { ok: false, error: err.message || 'LLM failed', subject: '', body: '' }
  }

  const parsed = extractJsonObject(raw)
  if (!parsed) {
    return { ok: false, error: 'Could not parse email draft JSON.', subject: '', body: '', raw }
  }

  return {
    ok: true,
    error: null,
    to: email,
    subject: String(parsed.subject || '').trim().slice(0, 200),
    body: String(parsed.body || '').trim().slice(0, 5000),
    kind,
  }
}

/** Default win probability by pipeline stage (0–100). */
const STAGE_PROBABILITY = {
  Prospecting: 10,
  Qualification: 25,
  Proposal: 50,
  Negotiation: 75,
  'Closed Won': 100,
  'Closed Lost': 0,
}

function probabilityForOpportunity(opp) {
  if (opp == null) return 0
  if (opp.probability != null && opp.probability !== '' && !Number.isNaN(Number(opp.probability))) {
    return Math.max(0, Math.min(100, Number(opp.probability)))
  }
  return STAGE_PROBABILITY[opp.stage] ?? 10
}

function weightedAmount(opp) {
  const amount = Number(opp.amount) || 0
  return Math.round(amount * (probabilityForOpportunity(opp) / 100))
}

module.exports = {
  draftOutreachEmail,
  STAGE_PROBABILITY,
  probabilityForOpportunity,
  weightedAmount,
  extractJsonObject,
}
