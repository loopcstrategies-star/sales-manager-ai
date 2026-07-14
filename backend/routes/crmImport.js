const express = require('express')
const multer = require('multer')
const { protect } = require('../middleware/auth')
const Lead = require('../models/Lead')
const Contact = require('../models/Contact')
const Account = require('../models/Account')
const { workspaceFilter } = require('../services/crmHelpers')
const { parseCsv, normalizeHeaderKey } = require('../services/csvParse')

const router = express.Router()
router.use(protect)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase()
    if (!name.endsWith('.csv') && file.mimetype !== 'text/csv' && file.mimetype !== 'application/vnd.ms-excel') {
      return cb(new Error('Only CSV files are allowed.'))
    }
    cb(null, true)
  },
})

const TEMPLATES = {
  leads: 'lastName,firstName,company,email,phone,title,website,status,industry,leadSource,description\nSmith,Jane,Acme Corp,jane@acme.com,+1-555-0100,Buyer,https://acme.com,Open,Technology,Web,\n',
  contacts: 'lastName,firstName,email,phone,title,accountName,description\nDoe,John,john@acme.com,+1-555-0101,Manager,Acme Corp,\n',
  accounts: 'name,website,phone,type,description,billingCity,billingState,billingCountry\nAcme Corp,https://acme.com,+1-555-0100,Customer,Example account,Dubai,,United Arab Emirates\n',
}

const FIELD_ALIASES = {
  leads: {
    lastName: ['lastname', 'last', 'surname'],
    firstName: ['firstname', 'first', 'givenname'],
    company: ['company', 'companyname', 'account', 'accountname'],
    email: ['email', 'emailaddress'],
    phone: ['phone', 'mobile', 'telephone'],
    title: ['title', 'jobtitle'],
    website: ['website', 'url', 'domain'],
    status: ['status', 'leadstatus'],
    industry: ['industry'],
    leadSource: ['leadsource', 'source'],
    description: ['description', 'notes'],
  },
  contacts: {
    lastName: ['lastname', 'last', 'surname'],
    firstName: ['firstname', 'first'],
    email: ['email', 'emailaddress'],
    phone: ['phone', 'mobile'],
    title: ['title', 'jobtitle'],
    accountName: ['accountname', 'account', 'company'],
    description: ['description', 'notes'],
  },
  accounts: {
    name: ['name', 'accountname', 'company', 'companyname'],
    website: ['website', 'url', 'domain'],
    phone: ['phone', 'telephone'],
    type: ['type', 'accounttype'],
    description: ['description', 'notes'],
    billingCity: ['billingcity', 'city'],
    billingState: ['billingstate', 'state', 'province'],
    billingCountry: ['billingcountry', 'country'],
  },
}

function autoMap(headers, objectType) {
  const aliases = FIELD_ALIASES[objectType] || {}
  const mapping = {}
  const normalized = headers.map((h) => ({ raw: h, key: normalizeHeaderKey(h) }))
  Object.keys(aliases).forEach((field) => {
    const match = normalized.find((h) => aliases[field].includes(h.key) || h.key === field.toLowerCase())
    if (match) mapping[field] = match.raw
  })
  return mapping
}

function rowValue(row, mapping, field) {
  const col = mapping[field]
  if (!col) return ''
  return String(row[col] || '').trim()
}

router.get('/import/template/:object', (req, res) => {
  const objectType = String(req.params.object || '').toLowerCase()
  if (!TEMPLATES[objectType]) {
    return res.status(400).json({ success: false, message: 'Unsupported object. Use leads, contacts, or accounts.' })
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${objectType}-template.csv"`)
  res.send(TEMPLATES[objectType])
})

router.post('/import/:object', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Upload failed.' })
    }
    try {
      const objectType = String(req.params.object || '').toLowerCase()
      if (!['leads', 'contacts', 'accounts'].includes(objectType)) {
        return res.status(400).json({ success: false, message: 'Unsupported object.' })
      }
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, message: 'CSV file is required.' })
      }

      const text = req.file.buffer.toString('utf8')
      const { headers, rows } = parseCsv(text)
      if (!headers.length || !rows.length) {
        return res.status(400).json({ success: false, message: 'CSV has no data rows.' })
      }
      if (rows.length > 2000) {
        return res.status(400).json({ success: false, message: 'CSV exceeds 2000 row limit.' })
      }

      let mapping = {}
      if (req.body.mapping) {
        try {
          mapping = typeof req.body.mapping === 'string' ? JSON.parse(req.body.mapping) : req.body.mapping
        } catch {
          mapping = {}
        }
      }
      if (!Object.keys(mapping).length) mapping = autoMap(headers, objectType)

      const previewOnly = String(req.body.preview || '') === '1' || String(req.query.preview || '') === '1'
      if (previewOnly) {
        return res.json({
          success: true,
          data: {
            headers,
            mapping,
            preview: rows.slice(0, 10),
            rowCount: rows.length,
          },
        })
      }

      const filter = workspaceFilter(req.user)
      const summary = { created: 0, updated: 0, skipped: 0, errors: [] }

      if (objectType === 'leads') {
        for (let i = 0; i < rows.length; i += 1) {
          const row = rows[i]
          try {
            const lastName = rowValue(row, mapping, 'lastName')
            const company = rowValue(row, mapping, 'company')
            if (!lastName || !company) {
              summary.skipped += 1
              summary.errors.push({ row: i + 2, message: 'lastName and company are required.' })
              continue
            }
            const email = rowValue(row, mapping, 'email').toLowerCase()
            const payload = {
              lastName,
              firstName: rowValue(row, mapping, 'firstName'),
              company,
              email,
              phone: rowValue(row, mapping, 'phone'),
              title: rowValue(row, mapping, 'title'),
              website: rowValue(row, mapping, 'website'),
              industry: rowValue(row, mapping, 'industry'),
              leadSource: rowValue(row, mapping, 'leadSource') || 'Import',
              description: rowValue(row, mapping, 'description'),
              status: ['Open', 'Working', 'Qualified', 'Unqualified'].includes(rowValue(row, mapping, 'status'))
                ? rowValue(row, mapping, 'status')
                : 'Open',
            }
            let existing = null
            if (email) existing = await Lead.findOne({ ...filter, email })
            if (existing) {
              Object.assign(existing, payload)
              await existing.save()
              summary.updated += 1
            } else {
              await Lead.create({
                ...payload,
                workspaceId: req.user.workspaceId,
                ownerId: req.user._id,
              })
              summary.created += 1
            }
          } catch (e) {
            summary.skipped += 1
            summary.errors.push({ row: i + 2, message: e.message || 'Failed' })
          }
        }
      }

      if (objectType === 'contacts') {
        for (let i = 0; i < rows.length; i += 1) {
          const row = rows[i]
          try {
            const lastName = rowValue(row, mapping, 'lastName')
            if (!lastName) {
              summary.skipped += 1
              summary.errors.push({ row: i + 2, message: 'lastName is required.' })
              continue
            }
            const email = rowValue(row, mapping, 'email').toLowerCase()
            const accountName = rowValue(row, mapping, 'accountName')
            let accountId = null
            if (accountName) {
              let account = await Account.findOne({
                ...filter,
                name: new RegExp(`^${accountName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
              })
              if (!account) {
                account = await Account.create({
                  name: accountName,
                  workspaceId: req.user.workspaceId,
                  ownerId: req.user._id,
                })
              }
              accountId = account._id
            }
            const payload = {
              lastName,
              firstName: rowValue(row, mapping, 'firstName'),
              email,
              phone: rowValue(row, mapping, 'phone'),
              title: rowValue(row, mapping, 'title'),
              description: rowValue(row, mapping, 'description'),
              accountId,
            }
            let existing = null
            if (email) existing = await Contact.findOne({ ...filter, email })
            if (existing) {
              Object.assign(existing, payload)
              await existing.save()
              summary.updated += 1
            } else {
              await Contact.create({
                ...payload,
                source: 'csv',
                needsVerify: false,
                workspaceId: req.user.workspaceId,
                ownerId: req.user._id,
              })
              summary.created += 1
            }
          } catch (e) {
            summary.skipped += 1
            summary.errors.push({ row: i + 2, message: e.message || 'Failed' })
          }
        }
      }

      if (objectType === 'accounts') {
        for (let i = 0; i < rows.length; i += 1) {
          const row = rows[i]
          try {
            const name = rowValue(row, mapping, 'name')
            if (!name) {
              summary.skipped += 1
              summary.errors.push({ row: i + 2, message: 'name is required.' })
              continue
            }
            const payload = {
              name,
              website: rowValue(row, mapping, 'website'),
              phone: rowValue(row, mapping, 'phone'),
              type: rowValue(row, mapping, 'type'),
              description: rowValue(row, mapping, 'description'),
              billingAddress: {
                city: rowValue(row, mapping, 'billingCity'),
                state: rowValue(row, mapping, 'billingState'),
                country: rowValue(row, mapping, 'billingCountry'),
                street: '',
                zip: '',
              },
            }
            const existing = await Account.findOne({
              ...filter,
              name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            })
            if (existing) {
              existing.website = payload.website || existing.website
              existing.phone = payload.phone || existing.phone
              existing.type = payload.type || existing.type
              existing.description = payload.description || existing.description
              existing.billingAddress = {
                ...(existing.billingAddress?.toObject?.() || existing.billingAddress || {}),
                ...Object.fromEntries(
                  Object.entries(payload.billingAddress).filter(([, v]) => v)
                ),
              }
              await existing.save()
              summary.updated += 1
            } else {
              await Account.create({
                ...payload,
                workspaceId: req.user.workspaceId,
                ownerId: req.user._id,
              })
              summary.created += 1
            }
          } catch (e) {
            summary.skipped += 1
            summary.errors.push({ row: i + 2, message: e.message || 'Failed' })
          }
        }
      }

      res.json({ success: true, data: summary })
    } catch (e) {
      res.status(500).json({ success: false, message: e.message || 'Import failed.' })
    }
  })
})

module.exports = router
