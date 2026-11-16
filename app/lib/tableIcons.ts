import { createLucideIcon, type LucideIconNode } from '@lucide/vue'

// Icons for the table buttons in the editor toolbar.
// Lucide has no icons for "add a row above" and the like, so these six are drawn here in
// Lucide's own style (24 x 24 grid, round lines) and made with Lucide's helper, so they
// work like the other icons (size, stroke-width, class).
// A bar with 3 cells = a row (or a column); + = add one; x = delete it.

const rowTop: LucideIconNode[] = [
  ['rect', { x: '3', y: '4', width: '18', height: '7', rx: '1' }],
  ['path', { d: 'M9 4v7' }],
  ['path', { d: 'M15 4v7' }],
]
const rowBottom: LucideIconNode[] = [
  ['rect', { x: '3', y: '13', width: '18', height: '7', rx: '1' }],
  ['path', { d: 'M9 13v7' }],
  ['path', { d: 'M15 13v7' }],
]
const columnLeft: LucideIconNode[] = [
  ['rect', { x: '4', y: '3', width: '7', height: '18', rx: '1' }],
  ['path', { d: 'M4 9h7' }],
  ['path', { d: 'M4 15h7' }],
]
const columnRight: LucideIconNode[] = [
  ['rect', { x: '13', y: '3', width: '7', height: '18', rx: '1' }],
  ['path', { d: 'M13 9h7' }],
  ['path', { d: 'M13 15h7' }],
]

/** Add a row above: + over a row. */
export const TableRowAboveIcon = createLucideIcon({
  name: 'table-row-above',
  node: [['path', { d: 'M12 3v6' }], ['path', { d: 'M9 6h6' }], ...rowBottom],
})

/** Add a row below: a row over a +. */
export const TableRowBelowIcon = createLucideIcon({
  name: 'table-row-below',
  node: [...rowTop, ['path', { d: 'M12 15v6' }], ['path', { d: 'M9 18h6' }]],
})

/** Add a column on the left: + next to a column. */
export const TableColumnLeftIcon = createLucideIcon({
  name: 'table-column-left',
  node: [['path', { d: 'M3 12h6' }], ['path', { d: 'M6 9v6' }], ...columnRight],
})

/** Add a column on the right: a column next to a +. */
export const TableColumnRightIcon = createLucideIcon({
  name: 'table-column-right',
  node: [...columnLeft, ['path', { d: 'M15 12h6' }], ['path', { d: 'M18 9v6' }]],
})

/** Delete the row: a row over an x. */
export const TableRowDeleteIcon = createLucideIcon({
  name: 'table-row-delete',
  node: [...rowTop, ['path', { d: 'm9.5 15.5 5 5' }], ['path', { d: 'm14.5 15.5-5 5' }]],
})

/** Delete the column: a column next to an x. */
export const TableColumnDeleteIcon = createLucideIcon({
  name: 'table-column-delete',
  node: [...columnLeft, ['path', { d: 'm15.5 9.5 5 5' }], ['path', { d: 'm20.5 9.5-5 5' }]],
})
