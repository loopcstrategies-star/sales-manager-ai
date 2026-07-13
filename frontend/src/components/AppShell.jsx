import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AppShell({
  children,
  sidebarExtra,
  headerExtra,
  sidebarOpen,
  onToggleSidebar,
}) {
  const { user, workspace, logout } = useAuth()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <h1>Sales Manager AI</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {headerExtra}
          <span style={{ fontSize: '0.85rem', opacity: 0.85 }}>{user?.name}</span>
          <button
            type="button"
            className="btn-secondary"
            onClick={logout}
            style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="chat-layout">
        <aside className={`chat-sidebar${sidebarOpen ? ' open' : ''}`}>
          <nav className="sidebar-nav">
            <NavLink to="/" end className={({ isActive }) => `sidebar-nav-link${isActive ? ' active' : ''}`}>
              Chat
            </NavLink>
            <NavLink to="/dashboard" className={({ isActive }) => `sidebar-nav-link${isActive ? ' active' : ''}`}>
              Dashboard
            </NavLink>
            <NavLink to="/sales" className={({ isActive }) => `sidebar-nav-link${isActive ? ' active' : ''}`}>
              Sales
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `sidebar-nav-link${isActive ? ' active' : ''}`}>
              Settings
            </NavLink>
          </nav>

          <p className="sidebar-meta">Workspace: {workspace?.name || '—'}</p>

          {sidebarExtra}
        </aside>

        <div className="chat-main">
          {children}
        </div>
      </div>
    </div>
  )
}
