const mongoose = require('mongoose')

const CACHE_MS = Math.max(15, Number(process.env.METALS_PRICE_CACHE_MIN || 30)) * 60 * 1000

let memoryCache = { data: null, at: 0 }

function getGoldApiKey() {
  return String(process.env.GOLDAPI_KEY || process.env.GOLD_API_KEY || '').trim()
}

async function fetchGoldApiPrice(metalCode) {
  const apiKey = getGoldApiKey()
  if (!apiKey) return null

  const res = await fetch(`https://www.goldapi.io/api/${metalCode}/USD`, {
    headers: { 'x-access-token': apiKey },
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data?.price) return null

  return {
    metal: metalCode === 'XAU' ? 'Gold' : 'Silver',
    symbol: metalCode,
    price: Number(data.price),
    changePct: data.ch != null ? Number(data.ch) : null,
    currency: 'USD',
    unit: 'oz',
  }
}

async function getMetalsPrices() {
  if (!getGoldApiKey()) return []

  const now = Date.now()
  if (memoryCache.data && now - memoryCache.at < CACHE_MS) {
    return memoryCache.data
  }

  if (mongoose.connection.readyState === 1) {
    try {
      const DashboardSnapshot = require('../models/DashboardSnapshot')
      const snap = await DashboardSnapshot.findOne({ scope: 'global' }).lean()
      if (snap?.priceTiles?.length && snap.refreshedAt) {
        const age = now - new Date(snap.refreshedAt).getTime()
        if (age < CACHE_MS) {
          memoryCache = { data: snap.priceTiles, at: now }
          return snap.priceTiles
        }
      }
    } catch {
      // ignore
    }
  }

  const tiles = []
  for (const code of ['XAU', 'XAG']) {
    try {
      const tile = await fetchGoldApiPrice(code)
      if (tile) tiles.push(tile)
    } catch {
      // skip
    }
  }

  memoryCache = { data: tiles, at: now }
  return tiles
}

module.exports = { getMetalsPrices, getGoldApiKey }
