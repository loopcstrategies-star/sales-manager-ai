import React, { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

const PLUS_ICON = (
  <svg className="crm-service-menu-plus" viewBox="0 0 12 12" aria-hidden="true">
    <path fill="currentColor" d="M5.25 1.5h1.5v3.75H10.5v1.5H6.75V10.5h-1.5V6.75H1.5v-1.5h3.75V1.5z" />
  </svg>
)

const TABS = [
  {
    to: 'cases',
    label: 'Cases',
    chevron: true,
    newAction: { label: 'New Case', search: 'new=1' },
    listsHeader: 'Recent lists',
    lists: [
      { label: 'All Open Cases', search: 'list=all-open' },
      { label: 'Unassigned', search: 'list=unassigned' },
      { label: 'My Cases', search: 'list=my' },
      { label: 'My Open Cases', search: 'list=my-open' },
    ],
  },
  {
    to: 'contacts',
    label: 'Contacts',
    chevron: true,
    newAction: { label: 'New Contact', search: 'new=1' },
    listsHeader: 'Recent lists',
    lists: [
      { label: 'All Contacts', search: 'list=all' },
      { label: 'My Contacts', search: 'list=my' },
      { label: 'New This Week', search: 'list=new-this-week' },
      { label: 'Birthdays This Month', search: 'list=birthdays' },
    ],
  },
  {
    to: 'accounts',
    label: 'Accounts',
    chevron: true,
    newAction: { label: 'New Account', search: 'new=1' },
    listsHeader: 'Recent lists',
    lists: [
      { label: 'All Accounts', search: 'list=all' },
      { label: 'My Accounts', search: 'list=my' },
      { label: 'New This Week', search: 'list=new-this-week' },
    ],
  },
  {
    to: 'messaging',
    label: 'Messaging Sessions',
    chevron: true,
    newAction: { label: 'Open "Recently Viewed" in New Tab', search: '' },
    listsHeader: null,
    lists: [],
  },
  {
    to: 'analytics',
    label: 'Analytics',
    chevron: false,
  },
  {
    to: 'knowledge',
    label: 'Knowledge',
    chevron: true,
    newAction: { label: 'New Knowledge', search: 'new=1' },
    listsHeader: 'Recent lists',
    lists: [
      { label: 'Archived Articles', search: 'list=archived' },
      { label: 'Published Articles', search: 'list=published' },
      { label: 'Draft Articles', search: 'list=draft' },
    ],
  },
]

export default function ServiceLayout() {
  const navigate = useNavigate()
  const [openTab, setOpenTab] = useState(null)
  const navRef = useRef(null)

  useEffect(() => {
    if (!openTab) return undefined
    const onPointerDown = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setOpenTab(null)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenTab(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openTab])

  const go = (tabPath, search = '') => {
    setOpenTab(null)
    navigate({ pathname: tabPath, search: search ? `?${search}` : '' })
  }

  return (
    <div className="crm-service-app">
      <nav className="crm-service-tabs" aria-label="Service modules" ref={navRef}>
        <span className="crm-service-app-label">Service</span>
        <div className="crm-service-tab-list" role="tablist">
          {TABS.map((tab) => {
            const menuOpen = openTab === tab.to
            return (
              <div
                key={tab.to}
                className={`crm-service-tab-wrap${menuOpen ? ' menu-open' : ''}`}
              >
                <div className="crm-service-tab-inner">
                  <NavLink
                    to={tab.to}
                    role="tab"
                    className={({ isActive }) => `crm-service-tab-label${isActive || menuOpen ? ' active' : ''}`}
                    onClick={() => setOpenTab(null)}
                  >
                    {tab.label}
                  </NavLink>
                  {tab.chevron ? (
                    <button
                      type="button"
                      className={`crm-service-tab-chevron-btn${menuOpen ? ' open' : ''}`}
                      aria-label={`${tab.label} menu`}
                      aria-expanded={menuOpen}
                      aria-haspopup="menu"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setOpenTab((cur) => (cur === tab.to ? null : tab.to))
                      }}
                    >
                      <svg className="crm-service-tab-chevron" viewBox="0 0 12 12" aria-hidden="true">
                        <path fill="currentColor" d="M2.5 4.2 6 7.8l3.5-3.6.7.7L6 9.2 1.8 4.9z" />
                      </svg>
                    </button>
                  ) : null}
                </div>

                {tab.chevron && menuOpen ? (
                  <div className="crm-service-tab-menu" role="menu">
                    <span className="crm-service-tab-menu-caret" aria-hidden="true" />
                    {tab.newAction ? (
                      <button
                        type="button"
                        className="crm-service-menu-item crm-service-menu-new"
                        role="menuitem"
                        onClick={() => go(tab.to, tab.newAction.search)}
                      >
                        {PLUS_ICON}
                        <span>{tab.newAction.label}</span>
                      </button>
                    ) : null}
                    {tab.listsHeader || (tab.lists && tab.lists.length) ? (
                      <>
                        {tab.newAction ? <div className="crm-service-menu-divider" /> : null}
                        {tab.listsHeader ? (
                          <p className="crm-service-menu-section">{tab.listsHeader}</p>
                        ) : null}
                        {(tab.lists || []).map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            className="crm-service-menu-item"
                            role="menuitem"
                            onClick={() => go(tab.to, item.search)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </nav>
      <div className="crm-service-outlet">
        <Outlet />
      </div>
    </div>
  )
}
