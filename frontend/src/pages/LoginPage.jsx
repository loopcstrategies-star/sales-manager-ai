import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login, register, user } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register({ email, password, name })
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="auth-page">
        <div className="auth-card ui-enter">
          <p className="auth-brand">Sales Manager AI</p>
          <p className="crm-muted" style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>
            Research, qualify, and close — in one workspace.
          </p>
          <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            {error && <p style={{ color: 'var(--crm-error)', fontSize: '0.9rem' }}>{error}</p>}
            <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Please wait…' : (mode === 'login' ? 'Sign in' : 'Register')}
            </button>
          </form>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
            {mode === 'login' ? (
              <>No account? <button type="button" className="btn-secondary" onClick={() => setMode('register')}>Register</button></>
            ) : (
              <>Have an account? <button type="button" className="btn-secondary" onClick={() => setMode('login')}>Sign in</button></>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
