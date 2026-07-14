import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { opportunitiesApi } from '../../api/client'

/**
 * Printable commercial quote for an Opportunity (browser Print → PDF).
 */
export default function QuotePrintPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await opportunitiesApi.get(id)
        if (!cancelled) {
          setData(res.data)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load opportunity')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  const lines = useMemo(() => {
    const products = data?.products || []
    if (products.length) {
      return products.map((p) => ({
        name: p.productName || 'Product',
        quantity: Number(p.quantity) || 0,
        unitPrice: Number(p.unitPrice) || 0,
        lineTotal: (Number(p.quantity) || 0) * (Number(p.unitPrice) || 0),
      }))
    }
    if (data?.amount) {
      return [{
        name: data.name || 'Opportunity',
        quantity: 1,
        unitPrice: Number(data.amount) || 0,
        lineTotal: Number(data.amount) || 0,
      }]
    }
    return []
  }, [data])

  const total = lines.reduce((s, l) => s + l.lineTotal, 0)
  const today = new Date().toISOString().slice(0, 10)

  if (loading) return <p className="crm-muted" style={{ padding: '2rem' }}>Loading quote…</p>
  if (error) return <p className="crm-banner-error" style={{ padding: '2rem' }}>{error}</p>
  if (!data) return null

  return (
    <div className="crm-quote-print">
      <div className="crm-quote-toolbar no-print">
        <Link className="crm-btn-secondary" to={`/sales/pipeline/${id}`}>Back to Opportunity</Link>
        <button type="button" className="crm-btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <article className="crm-quote-sheet">
        <header className="crm-quote-header">
          <div>
            <p className="crm-quote-brand">Sales Manager AI</p>
            <h1>Quote</h1>
          </div>
          <div className="crm-quote-meta">
            <div><span>Date</span><strong>{today}</strong></div>
            <div><span>Opportunity</span><strong>{data.name}</strong></div>
            <div><span>Stage</span><strong>{data.stage}</strong></div>
            {data.closeDate ? (
              <div><span>Valid / close</span><strong>{String(data.closeDate).slice(0, 10)}</strong></div>
            ) : null}
          </div>
        </header>

        <section className="crm-quote-parties">
          <div>
            <h2>Account</h2>
            <p>{data.accountName || '—'}</p>
          </div>
          <div>
            <h2>Contact</h2>
            <p>{data.contactName || '—'}</p>
          </div>
        </section>

        <table className="crm-quote-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Line</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={4}>No product lines — add products on the Opportunity, or set Amount.</td>
              </tr>
            ) : lines.map((l, i) => (
              <tr key={i}>
                <td>{l.name}</td>
                <td>{l.quantity}</td>
                <td>${l.unitPrice.toLocaleString()}</td>
                <td>${l.lineTotal.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total</td>
              <td>${total.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>

        {data.description ? (
          <section className="crm-quote-notes">
            <h2>Notes</h2>
            <p>{data.description}</p>
          </section>
        ) : null}

        <footer className="crm-quote-footer">
          <p>This quote is for discussion only. Prices and availability subject to confirmation.</p>
        </footer>
      </article>
    </div>
  )
}
