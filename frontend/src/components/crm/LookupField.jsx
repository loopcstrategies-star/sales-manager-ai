import React, { useEffect, useRef, useState } from 'react'

export default function LookupField({
  label,
  required,
  valueId,
  valueLabel,
  placeholder = 'Search...',
  onSearch,
  onSelect,
  onClear,
  error,
}) {
  const [q, setQ] = useState(valueLabel || '')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    setQ(valueLabel || '')
  }, [valueLabel, valueId])

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await onSearch?.(q)
        if (!cancelled) setOptions(Array.isArray(results) ? results : [])
      } catch {
        if (!cancelled) setOptions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, open, onSearch])

  return (
    <label className={`crm-field${error ? ' has-error' : ''}`} ref={wrapRef}>
      <span>{required ? '* ' : ''}{label}</span>
      <div className="crm-lookup">
        <input
          value={q}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            if (valueId) onClear?.()
          }}
        />
        <span className="crm-lookup-icon" aria-hidden="true">⌕</span>
        {open ? (
          <div className="crm-lookup-menu">
            {loading ? <div className="crm-lookup-empty">Searching…</div> : null}
            {!loading && options.length === 0 ? (
              <div className="crm-lookup-empty">No matches</div>
            ) : null}
            {!loading && options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="crm-lookup-option"
                onClick={() => {
                  onSelect?.(opt)
                  setQ(opt.label)
                  setOpen(false)
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {error ? <span className="crm-field-error">{error}</span> : null}
    </label>
  )
}
