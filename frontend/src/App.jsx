import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
import SettingsPage from './pages/SettingsPage'
import EmbedPage from './pages/EmbedPage'

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
      <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
      <Route path="/" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
