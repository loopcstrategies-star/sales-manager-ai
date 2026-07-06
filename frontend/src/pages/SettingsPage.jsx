import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { configApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { usePreferences } from '../context/PreferencesContext'
import { DEFAULT_DASHBOARD_PREFS, FILTER_CHIPS } from '../components/dashboard/dashboardUtils'

const TABS = [
  { id: 'display', label: 'Dashboard display' },
  { id: 'feed', label: 'Feed & topics' },
  { id: 'account', label: 'Account & system' },
]

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <label className="settings-toggle-row">
      <div>
        <span className="settings-toggle-label">{label}</span>
        {hint && <p className="settings-hint">{hint}</p>}
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()
  const { dashboard, server, providers, loading, updatePreferences } = usePreferences()
  const [tab, setTab] = useState('display')
  const [draft, setDraft] = useState({ ...DEFAULT_DASHBOARD_PREFS })
  const [regions, setRegions] = useState([{ id: '', label: 'Global' }])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!loading) setDraft({ ...DEFAULT_DASHBOARD_PREFS, ...dashboard })
  }, [dashboard, loading])

  useEffect(() => {
    configApi.get().then((cfg) => {
      if (cfg.regions?.length) setRegions(cfg.regions)
    }).catch(() => {})
  }, [])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify({ ...DEFAULT_DASHBOARD_PREFS, ...dashboard }), [draft, dashboard])

  const patchDraft = useCallback((partial) => {
    setDraft((prev) => ({ ...prev, ...partial }))
  }, [])

  const patchSections = useCallback((key, value) => {
    setDraft((prev) => ({
      ...prev,
      sections: { ...prev.sections, [key]: value },
    }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setToast('')
    try {
      await updatePreferences({ dashboard: draft })
      setToast('Settings saved.')
      setTimeout(() => setToast(''), 3000)
    } catch (err) {
      setToast(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const addCustomTopic = () => {
    const topic = window.prompt('Add a keyword to filter cards (e.g. Turkey, wholesale)')
    if (!topic?.trim()) return
    const next = [...(draft.customTopics || []), topic.trim()].slice(0, 10)
    patchDraft({ customTopics: next })
  }

  const removeCustomTopic = (idx) => {
    patchDraft({ customTopics: draft.customTopics.filter((_, i) => i !== idx) })
  }

  return (
    <AppShell>
      <div className="settings-page">
        <div className="settings-page-header">
          <div>
            <h2>Settings</h2>
            <p className="settings-hint">Control how your dashboard looks and which stories appear.</p>
          </div>
          <div className="settings-save-row">
            {toast && <span className={`settings-toast${toast.includes('failed') ? ' error' : ''}`}>{toast}</span>}
            <button type="button" className="btn" disabled={!dirty || saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="settings-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`settings-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'display' && (
          <div className="settings-card">
            <ToggleRow
              label="Show price tiles"
              hint="Gold and silver spot prices at the top of the dashboard."
              checked={draft.showPriceTiles}
              onChange={(v) => patchDraft({ showPriceTiles: v })}
            />
            <ToggleRow
              label="Show headline ticker"
              hint="Scrolling strip of headlines under the header."
              checked={draft.showTicker}
              onChange={(v) => patchDraft({ showTicker: v })}
            />
            <ToggleRow
              label="Show headlines row"
              hint="Horizontal row of short headline cards."
              checked={draft.showHeadlinesRow}
              onChange={(v) => patchDraft({ showHeadlinesRow: v })}
            />
            <ToggleRow
              label="Show hero story"
              hint="Large top story card for the leading headline."
              checked={draft.showHero}
              onChange={(v) => patchDraft({ showHero: v })}
            />
            <ToggleRow
              label="Show card images"
              hint="Thumbnails on cards when a source image is available."
              checked={draft.showImages}
              onChange={(v) => patchDraft({ showImages: v })}
            />
            <ToggleRow
              label="Compact cards"
              hint="Smaller padding and shorter summaries for a denser layout."
              checked={draft.compactCards}
              onChange={(v) => patchDraft({ compactCards: v })}
            />
          </div>
        )}

        {tab === 'feed' && (
          <div className="settings-card">
            <label className="settings-field">
              Default region
              <select
                value={draft.defaultRegion}
                onChange={(e) => patchDraft({ defaultRegion: e.target.value })}
                className="sidebar-input"
              >
                {regions.map((r) => (
                  <option key={r.id || 'global'} value={r.id}>{r.label}</option>
                ))}
              </select>
              <span className="settings-hint">Scopes Tavily queries (same regions as chat).</span>
            </label>

            <div className="settings-field">
              <span className="settings-toggle-label">Enabled sections</span>
              <label className="settings-checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.sections?.metals !== false}
                  onChange={(e) => patchSections('metals', e.target.checked)}
                />
                Precious metals & jewelry
              </label>
              <label className="settings-checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.sections?.general !== false}
                  onChange={(e) => patchSections('general', e.target.checked)}
                />
                General market & sales
              </label>
            </div>

            <div className="settings-field">
              <span className="settings-toggle-label">Topic filter</span>
              <div className="dashboard-filters">
                {FILTER_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={`filter-chip${draft.topicFilter === chip.id ? ' active' : ''}`}
                    onClick={() => patchDraft({ topicFilter: chip.id })}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-field">
              <span className="settings-toggle-label">Custom topics</span>
              <p className="settings-hint">Keywords that filter cards client-side (max 10).</p>
              <div className="settings-topic-list">
                {(draft.customTopics || []).map((t, i) => (
                  <span key={`${t}-${i}`} className="tag-pill settings-topic-pill">
                    {t}
                    <button type="button" aria-label={`Remove ${t}`} onClick={() => removeCustomTopic(i)}>×</button>
                  </span>
                ))}
                {(draft.customTopics || []).length < 10 && (
                  <button type="button" className="btn-secondary" onClick={addCustomTopic}>+ Add topic</button>
                )}
              </div>
            </div>

            <label className="settings-field">
              Sort order
              <select
                value={draft.sortOrder}
                onChange={(e) => patchDraft({ sortOrder: e.target.value })}
                className="sidebar-input"
              >
                <option value="headlines">Headlines first</option>
                <option value="newest">Newest first</option>
              </select>
            </label>

            <label className="settings-field">
              UI auto-refresh
              <select
                value={draft.pollMinutes}
                onChange={(e) => patchDraft({ pollMinutes: Number(e.target.value) })}
                className="sidebar-input"
              >
                <option value={1}>Every 1 minute</option>
                <option value={5}>Every 5 minutes</option>
                <option value={10}>Every 10 minutes</option>
                <option value={15}>Every 15 minutes</option>
              </select>
              <span className="settings-hint">
                Re-fetches the cached snapshot from the server. Does not rebuild the feed.
              </span>
            </label>

            <p className="settings-hint settings-readonly-note">
              Server refresh runs every {server?.dashboardRefreshHours ?? 4} hours on Railway.
              Use <strong>Refresh now</strong> on the dashboard for an immediate rebuild (once per 10 min).
              API keys (GoldAPI, NewsAPI, Tavily) are configured on the server — not in Settings.
            </p>
          </div>
        )}

        {tab === 'account' && (
          <div className="settings-card">
            <div className="settings-field">
              <span className="settings-toggle-label">Account</span>
              <p><strong>{user?.name}</strong></p>
              <p className="settings-hint">{user?.email}</p>
            </div>

            <div className="settings-field">
              <span className="settings-toggle-label">Provider status</span>
              <div className="provider-status-grid">
                {[
                  { key: 'groq', label: 'Groq' },
                  { key: 'tavily', label: 'Tavily' },
                  { key: 'newsApi', label: 'NewsAPI' },
                  { key: 'goldApi', label: 'GoldAPI' },
                ].map(({ key, label }) => (
                  <div key={key} className={`provider-status-card${providers?.[key] ? ' ok' : ''}`}>
                    <span>{label}</span>
                    <span>{providers?.[key] ? 'Connected' : 'Not configured'}</span>
                  </div>
                ))}
              </div>
              <p className="settings-hint">
                Search provider: {providers?.searchProvider || '—'}
              </p>
            </div>

            <p className="settings-hint">
              See <Link to="/dashboard">Dashboard</Link> for live feed meta, or read{' '}
              <a href="https://github.com/loopc-business-strategies/sales-manager-ai/blob/main/CHAT_GUIDE.md" target="_blank" rel="noopener noreferrer">
                CHAT_GUIDE.md
              </a>
              {' '}for dashboard and settings documentation.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
