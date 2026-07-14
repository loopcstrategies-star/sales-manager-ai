import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { settingsApi } from '../api/client'
import { useAuth } from './AuthContext'
import {
  DEFAULT_DASHBOARD_PREFS,
  applyDashboardFilter as filterCards,
} from '../components/dashboard/dashboardUtils'
import { DEFAULT_SALES_PREFS, mergeSalesPrefs } from '../components/crm/salesPrefs'

const PreferencesContext = createContext(null)

export function PreferencesProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [preferences, setPreferences] = useState({
    dashboard: { ...DEFAULT_DASHBOARD_PREFS },
    sales: { ...DEFAULT_SALES_PREFS },
  })
  const [server, setServer] = useState({ dashboardRefreshHours: 4 })
  const [providers, setProviders] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!user) {
      setPreferences({
        dashboard: { ...DEFAULT_DASHBOARD_PREFS },
        sales: { ...DEFAULT_SALES_PREFS },
      })
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await settingsApi.get()
      setPreferences({
        dashboard: { ...DEFAULT_DASHBOARD_PREFS, ...(data.preferences?.dashboard || {}) },
        sales: mergeSalesPrefs(data.preferences?.sales),
      })
      setServer(data.server || { dashboardRefreshHours: 4 })
      setProviders(data.providers || null)
    } catch (err) {
      setError(err.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (authLoading) return
    load()
  }, [authLoading, load])

  const updatePreferences = useCallback(async (patch) => {
    const data = await settingsApi.update(patch)
    setPreferences({
      dashboard: { ...DEFAULT_DASHBOARD_PREFS, ...(data.preferences?.dashboard || {}) },
      sales: mergeSalesPrefs(data.preferences?.sales),
    })
    if (data.server) setServer(data.server)
    if (data.providers) setProviders(data.providers)
    return data
  }, [])

  const applyDashboardFilter = useCallback((cards) => {
    return filterCards(cards, preferences)
  }, [preferences])

  const value = useMemo(() => ({
    preferences,
    dashboard: preferences.dashboard || DEFAULT_DASHBOARD_PREFS,
    sales: preferences.sales || DEFAULT_SALES_PREFS,
    server,
    providers,
    loading,
    error,
    load,
    updatePreferences,
    applyDashboardFilter,
  }), [preferences, server, providers, loading, error, load, updatePreferences, applyDashboardFilter])

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider')
  return ctx
}
