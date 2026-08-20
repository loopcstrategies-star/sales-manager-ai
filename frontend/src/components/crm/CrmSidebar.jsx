import React from 'react'
import { NavLink } from 'react-router-dom'

const ITEMS = [
  {
    to: '/sales/home',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 3.2 3.5 10.2V21h6.2v-6.1h4.6V21h6.2V10.2L12 3.2z" />
      </svg>
    ),
  },
  {
    to: '/sales/industries',
    label: 'Industries',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M4 20V10l4-3 4 3v10H4zm8 0V4l4 2.5V20h-4zm6 0v-8l2 1.2V20h-2z" />
      </svg>
    ),
  },
  {
    to: '/sales/find-companies',
    label: 'Find Companies',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M10 4a6 6 0 1 0 3.9 10.6l4.2 4.2 1.4-1.4-4.2-4.2A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />
      </svg>
    ),
  },
  {
    to: '/sales/find-contacts',
    label: 'Find Contacts',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6.5 8v-1.5c0-2.5 3.5-4 6.5-4 .8 0 1.6.1 2.3.2-.5.5-.9 1.2-1.2 1.9-.4 0-.7-.1-1.1-.1-2.5 0-4.5 1-4.5 2v1.5h-2zm13.5-5.5h-1.5V13h-2v1.5H14v2h1.5V18h2v-1.5H19v-2z" />
      </svg>
    ),
  },
  {
    to: '/sales/leads',
    label: 'Leads',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm0 1.5c-3.2 0-7 1.6-7 4.5V20h14v-2c0-2.9-3.8-4.5-7-4.5z" />
      </svg>
    ),
  },
  {
    to: '/sales/contacts',
    label: 'Contacts',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M8.5 8.5a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zm7 0a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM3.5 19.5c0-3 2.8-5 5-5s5 2 5 5v.8H3.5v-.8zm9.2 0c.3-1.7 1.2-3.1 2.5-4 1.1-.7 2.4-1 3.8-1 2.2 0 5 2 5 5v.8h-11.3v-.8z" />
      </svg>
    ),
  },
  {
    to: '/sales/accounts',
    label: 'Accounts',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M3 21V8.5l5-3.2V21H3zm7 0V4l5 2.5V21h-5zm7 0V9.5L21 11v10h-4z" />
      </svg>
    ),
  },
  {
    to: '/sales/pipeline',
    label: 'Opportunities',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M4 18h16v2H4v-2zm2-3 3.5-4.5 3 2.5L17 7l1.5 1.2-5.5 7.3-3-2.5L6 15z" />
      </svg>
    ),
  },
  {
    to: '/sales/products',
    label: 'Products',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
      </svg>
    ),
  },
  {
    to: '/sales/solutions',
    label: 'Solutions',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 2 3 7v10l9 5 9-5V7l-9-5zm0 2.2L18.5 8 12 11.8 5.5 8 12 4.2zm-7 5.5 6 3.4v6.2l-6-3.3V9.7zm8 9.6v-6.2l6-3.4V16l-6 3.3z" />
      </svg>
    ),
  },
  {
    to: '/sales/price-books',
    label: 'Price Books',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 3h11a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2zm0 2v11.2l2-.9 4 2 4-2 2 .9V5H6z" />
      </svg>
    ),
  },
  {
    to: '/sales/calendar',
    label: 'Calendar',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v16H4V4h3V2zm11 6H6v10h12V8z" />
      </svg>
    ),
  },
  {
    to: '/sales/tasks',
    label: 'Tasks',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
      </svg>
    ),
  },
  {
    to: '/sales/analytics',
    label: 'Analytics',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M4 18h3V9H4v9zm6.5 0h3V5h-3v13zM17 18h3v-7h-3v7z" />
      </svg>
    ),
  },
  {
    to: '/sales/playbooks',
    label: 'Playbooks',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M5 4h12a2 2 0 0 1 2 2v13l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2zm0 2v9.5l2-.8 4 2 4-2 2 .8V6H5z" />
      </svg>
    ),
  },
  {
    to: '/sales/service',
    label: 'Service',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 21.2 10.4 19.7C5.4 15.2 2 12.2 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.7-3.4 6.7-8.4 11.2L12 21.2z" />
      </svg>
    ),
  },
  {
    to: '/sales/marketing',
    label: 'Marketing',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.7 0-8 1.3-8 4v2h10.2A6.5 6.5 0 0 1 16.5 9.1C14.8 9.7 12.7 11 10 11zm6.5 1a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 1.5 1.2 2.3 2.5.4-1.8 1.8.4 2.5-2.3-1.2-2.3 1.2.4-2.5-1.8-1.8 2.5-.4 1.2-2.3z" />
      </svg>
    ),
  },
  {
    to: '/sales/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M19.1 12.9a7.5 7.5 0 0 0 .1-1.8l2-1.5-2-3.5-2.4.7a7.4 7.4 0 0 0-1.5-.9L14.8 3h-4l-.5 2.9a7.4 7.4 0 0 0-1.5.9l-2.4-.7-2 3.5 2 1.5a7.5 7.5 0 0 0 0 1.8l-2 1.5 2 3.5 2.4-.7c.5.4 1 .7 1.5.9l.5 2.9h4l.5-2.9c.5-.2 1-.5 1.5-.9l2.4.7 2-3.5-2-1.5zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" />
      </svg>
    ),
  },
]

export default function CrmSidebar() {
  return (
    <nav className="crm-sidebar" aria-label="CRM modules">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `crm-sidebar-item${isActive ? ' active' : ''}`}
        >
          <span className="crm-sidebar-icon">{item.icon}</span>
          <span className="crm-sidebar-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
