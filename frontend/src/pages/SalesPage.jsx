import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import AppShell from '../components/AppShell'
import CrmSidebar from '../components/crm/CrmSidebar'

export default function SalesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <AppShell
      sidebarOpen={sidebarOpen}
      onToggleSidebar={() => setSidebarOpen((v) => !v)}
    >
      <div className="crm-shell">
        <CrmSidebar />
        <div className="crm-main">
          <Outlet />
        </div>
      </div>
    </AppShell>
  )
}
