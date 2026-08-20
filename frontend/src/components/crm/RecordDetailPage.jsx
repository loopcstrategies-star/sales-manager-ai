import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  accountsApi,
  contactsApi,
  leadsApi,
  opportunitiesApi,
  casesApi,
  crmApi,
  industriesApi,
  proposalsApi,
} from '../../api/client'
import { usePreferences } from '../../context/PreferencesContext'
import ActivityTimeline from './ActivityTimeline'
import FindContactsButton from './FindContactsButton'
import EmailDraftButton from './EmailDraftButton'
import SendEmailButton from './SendEmailButton'
import ReplyAssistButton from './ReplyAssistButton'
import SequenceLiteButton from './SequenceLiteButton'
import MeetingNotesButton from './MeetingNotesButton'
import RecordAiPanel from './RecordAiPanel'
import CrmModal from './CrmModal'
import LookupField from './LookupField'
import { CONVERT_STAGES } from './salesPrefs'
import { getIndustryConfig } from '../../lib/industryCatalog'

function PlaybookPanel({ industrySlug }) {
  const [playbook, setPlaybook] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    if (!industrySlug) return undefined
    industriesApi.playbook(industrySlug)
      .then((res) => {
        if (!cancelled) setPlaybook(res.data || res)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load playbook.')
      })
    return () => { cancelled = true }
  }, [industrySlug])
  if (!industrySlug) return null
  return (
    <section className="crm-home-panel">
      <h3>Sales Playbook</h3>
      {error ? <p className="crm-error">{error}</p> : null}
      {!playbook && !error ? <p className="crm-muted">Loading playbook…</p> : null}
      {playbook ? (
        <>
          <p className="crm-muted">Industry: {industrySlug}</p>
          {Array.isArray(playbook.openingQuestions) ? (
            <>
              <h4>Opening</h4>
              <ul className="crm-recent-list">
                {playbook.openingQuestions.map((item) => (
                  <li key={item}><span>{item}</span></li>
                ))}
              </ul>
            </>
          ) : null}
          {Array.isArray(playbook.discoveryQuestions) ? (
            <>
              <h4>Discovery</h4>
              <ul className="crm-recent-list">
                {playbook.discoveryQuestions.map((item) => (
                  <li key={item}><span>{item}</span></li>
                ))}
              </ul>
            </>
          ) : null}
          {Array.isArray(playbook.followUpSequence) ? (
            <>
              <h4>Follow-up</h4>
              <ul className="crm-recent-list">
                {playbook.followUpSequence.map((item) => (
                  <li key={item}><span>{item}</span></li>
                ))}
              </ul>
            </>
          ) : null}
          {playbook.demoRecommendation ? <p className="crm-muted">Demo: {playbook.demoRecommendation}</p> : null}
          {Array.isArray(playbook.objectionHandling) ? (
            <>
              <h4>Objection handling</h4>
              <ul className="crm-recent-list">
                {playbook.objectionHandling.map((item) => (
                  <li key={typeof item === 'string' ? item : item.objection}>
                    <span>{typeof item === 'string' ? item : `${item.objection}: ${item.response}`}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

function QualificationPanel({ objectType, record, onSaved }) {
  const industry = getIndustryConfig(record.industrySlug)
  const questions = industry?.qualificationQuestions || []
  const [answers, setAnswers] = useState(() => ({ ...(record.qualificationAnswers || {}) }))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setAnswers({ ...(record.qualificationAnswers || {}) })
  }, [record._id, record.qualificationAnswers])

  if (!questions.length) {
    return (
      <section className="crm-home-panel">
        <h3>Qualification</h3>
        <p className="crm-muted">No qualification questions for this industry.</p>
      </section>
    )
  }

  const save = async () => {
    setBusy(true)
    setMsg('')
    try {
      const api = objectType === 'leads' ? leadsApi : opportunitiesApi
      const res = await api.qualify(record._id, answers)
      onSaved?.(res.data)
      setMsg(`Result: ${res.data.qualificationResult || 'saved'}`)
    } catch (err) {
      setMsg(err.message || 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="crm-home-panel">
      <h3>Qualification</h3>
      <p className="crm-muted">
        Current: {record.qualificationResult || 'Not scored'}
      </p>
      {questions.map((question) => (
        <label key={question} className="crm-field">
          <span>{question}</span>
          <input
            value={answers[question] || ''}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [question]: e.target.value }))}
            placeholder="Answer"
          />
        </label>
      ))}
      <button type="button" className="crm-btn-primary" disabled={busy} onClick={save}>
        {busy ? 'Saving…' : 'Save qualification'}
      </button>
      {msg ? <p className="crm-muted">{msg}</p> : null}
    </section>
  )
}

const CONFIG = {
  leads: {
    label: 'Lead',
    listPath: '/sales/leads',
    relatedType: 'Lead',
    load: (id) => leadsApi.get(id),
    title: (d) => [d.firstName, d.lastName].filter(Boolean).join(' ') || d.company,
  },
  accounts: {
    label: 'Account',
    listPath: '/sales/accounts',
    relatedType: 'Account',
    load: (id) => accountsApi.get(id),
    title: (d) => d.name,
  },
  contacts: {
    label: 'Contact',
    listPath: '/sales/contacts',
    relatedType: 'Contact',
    load: (id) => contactsApi.get(id),
    title: (d) => d.fullName || [d.firstName, d.lastName].filter(Boolean).join(' '),
  },
  opportunities: {
    label: 'Opportunity',
    listPath: '/sales/pipeline',
    relatedType: 'Opportunity',
    load: (id) => opportunitiesApi.get(id),
    title: (d) => d.name,
  },
}

export default function RecordDetailPage({ objectType }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { providers, sales } = usePreferences()
  const hunterConfigured = Boolean(providers?.hunter)
  const cfg = CONFIG[objectType]
  const [data, setData] = useState(null)
  const [related, setRelated] = useState({ contacts: [], opportunities: [], cases: [] })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [convertForm, setConvertForm] = useState({
    createOpportunity: true,
    opportunityName: '',
    amount: '',
    accountId: '',
    accountName: '',
    stage: 'Prospecting',
  })
  const [nextStepDraft, setNextStepDraft] = useState({ nextStep: '', nextStepDue: '' })
  const [timelineKey, setTimelineKey] = useState(0)
  const [intelligence, setIntelligence] = useState(null)
  const [proposals, setProposals] = useState([])
  const [convertDuplicates, setConvertDuplicates] = useState([])
  const [nbaHint, setNbaHint] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await cfg.load(id)
        if (cancelled) return
        setData(res.data)
        setError('')
        if (objectType === 'opportunities' && res.data) {
          setNextStepDraft({
            nextStep: res.data.nextStep || '',
            nextStepDue: res.data.nextStepDue ? String(res.data.nextStepDue).slice(0, 10) : '',
          })
          const [proposalRes, nbaRes] = await Promise.all([
            proposalsApi.list({ opportunityId: res.data._id }).catch(() => ({ data: [] })),
            opportunitiesApi.nextAction(res.data._id).catch(() => ({ data: null })),
          ])
          if (!cancelled) {
            setProposals(proposalRes.data || [])
            setNbaHint(nbaRes.data || null)
          }
        }

        if (objectType === 'accounts' && res.data?._id) {
          const [cRes, oRes, caseRes, intelligenceRes] = await Promise.all([
            contactsApi.list(''),
            opportunitiesApi.list(''),
            casesApi.list('', 'all').catch(() => ({ data: [] })),
            crmApi.companyIntelligence(res.data._id).catch(() => ({ data: null })),
          ])
          const aid = String(res.data._id)
          setRelated({
            contacts: (cRes.data || []).filter((c) => String(c.accountId) === aid).slice(0, 20),
            opportunities: (oRes.data || []).filter((o) => String(o.accountId) === aid).slice(0, 20),
            cases: (caseRes.data || []).filter((c) => String(c.accountId) === aid).slice(0, 20),
          })
          setIntelligence(intelligenceRes.data || null)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load record')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [cfg, id, objectType])

  if (!cfg) return <p className="crm-banner-error">Unknown record type.</p>
  if (loading) return <p className="crm-muted">Loading…</p>
  if (error) return <p className="crm-banner-error">{error}</p>
  if (!data) return null

  const createOpportunity = async () => {
    if (objectType !== 'accounts') return
    setActionBusy(true)
    setActionMsg('')
    try {
      const close = new Date()
      close.setDate(close.getDate() + 30)
      const res = await opportunitiesApi.create({
        name: `${data.name} — Opportunity`,
        accountId: data._id,
        amount: 0,
        stage: 'Prospecting',
        closeDate: close.toISOString().slice(0, 10),
        description: 'Created from Account.',
      })
      setActionMsg('Opportunity created.')
      navigate(`/sales/pipeline/${res.data._id}`)
    } catch (err) {
      setActionMsg(err.message || 'Could not create opportunity.')
    } finally {
      setActionBusy(false)
    }
  }

  const runHunter = async () => {
    if (objectType !== 'accounts') return
    setActionBusy(true)
    setActionMsg('')
    try {
      const res = await crmApi.hunterContacts({ accountId: data._id })
      const d = res.data || {}
      setActionMsg(`Hunter · contacts +${d.contactsCreated || 0} (skipped ${d.contactsSkipped || 0}).`)
      const cRes = await contactsApi.list('')
      const aid = String(data._id)
      setRelated((prev) => ({
        ...prev,
        contacts: (cRes.data || []).filter((c) => String(c.accountId) === aid).slice(0, 20),
      }))
    } catch (err) {
      setActionMsg(err.message || 'Hunter failed (set HUNTER_API_KEY on Railway).')
    } finally {
      setActionBusy(false)
    }
  }

  const saveNextStep = async () => {
    if (objectType !== 'opportunities') return
    setActionBusy(true)
    setActionMsg('')
    try {
      const res = await opportunitiesApi.update(data._id, {
        nextStep: nextStepDraft.nextStep || '',
        nextStepDue: nextStepDraft.nextStepDue || null,
      })
      setData(res.data)
      setActionMsg('Next step saved.')
    } catch (err) {
      setActionMsg(err.message || 'Could not save next step.')
    } finally {
      setActionBusy(false)
    }
  }

  const runConvert = async (createAnyway = false) => {
    if (objectType !== 'leads') return
    setActionBusy(true)
    setActionMsg('')
    try {
      const res = await leadsApi.convert(data._id, {
        createOpportunity: convertForm.createOpportunity,
        opportunityName: convertForm.opportunityName,
        amount: Number(convertForm.amount) || 0,
        accountId: convertForm.accountId || undefined,
        stage: convertForm.stage || undefined,
        createAnyway,
      })
      const d = res.data || {}
      setConvertOpen(false)
      setConvertDuplicates([])
      if (d.opportunity?._id) navigate(`/sales/pipeline/${d.opportunity._id}`)
      else if (d.account?._id) navigate(`/sales/accounts/${d.account._id}`)
      else setActionMsg('Lead converted.')
    } catch (err) {
      if (err.code === 'DUPLICATE_ACCOUNT' || /duplicate account/i.test(err.message || '')) {
        setConvertDuplicates(err.data?.duplicates || [])
        setActionMsg(err.message || 'Possible duplicate account detected.')
      } else {
        setActionMsg(err.message || 'Convert failed.')
      }
    } finally {
      setActionBusy(false)
    }
  }

  const searchAccounts = async (q) => {
    const res = await accountsApi.list(q)
    return (res.data || []).map((a) => ({ id: a._id, label: a.name }))
  }

  const alreadyConverted = objectType === 'leads' && (data.status === 'Converted' || data.convertedAt)

  const openConvertModal = () => {
    setConvertDuplicates([])
    setConvertForm({
      createOpportunity: sales?.convertCreateOpportunity !== false,
      opportunityName: data.company ? `${data.company} — Opportunity` : '',
      amount: '',
      accountId: '',
      accountName: '',
      stage: sales?.convertDefaultStage || 'Prospecting',
    })
    setConvertOpen(true)
  }

  return (
    <div className="crm-record-detail">
      <header className="crm-record-header">
        <div>
          <p className="crm-muted">{cfg.label}</p>
          <h2>{cfg.title(data)}</h2>
          {actionMsg ? <p className="crm-muted">{actionMsg}</p> : null}
        </div>
        <div className="crm-record-actions">
          {objectType === 'leads' && !alreadyConverted ? (
            <>
              <button
                type="button"
                className="crm-btn-primary"
                disabled={actionBusy}
                onClick={openConvertModal}
              >
                Convert Lead
              </button>
              <EmailDraftButton objectType="leads" id={data._id} hasEmail={Boolean(data.email)} />
              <SendEmailButton objectType="leads" id={data._id} hasEmail={Boolean(data.email)} />
              <ReplyAssistButton objectType="leads" id={data._id} />
              <SequenceLiteButton
                objectType="leads"
                id={data._id}
                onDone={(d) => setActionMsg(`Sequence: Day 0 draft + follow-up due ${d?.day3DueDate || 'in 3 days'}.`)}
              />
            </>
          ) : null}
          {objectType === 'contacts' ? (
            <>
              <EmailDraftButton objectType="contacts" id={data._id} hasEmail={Boolean(data.email)} className="crm-btn-primary" />
              <SendEmailButton objectType="contacts" id={data._id} hasEmail={Boolean(data.email)} />
              <ReplyAssistButton objectType="contacts" id={data._id} />
              <SequenceLiteButton
                objectType="contacts"
                id={data._id}
                onDone={(d) => setActionMsg(`Sequence: Day 0 draft + follow-up due ${d?.day3DueDate || 'in 3 days'}.`)}
              />
            </>
          ) : null}
          {objectType === 'opportunities' ? (
            <>
              <Link className="crm-btn-primary" to={`/sales/pipeline/${data._id}/quote`}>
                Print quote
              </Link>
              <MeetingNotesButton
                opportunityId={data._id}
                onDone={(d) => {
                  setActionMsg(
                    `Meeting notes: ${(d?.tasksCreated || []).length} task(s) created`
                    + (d?.nextStep ? ` · next: ${d.nextStep}` : ''),
                  )
                  setTimelineKey((k) => k + 1)
                  opportunitiesApi.get(data._id).then((res) => {
                    if (res.data) setData(res.data)
                  }).catch(() => {})
                }}
              />
            </>
          ) : null}
          {objectType === 'accounts' ? (
            <>
              <FindContactsButton
                accountId={data._id}
                className="crm-btn-primary"
                onFound={async () => {
                  const [cRes] = await Promise.all([contactsApi.list('')])
                  const aid = String(data._id)
                  setRelated((prev) => ({
                    ...prev,
                    contacts: (cRes.data || []).filter((c) => String(c.accountId) === aid).slice(0, 20),
                  }))
                }}
              />
              {hunterConfigured ? (
                <button type="button" className="crm-btn-secondary" disabled={actionBusy} onClick={runHunter}>
                  {actionBusy ? 'Working…' : 'Hunter emails'}
                </button>
              ) : null}
              <button type="button" className="crm-btn-secondary" disabled={actionBusy} onClick={createOpportunity}>
                New Opportunity
              </button>
            </>
          ) : null}
          <Link className="crm-btn-secondary" to={cfg.listPath}>Back to list</Link>
          <button type="button" className="crm-btn-secondary" onClick={() => navigate(cfg.listPath)}>
            Close
          </button>
        </div>
      </header>

      <div className="crm-record-grid">
        <section className="crm-home-panel">
          <h3>Details</h3>
          <dl className="crm-detail-dl">
            {objectType === 'leads' ? (
              <>
                <div><dt>Company</dt><dd>{data.company || '—'}</dd></div>
                <div><dt>Status</dt><dd>{data.status || '—'}</dd></div>
                <div><dt>Email</dt><dd>{data.email || '—'}</dd></div>
                <div><dt>Phone</dt><dd>{data.phone || '—'}</dd></div>
                <div><dt>Website</dt><dd>{data.website || '—'}</dd></div>
                <div><dt>Industry</dt><dd>{data.industry || '—'}</dd></div>
                <div><dt>AI Score</dt><dd>{data.aiScore != null ? `${data.aiScore}/100` : '—'}</dd></div>
              </>
            ) : null}
            {objectType === 'accounts' ? (
              <>
                <div><dt>Website</dt><dd>{data.website || '—'}</dd></div>
                <div><dt>Phone</dt><dd>{data.phone || '—'}</dd></div>
                <div><dt>Type</dt><dd>{data.type || '—'}</dd></div>
                <div><dt>Region</dt><dd>{data.region || '—'}</dd></div>
                <div><dt>Country</dt><dd>{data.billingAddress?.country || '—'}</dd></div>
                <div><dt>Billing City</dt><dd>{data.billingAddress?.city || '—'}</dd></div>
              </>
            ) : null}
            {objectType === 'contacts' ? (
              <>
                <div><dt>Account</dt><dd>{data.accountName || '—'}</dd></div>
                <div><dt>Title</dt><dd>{data.title || '—'}</dd></div>
                <div><dt>Email</dt><dd>{data.email || '—'}</dd></div>
                <div><dt>Phone</dt><dd>{data.phone || '—'}</dd></div>
                <div><dt>Country</dt><dd>{data.mailingAddress?.country || '—'}</dd></div>
              </>
            ) : null}
            {objectType === 'opportunities' ? (
              <>
                <div><dt>Account</dt><dd>{data.accountName || '—'}</dd></div>
                <div><dt>Contact</dt><dd>{data.contactName || '—'}</dd></div>
                <div><dt>Amount</dt><dd>${Number(data.amount || 0).toLocaleString()}</dd></div>
                <div><dt>Stage</dt><dd>{data.stage || '—'}</dd></div>
                <div><dt>Close Date</dt><dd>{data.closeDate ? String(data.closeDate).slice(0, 10) : '—'}</dd></div>
                <div><dt>Next Step</dt><dd>{data.nextStep || '—'}</dd></div>
                <div><dt>Next Step Due</dt><dd>{data.nextStepDue ? String(data.nextStepDue).slice(0, 10) : '—'}</dd></div>
                <div>
                  <dt>Probability</dt>
                  <dd>{data.probability != null ? `${data.probability}%` : 'Stage default'}</dd>
                </div>
              </>
            ) : null}
            <div><dt>Description</dt><dd>{data.description || '—'}</dd></div>
          </dl>

          {objectType === 'opportunities' ? (
            <div style={{ marginTop: '1rem' }}>
              <h4>Update next step</h4>
              <label className="crm-field">
                <span>Next Step</span>
                <input
                  value={nextStepDraft.nextStep}
                  onChange={(e) => setNextStepDraft((d) => ({ ...d, nextStep: e.target.value }))}
                  placeholder="e.g. Call buyer Friday"
                />
              </label>
              <label className="crm-field">
                <span>Due</span>
                <input
                  type="date"
                  value={nextStepDraft.nextStepDue}
                  onChange={(e) => setNextStepDraft((d) => ({ ...d, nextStepDue: e.target.value }))}
                />
              </label>
              <button type="button" className="crm-btn-primary" disabled={actionBusy} onClick={saveNextStep}>
                Save next step
              </button>
            </div>
          ) : null}

          {objectType === 'opportunities' && (data.products || []).length ? (
            <>
              <h4>Products</h4>
              <ul className="crm-recent-list">
                {data.products.map((p, i) => (
                  <li key={p._id || i}>
                    <span>{p.productName || 'Product'}</span>
                    <span>{p.quantity} × ${Number(p.unitPrice || 0).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {objectType === 'opportunities' ? (
            <div style={{ marginTop: '1rem' }}>
              <h4>Recommended solutions</h4>
              {(data.recommendedSolutionIds || []).length === 0 ? (
                <p className="crm-muted">No recommendations yet.</p>
              ) : (
                <ul className="crm-recent-list">
                  {(data.recommendedSolutionIds || []).map((solutionId) => {
                    const selected = (data.selectedSolutionIds || []).includes(solutionId)
                    const rejected = (data.rejectedSolutionIds || []).includes(solutionId)
                    return (
                      <li key={solutionId}>
                        <span>
                          {solutionId}
                          {selected ? ' · accepted' : ''}
                          {rejected ? ' · rejected' : ''}
                        </span>
                        <span>
                          <button
                            type="button"
                            disabled={actionBusy || selected}
                            onClick={async () => {
                              setActionBusy(true)
                              try {
                                const res = await opportunitiesApi.acceptRecommendation(data._id, solutionId)
                                setData(res.data)
                                setActionMsg('Solution accepted.')
                              } catch (err) {
                                setActionMsg(err.message || 'Accept failed.')
                              } finally {
                                setActionBusy(false)
                              }
                            }}
                          >
                            Accept
                          </button>
                          {' '}
                          <button
                            type="button"
                            disabled={actionBusy || rejected}
                            onClick={async () => {
                              setActionBusy(true)
                              try {
                                const res = await opportunitiesApi.rejectRecommendation(data._id, solutionId)
                                setData(res.data)
                                setActionMsg('Solution rejected.')
                              } catch (err) {
                                setActionMsg(err.message || 'Reject failed.')
                              } finally {
                                setActionBusy(false)
                              }
                            }}
                          >
                            Reject
                          </button>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {nbaHint?.nextBestAction ? (
                <p className="crm-muted">Stage next action: {nbaHint.nextBestAction.action}</p>
              ) : null}
              <h4>Proposals</h4>
              {(proposals || []).length === 0 ? <p className="crm-muted">No proposals yet.</p> : (
                <ul className="crm-recent-list">
                  {proposals.map((proposal) => (
                    <li key={proposal._id}>
                      <span>{proposal.title} · {proposal.status}</span>
                      <span>
                        ${Number(proposal.total || 0).toLocaleString()}
                        {' '}
                        <button
                          type="button"
                          onClick={async () => {
                            const next = proposal.status === 'Draft' ? 'Sent' : proposal.status === 'Sent' ? 'Accepted' : 'Draft'
                            const res = await proposalsApi.update(proposal._id, { status: next })
                            setProposals((prev) => prev.map((item) => (item._id === proposal._id ? res.data : item)))
                          }}
                        >
                          Advance status
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="crm-btn-secondary"
                disabled={actionBusy}
                onClick={async () => {
                  setActionBusy(true)
                  try {
                    const res = await proposalsApi.create({
                      opportunityId: data._id,
                      accountId: data.accountId?._id || data.accountId || undefined,
                      contactId: data.contactId?._id || data.contactId || undefined,
                      title: `${data.name} — Proposal`,
                      status: 'Draft',
                    })
                    setProposals((prev) => [res.data, ...prev])
                    setActionMsg('Draft proposal created.')
                  } catch (err) {
                    setActionMsg(err.message || 'Could not create proposal.')
                  } finally {
                    setActionBusy(false)
                  }
                }}
              >
                Create draft proposal
              </button>
              {' '}
              <Link to={`/sales/pipeline/${data._id}/quote`}>Print quote</Link>
            </div>
          ) : null}
        </section>

        {(objectType === 'leads' || objectType === 'opportunities') ? (
          <QualificationPanel
            objectType={objectType}
            record={data}
            onSaved={setData}
          />
        ) : null}

        {objectType === 'accounts' ? (
          <section className="crm-home-panel">
            <h3>Company Intelligence</h3>
            {!intelligence ? (
              <p className="crm-muted">No opportunity analysis available. Research this company to generate recommendations.</p>
            ) : (
              <>
                <dl className="crm-detail-dl">
                  <div><dt>Industry</dt><dd>{intelligence.industry || 'Unknown'}</dd></div>
                  <div><dt>Business Type</dt><dd>{intelligence.businessType || 'Unknown'}</dd></div>
                  <div><dt>Opportunity Score</dt><dd>{intelligence.opportunityScore ?? intelligence.digitalOpportunityScore}/100 ({intelligence.scoreGrade})</dd></div>
                  <div><dt>Confidence Score</dt><dd>{intelligence.confidenceScore ?? intelligence.researchConfidence ?? 0}/100</dd></div>
                  <div><dt>Solution Fit</dt><dd>{intelligence.solutionFitScore ?? '—'}/100</dd></div>
                  <div><dt>Website</dt><dd>{intelligence.websiteStatus} <em className="crm-muted">({intelligence.websiteStatus === 'Verified' ? 'VERIFIED' : intelligence.websiteStatus === 'Likely' ? 'INFERRED' : 'UNKNOWN'})</em></dd></div>
                  <div><dt>E-commerce</dt><dd>{intelligence.ecommerceStatus} <em className="crm-muted">({intelligence.ecommerceStatus === 'Verified' ? 'VERIFIED' : intelligence.ecommerceStatus === 'Likely' ? 'INFERRED' : 'UNKNOWN'})</em></dd></div>
                  <div><dt>Mobile App</dt><dd>{intelligence.mobileAppStatus} <em className="crm-muted">({intelligence.mobileAppStatus === 'Verified' ? 'VERIFIED' : intelligence.mobileAppStatus === 'Likely' ? 'INFERRED' : 'UNKNOWN'})</em></dd></div>
                  <div><dt>Social Presence</dt><dd>{intelligence.socialPresence} <em className="crm-muted">({intelligence.socialPresence === 'Verified' ? 'VERIFIED' : intelligence.socialPresence === 'Likely' ? 'INFERRED' : 'UNKNOWN'})</em></dd></div>
                  <div><dt>Next Best Action</dt><dd>{intelligence.nextBestAction?.action || 'Review research and set next step'}</dd></div>
                </dl>
                {(intelligence.scoreBreakdown || []).length ? (
                  <>
                    <h4>Why this score</h4>
                    <ul className="crm-recent-list">
                      {intelligence.scoreBreakdown.map((item) => (
                        <li key={item.label}><span>{item.label}</span></li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <p className="crm-muted">What this company does: {intelligence.aiSummary?.whatThisCompanyDoes || 'Unknown'}</p>
                <p className="crm-muted">Visible technology: {intelligence.aiSummary?.visibleTechnology || 'Unknown'}</p>
                <p className="crm-muted">Digital gaps: {(intelligence.aiSummary?.digitalGaps || []).join(', ') || 'Unknown'}</p>
                <h4>Recommended Solutions</h4>
                <ul className="crm-recent-list">
                  {(intelligence.recommendations || []).map((item) => (
                    <li key={item.solutionId}>
                      <span>{item.name} · Fit {item.fitScore ?? '—'} · Conf {item.confidence ?? '—'} · {item.priority}</span>
                      <span>{item.reason}{item.detectedGap ? ` · Gap: ${item.detectedGap}` : ''}</span>
                    </li>
                  ))}
                </ul>
                <h4>Evidence buckets</h4>
                <p className="crm-muted">Verified: {Object.keys(intelligence.verifiedData || {}).join(', ') || 'None'}</p>
                <p className="crm-muted">Inferred: {Object.keys(intelligence.inferredData || {}).join(', ') || 'None'}</p>
                <p className="crm-muted">Unknown: {(intelligence.unknownData || []).join(', ') || 'None'}</p>
              </>
            )}
          </section>
        ) : null}

        {(objectType === 'accounts' || objectType === 'opportunities') && (data.industrySlug || intelligence?.industrySlug) ? (
          <PlaybookPanel industrySlug={data.industrySlug || intelligence?.industrySlug} />
        ) : null}

        <ActivityTimeline key={timelineKey} relatedType={cfg.relatedType} relatedId={id} />
      </div>

      <div className="crm-home-columns" style={{ marginTop: '1rem' }}>
        <RecordAiPanel
          objectType={objectType}
          id={id}
          canConvert={objectType === 'leads' && !alreadyConverted}
          onRequestConvert={openConvertModal}
          accountRegion={objectType === 'accounts' ? (data.region || '') : ''}
        />
      </div>

      {objectType === 'accounts' ? (
        <div className="crm-home-columns" style={{ marginTop: '1rem' }}>
          <section className="crm-home-panel">
            <h3>Related Contacts</h3>
            {related.contacts.length === 0 ? <p className="crm-muted">None</p> : (
              <ul className="crm-recent-list">
                {related.contacts.map((c) => (
                  <li key={c._id}>
                    <Link to={`/sales/contacts/${c._id}`}>{c.fullName || c.lastName}</Link>
                    <span>{c.email || c.phone || ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="crm-home-panel">
            <h3>Related Opportunities</h3>
            {related.opportunities.length === 0 ? <p className="crm-muted">None</p> : (
              <ul className="crm-recent-list">
                {related.opportunities.map((o) => (
                  <li key={o._id}>
                    <Link to={`/sales/pipeline/${o._id}`}>{o.name}</Link>
                    <span>{o.stage} · ${Number(o.amount || 0).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      <CrmModal
        title="Convert Lead"
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        requiredLegend={false}
        footer={(
          <>
            <button type="button" className="crm-btn-secondary" onClick={() => { setConvertOpen(false); setConvertDuplicates([]) }}>Cancel</button>
            {convertDuplicates.length ? (
              <button type="button" className="crm-btn-primary" disabled={actionBusy} onClick={() => runConvert(true)}>
                {actionBusy ? 'Converting…' : 'Create anyway'}
              </button>
            ) : (
              <button type="button" className="crm-btn-primary" disabled={actionBusy} onClick={() => runConvert(false)}>
                {actionBusy ? 'Converting…' : 'Convert'}
              </button>
            )}
          </>
        )}
      >
        <p className="crm-muted">Creates Account + Contact{convertForm.createOpportunity ? ' + Opportunity' : ''}.</p>
        {convertDuplicates.length ? (
          <div className="crm-banner-error" style={{ marginBottom: '0.75rem' }}>
            <p>Possible duplicates (name / domain / phone):</p>
            <ul>
              {convertDuplicates.map((dup) => (
                <li key={dup._id}>
                  <button
                    type="button"
                    onClick={() => setConvertForm((f) => ({
                      ...f,
                      accountId: dup._id,
                      accountName: dup.name,
                    }))}
                  >
                    Use {dup.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <LookupField
          label="Existing Account (optional)"
          valueId={convertForm.accountId}
          valueLabel={convertForm.accountName}
          placeholder="Leave empty to create from company…"
          onSearch={searchAccounts}
          onSelect={(opt) => setConvertForm((f) => ({ ...f, accountId: opt.id, accountName: opt.label }))}
          onClear={() => setConvertForm((f) => ({ ...f, accountId: '', accountName: '' }))}
        />
        <label className="crm-checkbox">
          <input
            type="checkbox"
            checked={convertForm.createOpportunity}
            onChange={(e) => setConvertForm((f) => ({ ...f, createOpportunity: e.target.checked }))}
          />
          Create Opportunity
        </label>
        {convertForm.createOpportunity ? (
          <>
            <label className="crm-field">
              <span>Opportunity Name</span>
              <input
                value={convertForm.opportunityName}
                onChange={(e) => setConvertForm((f) => ({ ...f, opportunityName: e.target.value }))}
              />
            </label>
            <label className="crm-field">
              <span>Amount</span>
              <input
                type="number"
                min="0"
                value={convertForm.amount}
                onChange={(e) => setConvertForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </label>
            <label className="crm-field">
              <span>Stage</span>
              <select
                value={convertForm.stage || 'Prospecting'}
                onChange={(e) => setConvertForm((f) => ({ ...f, stage: e.target.value }))}
              >
                {CONVERT_STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </CrmModal>
    </div>
  )
}
