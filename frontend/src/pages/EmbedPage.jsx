import React, { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { setToken } from '../api/client'
import ChatPage from './ChatPage'

/**
 * Embed route for LoopC sidebar iframe / deep-link handoff.
 * Usage: /embed?token=<jwt>
 */
export default function EmbedPage() {
  const [params] = useSearchParams()

  useEffect(() => {
    const token = params.get('token')
    if (token) {
      setToken(token)
      window.history.replaceState({}, '', '/embed')
    }
  }, [params])

  return (
    <div className="embed-shell">
      <ChatPage />
    </div>
  )
}
