import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { usePreferences } from '../../context/PreferencesContext'
import {
  DEFAULT_SALES_PREFS,
  STAGE_PROB_KEYS,
  CONVERT_STAGES,
  mergeSalesPrefs,
} from '../../components/crm/salesPrefs'

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <label className="settings-toggle-row">
      <div>
        <span className="settings-toggle-label">{label}</span>
        {hint ? <p className="settings-hint">{hint}</p> : null}
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export default function SalesSettingsPage() {
  const { sales, loading, updatePreferences } = usePreferences()
  const [draft, setDraft] = useState(mergeSalesPrefs())
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!loading) setDraft(mergeSalesPrefs(sales))
  }, [sales, loading])

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(mergeSalesPrefs(sales)),
    [draft, sales],
  )

  const patch = useCallback((partial) => {
    setDraft((prev) => mergeSalesPrefs({ ...prev, ...partial }))
  }, [])

  const patchStage = useCallback((key, value) => {
    const n = Math.max(0, Math.min(100, Number(value) || 0))
    setDraft((prev) => mergeSalesPrefs({
      ...prev,
      stageProbabilities: { ...prev.stageProbabilities, [key]: n },
    }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setToast('')
    try {
      await updatePreferences({ sales: draft })
      setToast('Sales settings saved.')
      setTimeout(() => setToast(''), 3000)
    } catch (err) {
      setToast(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setDraft(mergeSalesPrefs(DEFAULT_SALES_PREFS))
  }

  if (loading) {
    return <div className="crm-page"><p className="crm-muted">Loading settings…</p></div>
  }

  return (
    <div className="crm-page settings-page">
      <div className="settings-page-header">
        <div>
          <h2>Sales settings</h2>
          <p className="settings-hint">
            Control automation defaults for email, contacts, convert, enrich, and forecast.
          </p>
        </div>
        <div className="settings-save-row">
          {toast ? (
            <span className={`settings-toast${toast.includes('failed') || toast.includes('Failed') ? ' error' : ''}`}>
              {toast}
            </span>
          ) : null}
          <button type="button" className="crm-btn-secondary" onClick={handleReset}>
            Reset defaults
          </button>
          <button type="button" className="crm-btn-primary" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="settings-card">
        <h3 className="settings-section-title">Email automation</h3>
        <label className="crm-field">
          <span>Default tone</span>
          <select
            value={draft.emailTone}
            onChange={(e) => patch({ emailTone: e.target.value })}
          >
            <option value="brief">Brief</option>
            <option value="professional">Professional</option>
            <option value="warm">Warm</option>
          </select>
        </label>
        <ToggleRow
          label="Save email drafts as Tasks"
          hint="When you draft outreach, also create a CRM task on the lead or contact."
          checked={draft.saveEmailAsTask}
          onChange={(v) => patch({ saveEmailAsTask: v })}
        />
      </div>

      <div className="settings-card">
        <h3 className="settings-section-title">Find contacts</h3>
        <ToggleRow
          label="Auto-save found contacts"
          hint="Create Contact records when Find contacts / batch find succeeds."
          checked={draft.findContactsAutoSave}
          onChange={(v) => patch({ findContactsAutoSave: v })}
        />
        <label className="crm-field">
          <span>Max contacts per find (3–15)</span>
          <input
            type="number"
            min={3}
            max={15}
            value={draft.findContactsMax}
            onChange={(e) => patch({ findContactsMax: Number(e.target.value) || 5 })}
          />
        </label>
        <ToggleRow
          label="Mark found contacts Needs verify"
          hint="Flag web/Hunter contacts so you confirm before outreach."
          checked={draft.findContactsNeedsVerify}
          onChange={(v) => patch({ findContactsNeedsVerify: v })}
        />
      </div>

      <div className="settings-card">
        <h3 className="settings-section-title">Growth &amp; automation</h3>
        <p className="settings-hint">Controls web import volume, Fill pipeline, and scheduled thin-account finding.</p>
        <label className="crm-field">
          <span>Batch find cap (10–50)</span>
          <input
            type="number"
            min={10}
            max={50}
            value={draft.batchFindCap}
            onChange={(e) => patch({ batchFindCap: Number(e.target.value) || 25 })}
          />
        </label>
        <label className="crm-field">
          <span>Web import queries (1–8)</span>
          <input
            type="number"
            min={1}
            max={8}
            value={draft.bulkQueries}
            onChange={(e) => patch({ bulkQueries: Number(e.target.value) || 5 })}
          />
        </label>
        <label className="crm-field">
          <span>Accounts per query (1–12)</span>
          <input
            type="number"
            min={1}
            max={12}
            value={draft.perQuery}
            onChange={(e) => patch({ perQuery: Number(e.target.value) || 8 })}
          />
        </label>
        <label className="crm-field">
          <span>Default prospect region</span>
          <input
            value={draft.defaultProspectRegion || ''}
            placeholder="e.g. UAE, Middle East"
            onChange={(e) => patch({ defaultProspectRegion: e.target.value })}
          />
        </label>
        <ToggleRow
          label="After web import, also find contacts"
          hint="When using Import from web, automatically run find contacts on thin Accounts."
          checked={draft.fillPipelineOnImport}
          onChange={(v) => patch({ fillPipelineOnImport: v })}
        />
        <ToggleRow
          label="Scheduled thin-account find"
          hint="Periodically find contacts for Accounts that still lack a real email. Off by default."
          checked={draft.scheduledFindEnabled}
          onChange={(v) => patch({ scheduledFindEnabled: v })}
        />
        <label className="crm-field">
          <span>Scheduled find interval (hours, 6–48)</span>
          <input
            type="number"
            min={6}
            max={48}
            value={draft.scheduledFindHours}
            onChange={(e) => patch({ scheduledFindHours: Number(e.target.value) || 24 })}
          />
        </label>
      </div>

      <div className="settings-card">
        <h3 className="settings-section-title">Lead convert</h3>
        <ToggleRow
          label="Auto-create Opportunity on convert"
          hint="When converting a lead, also open a pipeline opportunity."
          checked={draft.convertCreateOpportunity}
          onChange={(v) => patch({ convertCreateOpportunity: v })}
        />
        <label className="crm-field">
          <span>Default opportunity stage</span>
          <select
            value={draft.convertDefaultStage}
            onChange={(e) => patch({ convertDefaultStage: e.target.value })}
          >
            {CONVERT_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="settings-card">
        <h3 className="settings-section-title">Enrichment</h3>
        <ToggleRow
          label="Scheduled enrich refresh"
          hint="Periodically re-fill stale lead/account fields from the web. Server env can still force this off."
          checked={draft.enrichRefreshEnabled}
          onChange={(v) => patch({ enrichRefreshEnabled: v })}
        />
        <ToggleRow
          label="Fill empty fields only"
          hint="Off = overwrite existing values during scheduled refresh."
          checked={draft.enrichFillEmptyOnly}
          onChange={(v) => patch({ enrichFillEmptyOnly: v })}
        />
        <label className="crm-field">
          <span>Stale after (days, 7–90)</span>
          <input
            type="number"
            min={7}
            max={90}
            value={draft.enrichStaleDays}
            onChange={(e) => patch({ enrichStaleDays: Number(e.target.value) || 30 })}
          />
        </label>
      </div>

      <div className="settings-card">
        <h3 className="settings-section-title">Next-step automation</h3>
        <ToggleRow
          label="Auto-create Task when next step is overdue"
          hint="For open opportunities with a past next-step due date, create one Follow-up task (no duplicates)."
          checked={draft.autoTaskFromNextStep}
          onChange={(v) => patch({ autoTaskFromNextStep: v })}
        />
      </div>

      <div className="settings-card">
        <h3 className="settings-section-title">Pipeline forecast (%)</h3>
        <p className="settings-hint">Used for weighted pipeline on Sales Analytics when a deal has no custom probability.</p>
        <div className="sales-settings-probs">
          {STAGE_PROB_KEYS.map((key) => (
            <label key={key} className="crm-field">
              <span>{key}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={draft.stageProbabilities?.[key] ?? 0}
                onChange={(e) => patchStage(key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
