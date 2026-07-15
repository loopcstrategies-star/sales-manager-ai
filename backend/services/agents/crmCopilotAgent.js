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

async function runCrmCopilotAgent({ user, userMessage, history = [] }) {
  if (!isOpenAiConfigured()) {
    return {
      agent: 'crm-copilot',
      title: 'CRM assistant',
      reply: [
        '## CRM tools unavailable',
        'Set `GROQ_API_KEY` or `OPENAI_API_KEY` so the assistant can call CRM tools.',
        'Meanwhile open **Sales** to manage leads and pipeline manually.',
      ].join('\n\n'),
      sections: [],
      meta: {
        model: 'none',
        synthesisMode: 'crm-tools',
        llmProvider: 'none',
        toolsUsed: [],
        crmMode: true,
      },
    }
  }

  const messages = [
    { role: 'system', content: buildCrmSystemPrompt() },
    ...normalizeHistory(history),
    { role: 'user', content: String(userMessage || '').trim() },
  ]

  const toolsUsed = []
  const maxRounds = 4

  for (let round = 0; round < maxRounds; round += 1) {
    const message = await requestChatCompletion(messages, {
      tools: CRM_TOOL_DEFINITIONS,
      toolChoice: 'auto',
      temperature: 0.2,
      maxTokens: 1800,
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
        meta: {
          model: getModel(),
          synthesisMode: 'crm-tools',
          llmProvider: getLlmProviderLabel(),
          toolsUsed,
          crmMode: true,
        },
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
    meta: {
      model: getModel(),
      synthesisMode: 'crm-tools',
      llmProvider: getLlmProviderLabel(),
      toolsUsed,
      crmMode: true,
    },
  }
}

module.exports = {
  runCrmCopilotAgent,
  looksLikeCrmRequest,
}
