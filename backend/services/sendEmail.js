/**
 * Send email via SendGrid REST API (no extra npm dependency).
 * Falls back to logging a Task when SENDGRID_API_KEY is missing.
 */
const Task = require('../models/Task')

function isSendConfigured() {
  return Boolean(String(process.env.SENDGRID_API_KEY || '').trim()
    && String(process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM || '').trim())
}

async function sendViaSendGrid({ to, subject, body, fromEmail, fromName }) {
  const apiKey = String(process.env.SENDGRID_API_KEY || '').trim()
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: {
        email: fromEmail,
        ...(fromName ? { name: fromName } : {}),
      },
      subject: subject || '(no subject)',
      content: [{ type: 'text/plain', value: body || '' }],
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `SendGrid HTTP ${res.status}`)
  }
  return { provider: 'sendgrid' }
}

async function sendCrmEmail({
  user,
  to,
  subject,
  body,
  relatedType = '',
  relatedId = null,
  logAsTask = true,
}) {
  const email = String(to || '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Valid to email is required.' }
  }
  const subj = String(subject || '').trim().slice(0, 200)
  const text = String(body || '').trim().slice(0, 20000)
  if (!subj || !text) {
    return { ok: false, error: 'Subject and body are required.' }
  }

  const fromEmail = String(process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM || '').trim()
  const fromName = String(process.env.SENDGRID_FROM_NAME || 'Sales Manager AI').trim()

  let sent = false
  let provider = 'none'
  let error = null

  if (isSendConfigured()) {
    try {
      const result = await sendViaSendGrid({
        to: email,
        subject: subj,
        body: text,
        fromEmail,
        fromName,
      })
      sent = true
      provider = result.provider
    } catch (err) {
      error = err.message || 'Send failed'
    }
  } else {
    error = 'SENDGRID_API_KEY / SENDGRID_FROM_EMAIL not configured — email logged as Task only.'
  }

  let task = null
  if (logAsTask || !sent) {
    task = await Task.create({
      subject: `${sent ? 'Sent' : 'Queued'}: ${subj}`.slice(0, 200),
      status: sent ? 'Completed' : 'Not Started',
      priority: 'Normal',
      description: [
        `To: ${email}`,
        `Subject: ${subj}`,
        sent ? 'Status: sent via SendGrid' : `Status: not sent (${error || 'no provider'})`,
        '',
        text,
      ].join('\n').slice(0, 5000),
      relatedType: relatedType || '',
      relatedId: relatedId || null,
      workspaceId: user.workspaceId,
      ownerId: user._id,
    })
  }

  return {
    ok: sent || Boolean(task),
    sent,
    provider,
    error: sent ? null : error,
    taskId: task?._id ? String(task._id) : null,
    to: email,
    subject: subj,
  }
}

module.exports = {
  isSendConfigured,
  sendCrmEmail,
}
