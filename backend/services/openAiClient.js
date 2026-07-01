function getModel() {
  return String(process.env.OPENAI_SALES_AI_MODEL || 'gpt-4o-mini').trim()
}

function isOpenAiConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY || '').trim())
}

module.exports = { getModel, isOpenAiConfigured }
