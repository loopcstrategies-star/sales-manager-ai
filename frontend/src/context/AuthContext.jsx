import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, setToken } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [workspace, setWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await authApi.me()
      setUser(data.user)
      setWorkspace(data.workspace)
    } catch {
      setUser(null)
      setWorkspace(null)
      setToken('')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password })
    setToken(data.token)
    setUser(data.user)
    await refresh()
    return data
  }, [refresh])

  const register = useCallback(async (payload) => {
    const data = await authApi.register(payload)
    setToken(data.token)
    setUser(data.user)
    await refresh()
    return data
  }, [refresh])

  const logout = useCallback(() => {
    setToken('')
    setUser(null)
    setWorkspace(null)
  }, [])

  const value = useMemo(() => ({
    user,
    workspace,
    loading,
    login,
    register,
    logout,
    refresh,
  }), [user, workspace, loading, login, register, logout, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
