const { escapeRegex } = require('./crmHelpers')

function extractDomain(websiteOrEmail = '') {
  const raw = String(websiteOrEmail || '').trim().toLowerCase()
  if (!raw) return ''
  if (raw.includes('@')) return raw.split('@')[1] || ''
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    return new URL(withProto).hostname.replace(/^www\./, '')
  } catch {
    return raw.replace(/^www\./, '').split('/')[0]
  }
}

async function findAccountDuplicates(Account, user, { name, website, phone, email } = {}) {
  const filter = { workspaceId: user.workspaceId }
  const or = []
  const domain = extractDomain(website || email)
  if (name) or.push({ name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } })
  if (domain) {
    or.push({ website: { $regex: escapeRegex(domain), $options: 'i' } })
  }
  if (phone) or.push({ phone: String(phone).trim() })
  if (!or.length) return []
  return Account.find({ ...filter, $or: or }).limit(5).lean()
}

async function findContactDuplicates(Contact, user, { email, phone } = {}) {
  const filter = { workspaceId: user.workspaceId }
  const or = []
  if (email) or.push({ email: String(email).trim().toLowerCase() })
  if (phone) or.push({ phone: String(phone).trim() })
  if (!or.length) return []
  return Contact.find({ ...filter, $or: or }).limit(5).lean()
}

function qualificationResult(answers = {}, questions = []) {
  const total = questions.length || Object.keys(answers).length || 1
  const answered = Object.values(answers).filter((value) => String(value || '').trim()).length
  const ratio = answered / total
  if (ratio >= 0.75) return 'Qualified'
  if (ratio >= 0.45) return 'Potential'
  if (ratio >= 0.2) return 'Needs Research'
  return 'Low Priority'
}

module.exports = {
  extractDomain,
  findAccountDuplicates,
  findContactDuplicates,
  qualificationResult,
}
