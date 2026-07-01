const { formatCrmForPrompt } = require('../prompts')

function runCrmInsightAgent(crmSnapshot) {
  if (!crmSnapshot) {
    return {
      agent: 'crmInsight',
      title: 'CRM',
      content: 'Connect LoopC Ops to unlock pipeline insights.',
    }
  }
  return {
    agent: 'crmInsight',
    title: 'CRM snapshot',
    content: formatCrmForPrompt(crmSnapshot),
  }
}

module.exports = { runCrmInsightAgent }
