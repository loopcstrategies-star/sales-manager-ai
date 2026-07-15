const { requestChatCompletion, getModel, getLlmProviderLabel, isOpenAiConfigured } = require('../openAiClient')
const { CRM_TOOL_DEFINITIONS, executeCrmTool } = require('./crmTools')
const { normalizeHistory } = require('./openAiStrategyAgent')

const CRM_INTENT_RE = /\b(crm|pipeline|opportunit|deal|lead|account|contact|task|follow[- ]?up|my (stats|numbers|pipeline)|draft (an )?email|enrich|create (a )?(lead|task)|how many|what deals|close this month)\b/i

function looksLikeCrmRequest(message) {
  return CRM_INTENT_RE.test(String(message || ''))
}

function buildCrmSystemPrompt() {
  return [
    'You are Sales Manager AI — a CRM-connected sales copilot for jewelry and precious metals wholesale.',
    'You can call tools to read and update the user\'s live CRM data.',
    'Prefer tools over guessing when the question is about their leads, pipeline, accounts, or tasks.',
    'After tools return, summarize clearly in markdown with ## headings and short bullets.',
    'When you create or update records, confirm what you did and include key IDs/names.',
    'If a tool fails, explain the error and suggest a manual next step.',
    'Do not invent CRM records that are not in tool results.',
  ].join('\n')
}

function detectFastIntent(raw) {
  const text = String(raw || '').toLowerCase()
  // Order matters: stats chip mentions "open leads" — match stats before leads
  if (/\b(crm stats|my stats|tasks due this week)\b/.test(text)
    || (/\bhow many\b/.test(text) && /\b(lead|account|deal|contact)\b/.test(text))) {
    return 'stats'
  }
  if (/\b(score (my |these )?leads?|ai score)\b/.test(text)) return 'score_leads'
  if (/\b(summarize (this|the) (record|lead|account|contact|opportunit|deal)|summarize this)\b/.test(text)) {
    return 'summarize_record'
  }
  if (/\b(draft (an? )?email|email this|outreach)\b/.test(text) && /\b(this|current|lead|contact)\b/.test(text)) {
    return 'draft_current'
  }
  if (/\benrich\b/.test(text) && /\b(this|current|lead|account)\b/.test(text)) return 'enrich_current'
  if (/\b(pipeline|open deals|opportunit|deals by stage)\b/.test(text)
    && !/\b(summarize this|draft|enrich)\b/.test(text)) {
    return 'pipeline'
  }
  if (/\b(my leads|list my open|who to call|open crm leads)\b/.test(text)
    || (/\bleads?\b/.test(text) && /\b(list|suggest|call first)\b/.test(text))) {
    return 'leads'
  }
  if (/\bcreate\b/.test(text) && /\b(task|follow[- ]?up)\b/.test(text)) return 'create_task'
  if (/\bfollow[- ]?up\b/.test(text) && /\btask\b/.test(text)) return 'create_task'
  return null
}

function parseRecordRef(recordContext) {
  const raw = String(recordContext || '').trim()
  // Structured: leads:ObjectId
  const structured = raw.match(/^(leads|accounts|contacts|opportunities|pipeline):([a-f0-9]{24})$/i)
  if (structured) {
    const type = structured[1].toLowerCase() === 'pipeline' ? 'opportunities' : structured[1].toLowerCase()
    return { objectType: type, id: structured[2] }
  }
  // Display: Lead abc... / Opportunity abc...
  const labeled = raw.match(/^(Lead|Account|Contact|Opportunity)\s+([a-f0-9]{24})$/i)
  if (labeled) {
    const map = {
      lead: 'leads',
      account: 'accounts',
      contact: 'contacts',
      opportunity: 'opportunities',
    }
    return { objectType: map[labeled[1].toLowerCase()], id: labeled[2] }
  }
  return null
}

function formatRecordSummary(rec) {
  if (!rec || rec.error) return `## Record\n${rec?.error || 'Not found.'}`
  if (rec.objectType === 'leads') {
    return [
      '## Lead summary',
      `- **${rec.name || '—'}** @ ${rec.company || '—'}`,
      `- Status: ${rec.status || '—'}`,
      `- Email: ${rec.email || '—'} · Phone: ${rec.phone || '—'}`,
      `- Website: ${rec.website || '—'} · Industry: ${rec.industry || '—'}`,
      `- AI score: ${rec.aiScore != null ? `${rec.aiScore}/100` : '—'}`,
      rec.description ? `- Notes: ${String(rec.description).slice(0, 240)}` : '',
      '',
      '**Suggested:** Draft outreach if email exists, or Enrich / Score.',
    ].filter(Boolean).join('\n')
  }
  if (rec.objectType === 'accounts') {
    return [
      '## Account summary',
      `- **${rec.name}**`,
      `- Website: ${rec.website || '—'} · Phone: ${rec.phone || '—'}`,
      `- Type: ${rec.type || '—'} · Region: ${rec.region || '—'}`,
      '',
      '**Suggested:** Find contacts, Enrich from web, or New Opportunity.',
    ].join('\n')
  }
  if (rec.objectType === 'contacts') {
    return [
      '## Contact summary',
      `- **${rec.name}** (${rec.title || 'no title'})`,
      `- Account: ${rec.account || '—'}`,
      `- Email: ${rec.email || '—'} · Phone: ${rec.phone || '—'}`,
      '',
      '**Suggested:** Draft email if an address is on file.',
    ].join('\n')
  }
  return [
    '## Opportunity summary',
    `- **${rec.name}** — ${rec.stage || '—'} · ${formatMoney(rec.amount)}`,
    `- Account: ${rec.account || '—'}`,
    `- Close: ${rec.closeDate || '—'} · Next: ${rec.nextStep || '—'}`,
    '',
    '**Suggested:** Set next step or create a follow-up task.',
  ].join('\n')
}

async function runFastPath(user, intent, recordRef = null) {
  const toolsUsed = []
  if (intent === 'pipeline') {
    const data = await executeCrmTool('list_pipeline', { limit: 30 }, user)
    toolsUsed.push('list_pipeline')
    return { reply: replyPipeline(data), toolsUsed, status: 'Listed pipeline' }
  }
  if (intent === 'leads') {
    const data = await executeCrmTool('list_leads', { limit: 20 }, user)
    toolsUsed.push('list_leads')
    return { reply: replyLeads(data), toolsUsed, status: 'Listed leads' }
  }
  if (intent === 'stats') {
    const data = await executeCrmTool('get_crm_stats', {}, user)
    toolsUsed.push('get_crm_stats')
    return { reply: replyStats(data), toolsUsed, status: 'Loaded CRM stats' }
  }
  if (intent === 'score_leads') {
    const sales = (await require('../userPreferences').getUserPreferences(user._id)).sales
    const useLlm = sales?.useLlmScoring === true
    if (recordRef?.objectType === 'leads' && recordRef.id) {
      const data = await executeCrmTool('score_leads', { id: recordRef.id, useLlm }, user)
      toolsUsed.push('score_leads')
      return {
        reply: data.error
          ? `## Score\n${data.error}`
          : `## Lead scored\n- Score: **${data.aiScore}/100**\n- Reasons: ${Array.isArray(data.reasons) ? data.reasons.join('; ') : (data.reasons || '—')}`,
        toolsUsed,
        status: 'Scored lead',
      }
    }
    const data = await executeCrmTool('score_leads', { cap: 40, useLlm }, user)
    toolsUsed.push('score_leads')
    return {
      reply: [
        '## Lead scoring',
        `Scored **${data.scored || 0}** open lead(s)${useLlm ? ' (rules + LLM)' : ' (rules)'}.`,
        'Open **Leads** to see the AI Score column.',
      ].join('\n'),
      toolsUsed,
      status: 'Scored leads',
    }
  }
  if (intent === 'summarize_record') {
    if (!recordRef?.id) {
      return {
        reply: '## Summarize\nOpen a Lead, Account, Contact, or Opportunity detail page, then click **Summarize this**.',
        toolsUsed,
        status: 'Need record context',
      }
    }
    const data = await executeCrmTool('get_record', recordRef, user)
    toolsUsed.push('get_record')
    return { reply: formatRecordSummary(data), toolsUsed, status: 'Loaded record' }
  }
  if (intent === 'draft_current') {
    if (!recordRef?.id || !['leads', 'contacts'].includes(recordRef.objectType)) {
      return {
        reply: '## Draft email\nOpen a **Lead** or **Contact** detail page, then click **Draft email**.',
        toolsUsed,
        status: 'Need lead/contact',
      }
    }
    const data = await executeCrmTool('draft_email', {
      objectType: recordRef.objectType,
      id: recordRef.id,
    }, user)
    toolsUsed.push('draft_email')
    if (data.error) return { reply: `## Draft email\n${data.error}`, toolsUsed, status: 'Draft failed' }
    return {
      reply: [
        '## Email draft',
        `**To:** ${data.to || '(no email)'}`,
        `**Subject:** ${data.subject || '—'}`,
        '',
        data.body || '',
        data.taskId ? `\n_Saved as Task \`${data.taskId}\`._` : '',
      ].join('\n'),
      toolsUsed,
      status: 'Drafted email',
    }
  }
  if (intent === 'enrich_current') {
    if (!recordRef?.id || !['leads', 'accounts'].includes(recordRef.objectType)) {
      return {
        reply: '## Enrich\nOpen a **Lead** or **Account** detail page, then click **Enrich**.',
        toolsUsed,
        status: 'Need lead/account',
      }
    }
    const data = await executeCrmTool('enrich_record', {
      objectType: recordRef.objectType,
      id: recordRef.id,
    }, user)
    toolsUsed.push('enrich_record')
    if (data.error) return { reply: `## Enrich\n${data.error}`, toolsUsed, status: 'Enrich failed' }
    const fields = data.fields || {}
    const lines = Object.entries(fields).map(([k, v]) => `- **${k}**: ${v}`)
    return {
      reply: [
        '## Enriched from web',
        lines.length ? lines.join('\n') : '_No new fields found (search returned little structured data)._',
        '',
        'Refresh the record page to see updates.',
      ].join('\n'),
      toolsUsed,
      status: 'Enriched record',
    }
  }
  if (intent === 'create_task') {
    const pipeline = await executeCrmTool('list_pipeline', { limit: 5 }, user)
    toolsUsed.push('list_pipeline')
    const top = (pipeline.opportunities || [])[0]
    const subject = top
      ? `Follow up: ${top.name}`.slice(0, 200)
      : 'Follow up hottest opportunity this week'
    const due = new Date()
    due.setDate(due.getDate() + 2)
    const data = await executeCrmTool('create_task', {
      subject,
      priority: 'High',
      dueDate: due.toISOString().slice(0, 10),
      description: top
        ? `Auto-created from Sales AI. Deal: ${top.name} (${top.stage}, ${formatMoney(top.amount)}).`
        : 'Auto-created from Sales AI. No open deals found — follow up leads instead.',
      relatedType: top ? 'Opportunity' : (recordRef?.objectType === 'leads' ? 'Lead' : ''),
      relatedId: top?.id || recordRef?.id || '',
    }, user)
    toolsUsed.push('create_task')
    return { reply: replyCreateTask(data, pipeline), toolsUsed, status: 'Created task' }
  }
  return null
}

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString()}`
}

function replyPipeline(data) {
  const opps = data.opportunities || []
  if (!opps.length) {
    return [
      '## Pipeline',
      'No open opportunities. Open deals: **0**.',
      '',
      '**Suggested next steps**',
      '- Convert a qualified lead, or',
      '- Open an Account and click **New Opportunity**',
      '- Use **Fill pipeline** on Sales Home to grow accounts, then create deals',
    ].join('\n')
  }
  const byStage = {}
  let total = 0
  for (const o of opps) {
    const stage = o.stage || 'Unknown'
    if (!byStage[stage]) byStage[stage] = { count: 0, amount: 0 }
    byStage[stage].count += 1
    byStage[stage].amount += Number(o.amount) || 0
    total += Number(o.amount) || 0
  }
  const stageLines = Object.entries(byStage)
    .map(([stage, v]) => `- **${stage}**: ${v.count} deal(s) · ${formatMoney(v.amount)}`)
  const dealLines = opps.slice(0, 12).map((o) => {
    const close = o.closeDate ? ` · close ${o.closeDate}` : ''
    const acct = o.account ? ` (${o.account})` : ''
    return `- ${o.name}${acct} — ${o.stage} · ${formatMoney(o.amount)}${close}`
  })
  return [
    '## Pipeline',
    `**${opps.length}** open deal(s) · total ${formatMoney(total)}`,
    '',
    '### By stage',
    ...stageLines,
    '',
    '### Deals',
    ...dealLines,
  ].join('\n')
}

function replyLeads(data) {
  const leads = data.leads || []
  if (!leads.length) {
    return [
      '## Leads',
      'No open/working leads found.',
      'Import from web on Sales Home or click **New** on Leads.',
    ].join('\n')
  }
  const lines = leads.slice(0, 15).map((l) => {
    const score = l.aiScore != null ? ` · score ${l.aiScore}` : ''
    const contact = l.email || l.phone || 'no contact'
    return `- **${l.name || 'Lead'}** @ ${l.company || '—'} (${l.status})${score} — ${contact}`
  })
  return [
    '## Leads',
    `Showing ${Math.min(leads.length, 15)} of ${leads.length} open/working lead(s).`,
    '',
    ...lines,
    '',
    '**Who to call first:** prioritize high AI score + has phone/email.',
  ].join('\n')
}

function replyStats(data) {
  return [
    '## CRM stats',
    `- Open leads: **${data.openLeads ?? 0}**`,
    `- Contacts: **${data.contacts ?? 0}**`,
    `- Accounts: **${data.accounts ?? 0}**`,
    `- Open deals: **${data.openDeals ?? 0}**`,
    `- Tasks due this week: **${data.tasksDueThisWeek ?? 0}**`,
  ].join('\n')
}

function replyCreateTask(data, pipeline) {
  if (data?.error) {
    return `## Task\nCould not create task: ${data.error}`
  }
  const hint = (pipeline?.opportunities || [])[0]
  return [
    '## Task created',
    `- **${data.subject}**`,
    `- Id: \`${data.taskId}\``,
    hint ? `- Linked context: hottest open deal looks like **${hint.name}** (${hint.stage})` : '',
    '',
    'Open **Tasks** in Sales to track it.',
  ].filter(Boolean).join('\n')
}

function metaBase(toolsUsed, extras = {}) {
  return {
    model: extras.model || (isOpenAiConfigured() ? getModel() : 'crm-fast'),
    synthesisMode: 'crm-tools',
    llmProvider: extras.llmProvider || (isOpenAiConfigured() ? getLlmProviderLabel() : 'none'),
    toolsUsed,
    crmMode: true,
    fastPath: Boolean(extras.fastPath),
    status: extras.status || undefined,
  }
}

async function runToolCallingLoop({ user, userMessage, history = [] }) {
  const messages = [
    { role: 'system', content: buildCrmSystemPrompt() },
    ...normalizeHistory(history),
    { role: 'user', content: String(userMessage || '').trim() },
  ]

  const toolsUsed = []
  const maxRounds = 3

  for (let round = 0; round < maxRounds; round += 1) {
    const message = await requestChatCompletion(messages, {
      tools: CRM_TOOL_DEFINITIONS,
      toolChoice: 'auto',
      temperature: 0.2,
      maxTokens: 1200,
      timeoutMs: 20000,
      rateLimitRetryMs: 2500,
      retryOnRateLimit: true,
    })

    const toolCalls = message.tool_calls || []
    if (!toolCalls.length) {
      const reply = String(message.content || '').trim()
        || 'I looked at your CRM request but had nothing to add. Try asking about open deals or leads.'
      return {
        agent: 'crm-copilot',
        title: 'CRM assistant',
        reply,
        sections: [],
        meta: metaBase(toolsUsed),
      }
    }

    messages.push({
      role: 'assistant',
      content: message.content || null,
      tool_calls: toolCalls,
    })

    for (const call of toolCalls) {
      const name = call.function?.name || 'unknown'
      let parsed = {}
      try {
        parsed = JSON.parse(call.function?.arguments || '{}')
      } catch {
        parsed = {}
      }
      let result
      try {
        result = await executeCrmTool(name, parsed, user)
      } catch (err) {
        result = { error: err.message || 'Tool failed' }
      }
      toolsUsed.push(name)
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 8000),
      })
    }
  }

  return {
    agent: 'crm-copilot',
    title: 'CRM assistant',
    reply: [
      '## CRM assistant',
      'I ran several CRM tools but need another turn to finish. Ask a follow-up like "summarize my open deals".',
      toolsUsed.length ? `Tools used: ${[...new Set(toolsUsed)].join(', ')}` : '',
    ].filter(Boolean).join('\n\n'),
    sections: [],
    meta: metaBase(toolsUsed),
  }
}

async function runCrmCopilotAgent({ user, userMessage, history = [], recordContext = '' }) {
  const recordRef = parseRecordRef(recordContext)
  const intent = detectFastIntent(userMessage)

  // Fast path: Mongo tools only — works even without LLM, answers in ms
  if (intent) {
    try {
      const fast = await runFastPath(user, intent, recordRef)
      if (fast) {
        return {
          agent: 'crm-copilot',
          title: 'CRM assistant',
          reply: fast.reply,
          sections: [],
          meta: metaBase(fast.toolsUsed, {
            fastPath: true,
            model: 'crm-fast',
            status: fast.status,
          }),
        }
      }
    } catch (err) {
      console.error('[crmCopilot] fast path failed:', err.message)
      // fall through
    }
  }

  // Stats fallback for unclear CRM questions when LLM is down
  if (!isOpenAiConfigured()) {
    try {
      const data = await executeCrmTool('get_crm_stats', {}, user)
      return {
        agent: 'crm-copilot',
        title: 'CRM assistant',
        reply: [
          replyStats(data),
          '',
          '_LLM not configured — showing live CRM counts. Set GROQ_API_KEY for richer answers._',
        ].join('\n'),
        sections: [],
        meta: metaBase(['get_crm_stats'], { fastPath: true, model: 'crm-fast' }),
      }
    } catch (err) {
      return {
        agent: 'crm-copilot',
        title: 'CRM assistant',
        reply: [
          '## CRM assistant',
          `Could not read CRM: ${err.message}`,
          'Set `GROQ_API_KEY` or `OPENAI_API_KEY` for AI tool answers.',
        ].join('\n\n'),
        sections: [],
        meta: metaBase([], { model: 'none' }),
      }
    }
  }

  try {
    return await runToolCallingLoop({ user, userMessage, history })
  } catch (err) {
    console.error('[crmCopilot] tool loop failed:', err.message)
    // Last resort: still return live stats so UI never hangs empty
    try {
      const data = await executeCrmTool('get_crm_stats', {}, user)
      return {
        agent: 'crm-copilot',
        title: 'CRM assistant',
        reply: [
          '## CRM assistant',
          `AI tool loop failed (${err.message}). Showing live CRM counts instead:`,
          '',
          replyStats(data),
        ].join('\n'),
        sections: [],
        meta: metaBase(['get_crm_stats'], { error: err.message }),
      }
    } catch {
      throw err
    }
  }
}

module.exports = {
  runCrmCopilotAgent,
  looksLikeCrmRequest,
  detectFastIntent,
  parseRecordRef,
}
