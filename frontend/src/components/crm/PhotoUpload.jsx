import React, { useRef, useState } from 'react'
import { assetUrl, uploadsApi } from '../../api/client'

export default function PhotoUpload({ value, onChange }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const onPick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const res = await uploadsApi.upload(file)
      onChange?.(res.data.url)
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="crm-photo-upload">
      <div className="crm-photo-preview">
        {value ? (
          <img src={assetUrl(value)} alt="Contact" />
        ) : (
          <span className="crm-photo-placeholder">Photo</span>
        )}
      </div>
      <div className="crm-photo-actions">
        <button
          type="button"
          className="crm-btn-secondary"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : value ? 'Change Photo' : 'Upload Photo'}
        </button>
        {value ? (
          <button type="button" className="crm-btn-ghost" onClick={() => onChange?.('')}>
            Remove
          </button>
        ) : null}
        {error ? <p className="crm-field-error">{error}</p> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onPick}
      />
    </div>
  )
}
