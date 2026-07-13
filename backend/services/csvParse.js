/**
 * Minimal CSV parser (handles quoted fields and commas).
 * Returns { headers: string[], rows: Record<string,string>[] }
 */
function parseCsv(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '')
  const lines = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    const next = raw[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"'
        i += 1
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === '\n') {
      lines.push(current)
      current = ''
    } else if (ch === '\r') {
      // ignore
    } else {
      current += ch
    }
  }
  if (current.length) lines.push(current)

  const nonEmpty = lines.filter((l) => String(l).trim().length > 0)
  if (!nonEmpty.length) return { headers: [], rows: [] }

  const splitRow = (line) => {
    const cells = []
    let cell = ''
    let q = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      const next = line[i + 1]
      if (q) {
        if (ch === '"' && next === '"') {
          cell += '"'
          i += 1
        } else if (ch === '"') {
          q = false
        } else {
          cell += ch
        }
      } else if (ch === '"') {
        q = true
      } else if (ch === ',') {
        cells.push(cell.trim())
        cell = ''
      } else {
        cell += ch
      }
    }
    cells.push(cell.trim())
    return cells
  }

  const headers = splitRow(nonEmpty[0]).map((h) => h.trim())
  const rows = nonEmpty.slice(1).map((line) => {
    const cells = splitRow(line)
    const obj = {}
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] != null ? String(cells[idx]).trim() : ''
    })
    return obj
  })

  return { headers, rows }
}

function normalizeHeaderKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

module.exports = { parseCsv, normalizeHeaderKey }
