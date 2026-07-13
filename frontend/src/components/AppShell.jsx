import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AppShell({
  children,
  sidebarExtra,
  headerExtra,
  sidebarOpen,
  onToggleSidebar,
  hideSidebar = false,
  theme,
}) {
  const { user, workspace, logout } = useAuth()
  const showSidebar = !hideSidebar && Boolean(sidebarExtra)
  const salesMode = theme === 'luxury'

  return (
    <div className={`app-shell${salesMode ? ' app-shell--sales' : ''}`}>
      <header className={`topbar${salesMode ? ' topbar--sales' : ''}`}>
        <div className="topbar-left">
          {showSidebar ? (
            <button
              type="button"
              className="sidebar-toggle"
              onClick={onToggleSidebar}
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
          ) : null}
          <div className="topbar-brand">
            <h1>Sales Manager AI</h1>
            <p className="topbar-workspace">Workspace: {workspace?.name || '—'}</p>
          </div>
        </div>

        <nav className="topbar-nav" aria-label="Main">
          <NavLink to="/" end className={({ isActive }) => `topbar-nav-link${isActive ? ' active' : ''}`}>
            Chat
          </NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => `topbar-nav-link${isActive ? ' active' : ''}`}>
            Dashboard
          </NavLink>
          <NavLink to="/sales" className={({ isActive }) => `topbar-nav-link${isActive ? ' active' : ''}`}>
            Sales
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `topbar-nav-link${isActive ? ' active' : ''}`}>
            Settings
          </NavLink>
        </nav>

        <div className="topbar-right">
          {headerExtra}
          <span className="topbar-user">{user?.name}</span>
          <button
            type="button"
            className="btn-secondary topbar-signout"
            onClick={logout}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className={`chat-layout${showSidebar ? '' : ' chat-layout-full'}`}>
        {showSidebar ? (
          <aside className={`chat-sidebar${sidebarOpen ? ' open' : ''}`}>
            {sidebarExtra}
          </aside>
        ) : null}

        <div className="chat-main">
          {children}
        </div>
      </div>
    </div>
  )
}
