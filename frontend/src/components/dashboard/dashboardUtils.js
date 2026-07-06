export const FILTER_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'gold', label: 'Gold' },
  { id: 'uae', label: 'UAE' },
  { id: 'b2b', label: 'B2B' },
  { id: 'macro', label: 'Macro' },
]

export const DEFAULT_DASHBOARD_PREFS = {
  showPriceTiles: true,
  showTicker: true,
  showHeadlinesRow: true,
  showHero: true,
  showImages: true,
  compactCards: false,
  defaultRegion: '',
  sections: { metals: true, general: true },
  topicFilter: 'all',
  customTopics: [],
  sortOrder: 'headlines',
  pollMinutes: 5,
}

export function formatUpdated(value) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

export function relativeTime(value) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function isNew(refreshedAt) {
  if (!refreshedAt) return false
  return Date.now() - new Date(refreshedAt).getTime() < 60 * 60 * 1000
}

export function matchFilter(card, filter) {
  if (filter === 'all') return true
  const hay = `${card.title} ${card.summary} ${(card.tags || []).join(' ')}`.toLowerCase()
  if (filter === 'gold') return /gold|silver|jewelry|metal|lbma/i.test(hay)
  if (filter === 'uae') return /uae|dubai|gcc|gulf|middle east/i.test(hay)
  if (filter === 'b2b') return /b2b|wholesale|trade|distribution|sales/i.test(hay)
  if (filter === 'macro') return /economy|market|stock|inflation|fed|trade/i.test(hay)
  return true
}

export function matchCustomTopics(card, topics) {
  if (!topics?.length) return true
  const hay = `${card.title} ${card.summary} ${(card.tags || []).join(' ')}`.toLowerCase()
  return topics.some((t) => hay.includes(String(t).toLowerCase()))
}

export function sortCards(cards, sortOrder) {
  const list = [...cards]
  if (sortOrder === 'newest') {
    return list.sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
      return tb - ta
    })
  }
  return list.sort((a, b) => {
    if (a.type === 'headline' && b.type !== 'headline') return -1
    if (b.type === 'headline' && a.type !== 'headline') return 1
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
    return tb - ta
  })
}

export function applyDashboardFilter(cards, prefs) {
  const d = prefs?.dashboard || prefs || DEFAULT_DASHBOARD_PREFS
  let filtered = (cards || []).filter((c) => matchFilter(c, d.topicFilter || 'all'))
  filtered = filtered.filter((c) => matchCustomTopics(c, d.customTopics))
  if (!d.sections?.metals) filtered = filtered.filter((c) => c.category !== 'metals')
  if (!d.sections?.general) filtered = filtered.filter((c) => c.category !== 'general')
  return sortCards(filtered, d.sortOrder || 'headlines')
}
