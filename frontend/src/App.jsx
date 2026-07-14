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
import LeadsPage from './pages/crm/LeadsPage'
import ServiceLayout from './pages/crm/ServiceLayout'
import ServicePage from './pages/crm/ServicePage'
import MarketingPage from './pages/crm/MarketingPage'
import MessagingSessionsPage from './pages/crm/MessagingSessionsPage'
import ServiceAnalyticsPage from './pages/crm/ServiceAnalyticsPage'
import KnowledgePage from './pages/crm/KnowledgePage'
import ProductsPage from './pages/crm/ProductsPage'
import PriceBooksPage from './pages/crm/PriceBooksPage'
import CalendarPage from './pages/crm/CalendarPage'
import SalesAnalyticsPage from './pages/crm/SalesAnalyticsPage'
import TasksPage from './pages/crm/TasksPage'
import QuotePrintPage from './pages/crm/QuotePrintPage'
import SalesSettingsPage from './pages/crm/SalesSettingsPage'
import RecordDetailPage from './components/crm/RecordDetailPage'

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
        <Route path="contacts/:id" element={<RecordDetailPage objectType="contacts" />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="accounts/:id" element={<RecordDetailPage objectType="accounts" />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:id" element={<RecordDetailPage objectType="leads" />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="pipeline/:id/quote" element={<QuotePrintPage />} />
        <Route path="pipeline/:id" element={<RecordDetailPage objectType="opportunities" />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="price-books" element={<PriceBooksPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="analytics" element={<SalesAnalyticsPage />} />
        <Route path="service" element={<ServiceLayout />}>
          <Route index element={<Navigate to="cases" replace />} />
          <Route path="cases" element={<ServicePage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="messaging" element={<MessagingSessionsPage />} />
          <Route path="analytics" element={<ServiceAnalyticsPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
        </Route>
        <Route path="marketing" element={<MarketingPage />} />
        <Route path="settings" element={<SalesSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
