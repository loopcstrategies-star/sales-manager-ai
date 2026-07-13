import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: 'cases', label: 'Cases', chevron: true },
  { to: 'contacts', label: 'Contacts', chevron: true },
  { to: 'accounts', label: 'Accounts', chevron: true },
  { to: 'messaging', label: 'Messaging Sessions', chevron: true },
  { to: 'analytics', label: 'Analytics', chevron: false },
  { to: 'knowledge', label: 'Knowledge', chevron: true },
]

export default function ServiceLayout() {
  return (
    <div className="crm-service-app">
      <nav className="crm-service-tabs" aria-label="Service modules">
        <span className="crm-service-app-label">Service</span>
        <div className="crm-service-tab-list" role="tablist">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              role="tab"
              className={({ isActive }) => `crm-service-tab${isActive ? ' active' : ''}`}
            >
              <span>{tab.label}</span>
              {tab.chevron ? (
                <svg className="crm-service-tab-chevron" viewBox="0 0 12 12" aria-hidden="true">
                  <path fill="currentColor" d="M2.5 4.2 6 7.8l3.5-3.6.7.7L6 9.2 1.8 4.9z" />
                </svg>
              ) : null}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="crm-service-outlet">
        <Outlet />
      </div>
    </div>
  )
}
