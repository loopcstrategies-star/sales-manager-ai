const Task = require('../models/Task')
const Lead = require('../models/Lead')
const Contact = require('../models/Contact')
const { workspaceFilter, toObjectId } = require('./crmHelpers')
const { draftOutreachEmail } = require('./emailDraft')
const { getUserPreferences } = require('./userPreferences')

/**
 * Day 0 outreach draft (optional Task) + Day 3 follow-up Task.
 * Not a full ESP sequence — sales cadence lite.
 */
async function startSequenceLite({ user, objectType, id }) {
  const oid = toObjectId(id)
  if (!oid) return { ok: false, error: 'Invalid id' }

  const type = String(objectType || '').toLowerCase()
  const salesPrefs = (await getUserPreferences(user._id)).sales
  let person = null
  let company = ''
  let relatedType = ''
  let context = ''

  if (type === 'leads' || type === 'lead') {
    const lead = await Lead.findOne({ ...workspaceFilter(user), _id: oid }).lean()
    if (!lead) return { ok: false, error: 'Lead not found.' }
    person = lead
    company = lead.company || ''
    relatedType = 'Lead'
    context = [lead.industry, lead.description].filter(Boolean).join(' · ')
  } else if (type === 'contacts' || type === 'contact') {
    const contact = await Contact.findOne({ ...workspaceFilter(user), _id: oid })
      .populate('accountId', 'name')
      .lean()
    if (!contact) return { ok: false, error: 'Contact not found.' }
    person = contact
    company = contact.accountId?.name || ''
    relatedType = 'Contact'
    context = [contact.title, contact.description].filter(Boolean).join(' · ')
  } else {
    return { ok: false, error: 'objectType must be leads or contacts' }
  }

  const draft = await draftOutreachEmail({
    kind: relatedType === 'Lead' ? 'lead' : 'contact',
    person,
    company,
    context: `Sequence Day 0 first touch. ${context}`.trim(),
    tone: salesPrefs.emailTone || 'professional',
  })
  if (!draft.ok) {
    return { ok: false, error: draft.error || 'Could not draft Day 0 email.' }
  }

  const day0 = await Task.create({
    subject: `Sequence Day 0: ${draft.subject || 'Outreach'}`.slice(0, 200),
    status: 'Not Started',
    priority: 'High',
    dueDate: new Date(),
    description: [
      'Outreach sequence — Day 0 (send this email)',
      `To: ${draft.to || '(no email)'}`,
      `Subject: ${draft.subject || ''}`,
      '',
      draft.body || '',
    ].join('\n'),
    relatedType,
    relatedId: oid,
    workspaceId: user.workspaceId,
    ownerId: user._id,
  })

  const day3Due = new Date()
  day3Due.setDate(day3Due.getDate() + 3)
  const day3 = await Task.create({
    subject: `Sequence Day 3: Follow up — ${(person.firstName || person.lastName || company || 'contact')}`.slice(0, 200),
    status: 'Not Started',
    priority: 'Normal',
    dueDate: day3Due,
    description: [
      'Outreach sequence — Day 3 follow-up.',
      'If no reply to Day 0, send a short nudge or call.',
      draft.subject ? `Reference subject: ${draft.subject}` : '',
    ].filter(Boolean).join('\n'),
    relatedType,
    relatedId: oid,
    workspaceId: user.workspaceId,
    ownerId: user._id,
  })

  return {
    ok: true,
    day0TaskId: day0._id,
    day3TaskId: day3._id,
    to: draft.to,
    subject: draft.subject,
    body: draft.body,
    day3DueDate: day3Due.toISOString().slice(0, 10),
  }
}

module.exports = { startSequenceLite }
