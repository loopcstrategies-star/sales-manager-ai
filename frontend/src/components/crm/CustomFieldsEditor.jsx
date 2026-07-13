import React from 'react'

export default function CustomFieldsEditor({ fields = [], onChange }) {
  const update = (index, key, value) => {
    const next = fields.map((f, i) => (i === index ? { ...f, [key]: value } : f))
    onChange?.(next)
  }

  const addField = () => {
    onChange?.([...fields, { label: '', value: '' }])
  }

  const removeField = (index) => {
    onChange?.(fields.filter((_, i) => i !== index))
  }

  return (
    <div className="crm-custom-fields">
      <div className="crm-section-bar">Custom Fields</div>
      {fields.map((field, index) => (
        <div className="crm-custom-field-row" key={`cf-${index}`}>
          <label className="crm-field">
            <span>Field Label</span>
            <input
              value={field.label}
              onChange={(e) => update(index, 'label', e.target.value)}
              placeholder="Label"
            />
          </label>
          <label className="crm-field">
            <span>Value</span>
            <input
              value={field.value}
              onChange={(e) => update(index, 'value', e.target.value)}
              placeholder="Value"
            />
          </label>
          <button
            type="button"
            className="crm-btn-ghost"
            onClick={() => removeField(index)}
            aria-label="Remove field"
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="crm-btn-link" onClick={addField}>
        + Add Field
      </button>
    </div>
  )
}
