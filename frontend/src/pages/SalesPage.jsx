import React from 'react'
import { Outlet } from 'react-router-dom'
import AppShell from '../components/AppShell'
import CrmSidebar from '../components/crm/CrmSidebar'

export default function SalesPage() {
  return (
    <AppShell hideSidebar>
      <div className="crm-shell">
        <CrmSidebar />
        <div className="crm-main">
          <Outlet />
        </div>
      </div>
    </AppShell>
  )
}
