const Lead = require('../../models/Lead')
const Account = require('../../models/Account')
const Contact = require('../../models/Contact')
const Opportunity = require('../../models/Opportunity')
const Task = require('../../models/Task')
const { workspaceFilter, escapeRegex, toObjectId } = require('../crmHelpers')
const { enrichFromQuery, applyLeadEnrichment, applyAccountEnrichment } = require('../crmEnrichment')
const { draftOutreachEmail } = require('../emailDraft')
const { getUserPreferences } = require('../userPreferences')

const CLOSED = new Set(['Closed Won', 'Closed Lost'])

const CRM_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_pipeline',
      description: 'List open opportunities in the CRM pipeline with stage, amount, and close date.',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Optional search on opportunity name' },
          stage: { type: 'string', description: 'Optional stage filter' },
          limit: { type: 'integer', description: 'Max rows (default 15, max 30)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_leads',
      description: 'List open/working CRM leads.',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search name, company, or email' },
          status: { type: 'string', description: 'Open, Working, Qualified, Unqualified' },
          limit: { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_accounts',
      description: 'Search CRM accounts by name or website.',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['q'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_crm_stats',
      description: 'Get high-level CRM counts: open leads, contacts, accounts, open deals, tasks due.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a CRM task (follow-up, call, email reminder).',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['Low', 'Normal', 'High'] },
          dueDate: { type: 'string', description: 'ISO date YYYY-MM-DD' },
          relatedType: { type: 'string', enum: ['Lead', 'Contact', 'Account', 'Opportunity', ''] },
          relatedId: { type: 'string' },
        },
        required: ['subject'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_lead',
      description: 'Create a new CRM lead.',
      parameters: {
        type: 'object',
        properties: {
          lastName: { type: 'string' },
          company: { type: 'string' },
          firstName: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          website: { type: 'string' },
          industry: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['lastName', 'company'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_email',
      description: 'Draft a B2B outreach email for a Lead or Contact and optionally save as a Task.',
      parameters: {
        type: 'object',
        properties: {
          objectType: { type: 'string', enum: ['leads', 'contacts'] },
          id: { type: 'string' },
          tone: { type: 'string', enum: ['brief', 'professional', 'warm'] },
        },
        required: ['objectType', 'id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enrich_record',
      description: 'Enrich a Lead or Account from web search (phone, website, industry, etc.).',
      parameters: {
        type: 'object',
        properties: {
          objectType: { type: 'string', enum: ['leads', 'accounts'] },
          id: { type: 'string' },
        },
        required: ['objectType', 'id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_record',
      description: 'Load one CRM record by type and id (Lead, Account, Contact, or Opportunity).',
      parameters: {
        type: 'object',
        properties: {
          objectType: { type: 'string', enum: ['leads', 'accounts', 'contacts', 'opportunities'] },
          id: { type: 'string' },
        },
        required: ['objectType', 'id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'score_leads',
      description: 'Score open leads 0–100 against jewelry/UAE ICP (rules, optional LLM).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Optional single lead id' },
          cap: { type: 'integer', description: 'Max leads to score when id omitted' },
          useLlm: { type: 'boolean' },
        },
      },
    },
  },
]

function limitOf(n, fallback = 15, max = 30) {
  const v = Number(n)
  if (Number.isNaN(v)) return fallback
  return Math.max(1, Math.min(max, Math.round(v)))
}

async function executeCrmTool(name, rawArgs, user) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {}
  const filter = workspaceFilter(user)

  switch (name) {
    case 'list_pipeline': {
      const q = String(args.q || '').trim()
      const stage = String(args.stage || '').trim()
      const query = { ...filter, stage: { $nin: [...CLOSED] } }
      if (stage) query.stage = stage
      if (q) query.name = { $regex: escapeRegex(q), $options: 'i' }
      const rows = await Opportunity.find(query)
        .populate('accountId', 'name')
        .sort({ updatedAt: -1 })
        .limit(limitOf(args.limit))
        .lean()
      return {
        count: rows.length,
        opportunities: rows.map((o) => ({
          id: String(o._id),
          name: o.name,
          stage: o.stage,
          amount: o.amount,
          closeDate: o.closeDate ? String(o.closeDate).slice(0, 10) : null,
          nextStep: o.nextStep || '',
          account: o.accountId?.name || '',
        })),
      }
    }

    case 'list_leads': {
      const q = String(args.q || '').trim()
      const status = String(args.status || '').trim()
      const query = {
        ...filter,
        status: status || { $in: ['Open', 'Working', 'Qualified'] },
      }
      if (q) {
        const regex = { $regex: escapeRegex(q), $options: 'i' }
        query.$or = [
          { firstName: regex },
          { lastName: regex },
          { company: regex },
          { email: regex },
        ]
      }
      const rows = await Lead.find(query).sort({ updatedAt: -1 }).limit(limitOf(args.limit)).lean()
      return {
        count: rows.length,
        leads: rows.map((l) => ({
          id: String(l._id),
          name: [l.firstName, l.lastName].filter(Boolean).join(' '),
          company: l.company,
          status: l.status,
          email: l.email || '',
          phone: l.phone || '',
          aiScore: l.aiScore ?? null,
        })),
      }
    }

    case 'search_accounts': {
      const q = String(args.q || '').trim()
      if (!q) return { error: 'q is required', accounts: [] }
      const regex = { $regex: escapeRegex(q), $options: 'i' }
      const rows = await Account.find({
        ...filter,
        $or: [{ name: regex }, { website: regex }],
      }).sort({ updatedAt: -1 }).limit(limitOf(args.limit, 10)).lean()
      return {
        count: rows.length,
        accounts: rows.map((a) => ({
          id: String(a._id),
          name: a.name,
          website: a.website || '',
          phone: a.phone || '',
          region: a.region || '',
        })),
      }
    }

    case 'get_crm_stats': {
      const now = new Date()
      const week = new Date(now)
      week.setDate(week.getDate() + 7)
      const [openLeads, contacts, accounts, openDeals, tasksDue] = await Promise.all([
        Lead.countDocuments({ ...filter, status: { $in: ['Open', 'Working'] } }),
        Contact.countDocuments(filter),
        Account.countDocuments(filter),
        Opportunity.countDocuments({ ...filter, stage: { $nin: [...CLOSED] } }),
        Task.countDocuments({
          ...filter,
          status: { $ne: 'Completed' },
          dueDate: { $ne: null, $lte: week },
        }),
      ])
      return { openLeads, contacts, accounts, openDeals, tasksDueThisWeek: tasksDue }
    }

    case 'create_task': {
      const subject = String(args.subject || '').trim()
      if (!subject) return { error: 'subject is required' }
      const relatedId = toObjectId(args.relatedId)
      const task = await Task.create({
        subject: subject.slice(0, 200),
        description: String(args.description || '').slice(0, 5000),
        priority: ['Low', 'Normal', 'High'].includes(args.priority) ? args.priority : 'Normal',
        dueDate: args.dueDate ? new Date(args.dueDate) : null,
        relatedType: args.relatedType || '',
        relatedId: relatedId || null,
        status: 'Not Started',
        workspaceId: user.workspaceId,
        ownerId: user._id,
      })
      return { ok: true, taskId: String(task._id), subject: task.subject }
    }

    case 'create_lead': {
      const lastName = String(args.lastName || '').trim()
      const company = String(args.company || '').trim()
      if (!lastName || !company) return { error: 'lastName and company are required' }
      const lead = await Lead.create({
        lastName,
        company,
        firstName: String(args.firstName || '').trim(),
        email: String(args.email || '').trim().toLowerCase(),
        phone: String(args.phone || '').trim(),
        website: String(args.website || '').trim(),
        industry: String(args.industry || '').trim(),
        description: String(args.description || '').trim(),
        leadSource: 'AI Assistant',
        status: 'Open',
        workspaceId: user.workspaceId,
        ownerId: user._id,
      })
      return {
        ok: true,
        leadId: String(lead._id),
        name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
        company: lead.company,
      }
    }

    case 'draft_email': {
      const objectType = String(args.objectType || '').toLowerCase()
      const id = toObjectId(args.id)
      if (!id || !['leads', 'contacts'].includes(objectType)) {
        return { error: 'objectType (leads|contacts) and id are required' }
      }
      const salesPrefs = (await getUserPreferences(user._id)).sales
      let person = {}
      let company = ''
      let context = ''
      let relatedType = 'Contact'
      if (objectType === 'leads') {
        const lead = await Lead.findOne({ ...filter, _id: id }).lean()
        if (!lead) return { error: 'Lead not found' }
        person = lead
        company = lead.company || ''
        context = [lead.industry, lead.description].filter(Boolean).join(' · ')
        relatedType = 'Lead'
      } else {
        const contact = await Contact.findOne({ ...filter, _id: id }).populate('accountId', 'name').lean()
        if (!contact) return { error: 'Contact not found' }
        person = contact
        company = contact.accountId?.name || ''
        context = [contact.title, contact.description].filter(Boolean).join(' · ')
      }
      const draft = await draftOutreachEmail({
        person,
        company,
        context,
        tone: args.tone || salesPrefs.emailTone || 'professional',
      })
      if (!draft.ok) return { error: draft.error || 'Draft failed' }
      let taskId = null
      if (salesPrefs.saveEmailAsTask !== false) {
        const task = await Task.create({
          subject: `Email draft: ${draft.subject || 'Outreach'}`.slice(0, 200),
          status: 'Not Started',
          priority: 'Normal',
          description: `To: ${draft.to || '(no email)'}\nSubject: ${draft.subject}\n\n${draft.body}`.slice(0, 5000),
          relatedType,
          relatedId: id,
          workspaceId: user.workspaceId,
          ownerId: user._id,
        })
        taskId = String(task._id)
      }
      return {
        ok: true,
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
        taskId,
      }
    }

    case 'enrich_record': {
      const objectType = String(args.objectType || '').toLowerCase()
      const id = toObjectId(args.id)
      if (!id || !['leads', 'accounts'].includes(objectType)) {
        return { error: 'objectType (leads|accounts) and id are required' }
      }
      if (objectType === 'leads') {
        const lead = await Lead.findOne({ ...filter, _id: id })
        if (!lead) return { error: 'Lead not found' }
        const query = [lead.company, lead.website, lead.email].filter(Boolean).join(' ')
        const result = await enrichFromQuery(query || lead.company)
        applyLeadEnrichment(lead, result.fields || {}, false)
        await lead.save()
        return { ok: true, objectType: 'leads', id: String(lead._id), fields: result.fields || {} }
      }
      const account = await Account.findOne({ ...filter, _id: id })
      if (!account) return { error: 'Account not found' }
      const query = [account.name, account.website].filter(Boolean).join(' ')
      const result = await enrichFromQuery(query || account.name)
      applyAccountEnrichment(account, result.fields || {}, false)
      await account.save()
      return { ok: true, objectType: 'accounts', id: String(account._id), fields: result.fields || {} }
    }

    case 'get_record': {
      const objectType = String(args.objectType || '').toLowerCase()
      const id = toObjectId(args.id)
      if (!id) return { error: 'id is required' }
      if (objectType === 'leads') {
        const lead = await Lead.findOne({ ...filter, _id: id }).lean()
        if (!lead) return { error: 'Lead not found' }
        return {
          objectType: 'leads',
          id: String(lead._id),
          name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
          company: lead.company,
          status: lead.status,
          email: lead.email || '',
          phone: lead.phone || '',
          website: lead.website || '',
          industry: lead.industry || '',
          description: lead.description || '',
          aiScore: lead.aiScore ?? null,
        }
      }
      if (objectType === 'accounts') {
        const account = await Account.findOne({ ...filter, _id: id }).lean()
        if (!account) return { error: 'Account not found' }
        return {
          objectType: 'accounts',
          id: String(account._id),
          name: account.name,
          website: account.website || '',
          phone: account.phone || '',
          type: account.type || '',
          region: account.region || '',
          description: account.description || '',
        }
      }
      if (objectType === 'contacts') {
        const contact = await Contact.findOne({ ...filter, _id: id }).populate('accountId', 'name').lean()
        if (!contact) return { error: 'Contact not found' }
        return {
          objectType: 'contacts',
          id: String(contact._id),
          name: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
          email: contact.email || '',
          phone: contact.phone || '',
          title: contact.title || '',
          account: contact.accountId?.name || '',
        }
      }
      if (objectType === 'opportunities' || objectType === 'pipeline') {
        const opp = await Opportunity.findOne({ ...filter, _id: id }).populate('accountId', 'name').lean()
        if (!opp) return { error: 'Opportunity not found' }
        return {
          objectType: 'opportunities',
          id: String(opp._id),
          name: opp.name,
          stage: opp.stage,
          amount: opp.amount,
          closeDate: opp.closeDate ? String(opp.closeDate).slice(0, 10) : null,
          nextStep: opp.nextStep || '',
          account: opp.accountId?.name || '',
          description: opp.description || '',
        }
      }
      return { error: 'objectType must be leads|accounts|contacts|opportunities' }
    }

    case 'score_leads': {
      const { scoreAndSaveLead, scoreWorkspaceLeads } = require('../leadScore')
      const useLlm = args.useLlm === true
      const id = toObjectId(args.id)
      if (id) {
        const lead = await Lead.findOne({ ...filter, _id: id })
        if (!lead) return { error: 'Lead not found' }
        return { ok: true, ...(await scoreAndSaveLead(lead, { useLlm })) }
      }
      return {
        ok: true,
        ...(await scoreWorkspaceLeads(user, {
          cap: limitOf(args.cap, 40, 80),
          useLlm,
        })),
      }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

module.exports = {
  CRM_TOOL_DEFINITIONS,
  executeCrmTool,
}
