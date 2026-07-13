import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Opens create modal when ?new=1 and exposes current ?list= filter id.
 */
export function useServiceListQuery(openNew) {
  const [searchParams, setSearchParams] = useSearchParams()
  const list = searchParams.get('list') || ''

  useEffect(() => {
    if (searchParams.get('new') !== '1') return
    openNew()
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, openNew])

  return list
}

export function isOwnedBy(item, user) {
  if (!user) return false
  const uid = String(user._id || user.id || '')
  if (!uid) return false
  const oid = item.ownerId
  const owner = oid && typeof oid === 'object' ? oid._id || oid.id : oid
  return String(owner || '') === uid
}

export function isCreatedThisWeek(item) {
  if (!item?.createdAt) return false
  const created = new Date(item.createdAt).getTime()
  if (Number.isNaN(created)) return false
  return Date.now() - created <= 7 * 24 * 60 * 60 * 1000
}
