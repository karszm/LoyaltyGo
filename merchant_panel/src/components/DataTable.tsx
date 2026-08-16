// DataTable.tsx — task-16-design.md §13.1: the React port of PanelTable.astro
// (landing_page/src/components/PanelTable.astro:73-160), the panel's own primitive per
// panel-shell.md §5.5. Container/row rhythm, 13px/19.5px/-0.13px cells, 12px header in --text-3
// (not the landing's --text-4 -- panel-shell.md §5.5's AA rule on --bg-raised), numerals
// right-aligned, no row hover anywhere (no row in this panel is clickable).
//
// Columns own their own grid track width (a literal CSS track, e.g. '84px' or
// 'minmax(150px, 1.4fr)') so the same component serves both the 5-column /klienci table and the
// 7-column /transakcje one without a second table implementation. Roles are plain divs/spans
// (role="table"/"row"/"columnheader"/"cell") per task-16-brief.md -- a real <table> loses this
// grid layout's semantics in parts of the AT landscape.
//
// Loading/error/empty states live OUTSIDE this component, in the screen's own `.region` wrapper
// (panel-shell.md §6): the same wrapper element persists across all four states so the region
// never resizes or remounts, only its children swap. This file supplies exactly two of those
// children -- the loaded table and its skeleton twin -- both rendering the identical
// table-scroll/data-table/head shape so the loaded table lands exactly where the skeleton was.
import type { ReactNode } from 'react'

export interface DataTableColumn<T> {
  key: string
  header: string
  /** A literal CSS grid track for this column, shared by the header row and every data row. */
  minWidth: string
  /** Right-aligns the column (header and cells). Content/colour/`.mono` stay the render fn's job. */
  numeric?: boolean
  render: (row: T) => ReactNode
}

interface SharedProps<T> {
  columns: DataTableColumn<T>[]
  /** aria-label for the horizontal-scroll container (panel-shell.md §5.5: "Lista klientów" / "Historia transakcji"). */
  scrollLabel: string
  /** 6+ columns get `gap: var(--space-5)` instead of `--space-6` (task-16-design.md §4.2). */
  wide?: boolean
}

function trackTemplate<T>(columns: DataTableColumn<T>[]): string {
  return columns.map((c) => c.minWidth).join(' ')
}

function cellClassName(numeric: boolean | undefined): string | undefined {
  return numeric ? 'data-table__cell--num' : undefined
}

interface DataTableProps<T> extends SharedProps<T> {
  rows: T[]
  rowKey: (row: T) => string
}

export function DataTable<T>({ columns, rows, rowKey, scrollLabel, wide }: DataTableProps<T>) {
  const template = trackTemplate(columns)
  return (
    <div className="table-scroll" role="region" aria-label={scrollLabel} tabIndex={0}>
      {/* aria-labelledby, not a second aria-label: the table and the scroll region around it are
         the same object under two different accessible-name needs (panel-shell.md §11). */}
      <div className={wide ? 'data-table data-table--wide' : 'data-table'} role="table" aria-labelledby="screen-title">
        <div className="data-table__head" role="row" style={{ gridTemplateColumns: template }}>
          {columns.map((c) => (
            <span key={c.key} role="columnheader" className={cellClassName(c.numeric)}>
              {c.header}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={rowKey(row)} className="data-table__row" role="row" style={{ gridTemplateColumns: template }}>
            {columns.map((c) => (
              <span key={c.key} role="cell" className={cellClassName(c.numeric)}>
                {c.render(row)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// 60/40/80/50% cycling across columns, numeric columns' bars pushed to the right edge
// (panel-shell.md §6.2). Five rows at the table's real 44px row height.
const SKELETON_WIDTHS = ['60%', '40%', '80%', '50%']
const SKELETON_ROW_COUNT = 5

export function SkeletonRows<T>({ columns, scrollLabel, wide }: SharedProps<T>) {
  const template = trackTemplate(columns)
  return (
    <div className="table-scroll" role="region" aria-label={scrollLabel} tabIndex={0}>
      <div className={wide ? 'data-table data-table--wide' : 'data-table'} role="table" aria-hidden="true">
        <div className="data-table__head" role="row" style={{ gridTemplateColumns: template }}>
          {columns.map((c) => (
            <span key={c.key} role="columnheader" className={cellClassName(c.numeric)}>
              {c.header}
            </span>
          ))}
        </div>
        {Array.from({ length: SKELETON_ROW_COUNT }).map((_, rowIndex) => (
          <div key={rowIndex} className="data-table__row" role="row" style={{ gridTemplateColumns: template }}>
            {columns.map((c, colIndex) => (
              <span key={c.key} role="cell" className={cellClassName(c.numeric)}>
                <span
                  className="skeleton"
                  style={{
                    display: 'inline-block',
                    inlineSize: SKELETON_WIDTHS[colIndex % SKELETON_WIDTHS.length],
                    marginInlineStart: c.numeric ? 'auto' : undefined,
                  }}
                />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
