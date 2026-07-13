import React from 'react'

export default function CrmListView({
  title,
  icon,
  count = 0,
  sortLabel = '',
  search,
  onSearchChange,
  searchPlaceholder = 'Search this list...',
  actions,
  columns,
  rows,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  loading,
  onRowClick,
  selectedIds = [],
  onSelectionChange,
  bulkActions,
}) {
  const ids = rows.map((r) => r.id)
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id))
  const someSelected = selectedIds.length > 0

  const toggleAll = () => {
    if (!onSelectionChange) return
    onSelectionChange(allSelected ? [] : ids)
  }

  const toggleOne = (id) => {
    if (!onSelectionChange) return
    if (selectedIds.includes(id)) onSelectionChange(selectedIds.filter((x) => x !== id))
    else onSelectionChange([...selectedIds, id])
  }

  return (
    <div className="crm-list-view">
      <div className="crm-list-header">
        <div className="crm-list-title-wrap">
          {icon ? <span className="crm-list-title-icon">{icon}</span> : null}
          <h2 className="crm-list-title">{title}</h2>
        </div>
        <div className="crm-list-actions">{actions}</div>
      </div>

      <div className="crm-list-toolbar">
        <p className="crm-list-meta">
          {count} item{count === 1 ? '' : 's'}
          {sortLabel ? ` · Sorted by ${sortLabel}` : ''}
          {someSelected ? ` · ${selectedIds.length} selected` : ''}
        </p>
        <div className="crm-list-toolbar-end">
          {someSelected && bulkActions ? <div className="crm-bulk-actions">{bulkActions}</div> : null}
          <input
            className="crm-list-search"
            type="search"
            value={search}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder}
          />
        </div>
      </div>

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th className="crm-check-col">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  disabled={!onSelectionChange || ids.length === 0}
                  onChange={toggleAll}
                />
              </th>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} className="crm-table-empty-cell">Loading…</td>
              </tr>
            ) : rows.length === 0 ? null : rows.map((row) => (
              <tr
                key={row.id}
                className={onRowClick ? 'crm-row-clickable' : undefined}
                onClick={() => onRowClick?.(row)}
              >
                <td className="crm-check-col" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label="Select row"
                    checked={selectedIds.includes(row.id)}
                    disabled={!onSelectionChange}
                    onChange={() => toggleOne(row.id)}
                  />
                </td>
                {columns.map((col) => (
                  <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && rows.length === 0 ? (
        <div className="crm-empty">
          <div className="crm-empty-art" aria-hidden="true" />
          <p className="crm-empty-title">{emptyTitle}</p>
          <p className="crm-empty-desc">{emptyDescription}</p>
          {emptyActionLabel ? (
            <button type="button" className="crm-btn-primary" onClick={onEmptyAction}>
              {emptyActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
