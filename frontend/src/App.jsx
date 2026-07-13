import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
import DashboardPage from './pages/DashboardPage'
import SettingsPage from './pages/SettingsPage'
import EmbedPage from './pages/EmbedPage'
import SalesPage from './pages/SalesPage'
import CrmHomePage from './pages/crm/CrmHomePage'
import ContactsPage from './pages/crm/ContactsPage'
import AccountsPage from './pages/crm/AccountsPage'
import PipelinePage from './pages/crm/PipelinePage'
import ServicePage from './pages/crm/ServicePage'
import MarketingPage from './pages/crm/MarketingPage'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ padding: '2rem' }}>Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/embed" element={<EmbedPage />} />
      <Route path="/" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
      <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
      <Route
        path="/sales"
        element={(
          <PrivateRoute>
            <SalesPage />
          </PrivateRoute>
        )}
      >
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<CrmHomePage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="service" element={<ServicePage />} />
        <Route path="marketing" element={<MarketingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
