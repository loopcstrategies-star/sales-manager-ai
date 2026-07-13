import React from 'react'
import { Outlet } from 'react-router-dom'
import AppShell from '../components/AppShell'
import CrmSidebar from '../components/crm/CrmSidebar'

export default function SalesPage() {
  return (
    <AppShell hideSidebar theme="luxury">
      <div className="crm-shell crm-theme-luxury">
        <CrmSidebar />
        <div className="crm-main">
          <Outlet />
        </div>
      </div>
    </AppShell>
  )
}
