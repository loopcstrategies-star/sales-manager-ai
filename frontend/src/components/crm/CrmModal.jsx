import React, { useEffect } from 'react'

export default function CrmModal({
  title,
  open,
  onClose,
  children,
  footer,
  requiredLegend = true,
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="crm-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="crm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="crm-modal-header">
          <h2>{title}</h2>
          {requiredLegend ? (
            <p className="crm-modal-legend">* = Required Information</p>
          ) : null}
          <button type="button" className="crm-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="crm-modal-body">{children}</div>
        {footer ? <footer className="crm-modal-footer">{footer}</footer> : null}
      </div>
    </div>
  )
}
