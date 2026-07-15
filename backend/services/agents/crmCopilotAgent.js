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
  if (/\b(pipeline|open deals|opportunit|deals by stage)\b/.test(text)) return 'pipeline'
  if (/\b(my leads|list my open|who to call|open crm leads)\b/.test(text)
    || (/\bleads?\b/.test(text) && /\b(list|suggest|call first)\b/.test(text))) {
    return 'leads'
  }
  if (/\bcreate\b/.test(text) && /\b(task|follow[- ]?up)\b/.test(text)) return 'create_task'
  if (/\bfollow[- ]?up\b/.test(text) && /\btask\b/.test(text)) return 'create_task'
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

async function runFastPath(user, intent) {
  const toolsUsed = []
  if (intent === 'pipeline') {
    const data = await executeCrmTool('list_pipeline', { limit: 30 }, user)
    toolsUsed.push('list_pipeline')
    return { reply: replyPipeline(data), toolsUsed }
  }
  if (intent === 'leads') {
    const data = await executeCrmTool('list_leads', { limit: 20 }, user)
    toolsUsed.push('list_leads')
    return { reply: replyLeads(data), toolsUsed }
  }
  if (intent === 'stats') {
    const data = await executeCrmTool('get_crm_stats', {}, user)
    toolsUsed.push('get_crm_stats')
    return { reply: replyStats(data), toolsUsed }
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
      relatedType: top ? 'Opportunity' : '',
      relatedId: top?.id || '',
    }, user)
    toolsUsed.push('create_task')
    return { reply: replyCreateTask(data, pipeline), toolsUsed }
  }
  return null
}

function metaBase(toolsUsed, extras = {}) {
  return {
    model: extras.model || (isOpenAiConfigured() ? getModel() : 'crm-fast'),
    synthesisMode: 'crm-tools',
    llmProvider: extras.llmProvider || (isOpenAiConfigured() ? getLlmProviderLabel() : 'none'),
    toolsUsed,
    crmMode: true,
    fastPath: Boolean(extras.fastPath),
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

async function runCrmCopilotAgent({ user, userMessage, history = [] }) {
  const intent = detectFastIntent(userMessage)

  // Fast path: Mongo tools only — works even without LLM, answers in ms
  if (intent) {
    try {
      const fast = await runFastPath(user, intent)
      if (fast) {
        return {
          agent: 'crm-copilot',
          title: 'CRM assistant',
          reply: fast.reply,
          sections: [],
          meta: metaBase(fast.toolsUsed, { fastPath: true, model: 'crm-fast' }),
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
}
