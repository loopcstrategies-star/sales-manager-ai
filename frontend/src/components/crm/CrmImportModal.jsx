import React, { useMemo, useState } from 'react'
import { crmApi } from '../../api/client'
import CrmModal from './CrmModal'

const OBJECT_FIELDS = {
  leads: [
    { key: 'lastName', label: 'Last Name *' },
    { key: 'firstName', label: 'First Name' },
    { key: 'company', label: 'Company *' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'title', label: 'Title' },
    { key: 'website', label: 'Website' },
    { key: 'status', label: 'Status' },
    { key: 'industry', label: 'Industry' },
    { key: 'leadSource', label: 'Lead Source' },
    { key: 'description', label: 'Description' },
  ],
  contacts: [
    { key: 'lastName', label: 'Last Name *' },
    { key: 'firstName', label: 'First Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'title', label: 'Title' },
    { key: 'accountName', label: 'Account Name' },
    { key: 'description', label: 'Description' },
  ],
  accounts: [
    { key: 'name', label: 'Account Name *' },
    { key: 'website', label: 'Website' },
    { key: 'phone', label: 'Phone' },
    { key: 'type', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'billingCity', label: 'Billing City' },
    { key: 'billingState', label: 'Billing State' },
    { key: 'billingCountry', label: 'Billing Country' },
  ],
}

const TITLES = {
  leads: 'Import Leads',
  contacts: 'Import Contacts',
  accounts: 'Import Accounts',
}

export default function CrmImportModal({ objectType, open, onClose, onImported }) {
  const fields = OBJECT_FIELDS[objectType] || []
  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [preview, setPreview] = useState([])
  const [rowCount, setRowCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  const reset = () => {
    setStep(1)
    setFile(null)
    setHeaders([])
    setMapping({})
    setPreview([])
    setRowCount(0)
    setBusy(false)
    setError('')
    setSummary(null)
  }

  const handleClose = () => {
    reset()
    onClose?.()
  }

  const headerOptions = useMemo(
    () => [{ value: '', label: '— Skip —' }, ...headers.map((h) => ({ value: h, label: h }))],
    [headers],
  )

  const downloadTemplate = async () => {
    try {
      await crmApi.downloadImportTemplate(objectType)
    } catch (err) {
      setError(err.message || 'Could not download template.')
    }
  }

  const runPreview = async (selectedFile) => {
    setBusy(true)
    setError('')
    try {
      const res = await crmApi.importCsv(objectType, selectedFile, { preview: true })
      setHeaders(res.data.headers || [])
      setMapping(res.data.mapping || {})
      setPreview(res.data.preview || [])
      setRowCount(res.data.rowCount || 0)
      setStep(2)
    } catch (err) {
      setError(err.message || 'Preview failed.')
    } finally {
      setBusy(false)
    }
  }

  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setSummary(null)
    runPreview(f)
  }

  const setMapField = (field, col) => {
    setMapping((prev) => ({ ...prev, [field]: col }))
  }

  const runImport = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const res = await crmApi.importCsv(objectType, file, { mapping, preview: false })
      setSummary(res.data)
      setStep(3)
      onImported?.(res.data)
    } catch (err) {
      setError(err.message || 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CrmModal
      title={TITLES[objectType] || 'Import'}
      open={open}
      onClose={handleClose}
      requiredLegend={false}
      footer={(
        <>
          <button type="button" className="crm-btn-secondary" onClick={handleClose}>
            {step === 3 ? 'Close' : 'Cancel'}
          </button>
          {step === 2 ? (
            <button type="button" className="crm-btn-primary" disabled={busy || !file} onClick={runImport}>
              {busy ? 'Importing…' : `Import ${rowCount} rows`}
            </button>
          ) : null}
        </>
      )}
    >
      {error ? <p className="crm-banner-error">{error}</p> : null}

      {step === 1 ? (
        <div className="crm-import-step">
          <p className="crm-muted">Upload a CSV (max 5MB / 2000 rows). Download a template to see the expected columns.</p>
          <div className="crm-import-actions">
            <button type="button" className="crm-btn-secondary" onClick={downloadTemplate}>
              Download template
            </button>
            <label className="crm-btn-primary crm-file-label">
              {busy ? 'Reading…' : 'Choose CSV'}
              <input type="file" accept=".csv,text/csv" hidden onChange={onFileChange} disabled={busy} />
            </label>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="crm-import-step">
          <p className="crm-muted">{file?.name} · {rowCount} rows · map columns below</p>
          <div className="crm-import-map">
            {fields.map((f) => (
              <label key={f.key} className="crm-field">
                <span>{f.label}</span>
                <select
                  value={mapping[f.key] || ''}
                  onChange={(e) => setMapField(f.key, e.target.value)}
                >
                  {headerOptions.map((o) => (
                    <option key={`${f.key}-${o.value}`} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {preview.length ? (
            <div className="crm-import-preview">
              <h4>Preview</h4>
              <div className="crm-import-table-wrap">
                <table className="crm-import-table">
                  <thead>
                    <tr>
                      {headers.map((h) => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {headers.map((h) => <td key={h}>{row[h] || ''}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 3 && summary ? (
        <div className="crm-import-step">
          <p>Import complete.</p>
          <ul className="crm-import-summary">
            <li>Created: {summary.created}</li>
            <li>Updated: {summary.updated}</li>
            <li>Skipped: {summary.skipped}</li>
          </ul>
          {(summary.errors || []).length ? (
            <div className="crm-import-errors">
              <h4>Errors</h4>
              <ul>
                {summary.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </CrmModal>
  )
}
