const { formatTavilyForPrompt } = require('../prompts')

function runMarketResearchAgent(searchBatches, options = {}) {
  const { text, sources, answers } = formatTavilyForPrompt(searchBatches)
  const hasResults = sources.length > 0 || answers.length > 0
  const provider = options.provider || 'tavily'
  const providerHint = provider === 'brave' ? 'BRAVE_API_KEY' : 'TAVILY_API_KEY'
  return {
    agent: 'marketResearch',
    title: 'Market signals',
    content: hasResults
      ? text
      : `No external web results were retrieved. Check ${providerHint} or set SEARCH_PROVIDER=brave|tavily.`,
    sources: sources.slice(0, 12),
    answers: answers.slice(0, 5),
  }
}

module.exports = { runMarketResearchAgent }
