/** Home dashboard layout and its immutable operations. No DOM, no storage, no manifest access. */

export const LAYOUT_VERSION = 1;

/** Inclusive bounds for `columns` and `rows`. */
export const LIMITS = Object.freeze({ min: 0, max: 10 } as const);

/** An app ID (a key of the manifest's `apps`) or `null` for an empty cell. */
export type Cell = string | null;

export interface Layout {
  readonly version: typeof LAYOUT_VERSION;
  readonly columns: number;
  readonly rows: number;
  /** Row-major: `rows` arrays, each holding `columns` entries. */
  readonly cells: readonly (readonly Cell[])[];
}

export type Reason = 'invalid-size' | 'out-of-bounds' | 'unknown-app';

/** User-facing messages; the other reasons are programming errors and are not shown. */
export const MESSAGES = Object.freeze({ 'invalid-size': `Enter a whole number from ${LIMITS.min} to ${LIMITS.max}` } as const);

export type LayoutResult = { ok: true; layout: Layout } | { ok: false; reason: Reason };

export type SizeResult = { ok: true; size: number } | { ok: false; reason: 'invalid-size' };

/** Why a stored value was replaced by the default layout. */
export type InvalidReason = 'invalid-shape' | 'unknown-version';

export interface ParsedLayout {
  readonly layout: Layout;
  /** Set when the stored value was rejected and `layout` is the default. */
  readonly invalid: InvalidReason | null;
  /** True when a stored size was outside `LIMITS` and was clamped. */
  readonly clamped: boolean;
  /** Unknown app IDs replaced by `null`, each once, in row-major order of first appearance. */
  readonly droppedAppIds: readonly string[];
}

/** Accepts only a number that is an integer within `LIMITS`; strings are not coerced. */
export function validateSize(value: unknown): SizeResult {
  if (typeof value === 'number' && Number.isInteger(value) && value >= LIMITS.min && value <= LIMITS.max) {
    return { ok: true, size: value };
  }
  return { ok: false, reason: 'invalid-size' };
}

/** 1×1 holding the first app, or `null` when there are no apps. */
export function defaultLayout(appIds: readonly string[]): Layout {
  return { version: LAYOUT_VERSION, columns: 1, rows: 1, cells: [[appIds[0] ?? null]] };
}

function reshape(cells: readonly (readonly Cell[])[], columns: number, rows: number): Cell[][] {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => cells[r]?.[c] ?? null));
}

/** Keeps entries that still fit, fills new positions with `null`, drops the rest. */
export function resize(layout: Layout, columns: number, rows: number): LayoutResult {
  if (!validateSize(columns).ok || !validateSize(rows).ok) return { ok: false, reason: 'invalid-size' };
  return { ok: true, layout: { version: LAYOUT_VERSION, columns, rows, cells: reshape(layout.cells, columns, rows) } };
}

function inRange(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

/** Sets one cell to an app ID from `appIds`, or `null`. The same app may be in several cells. */
export function assign(
  layout: Layout,
  row: number,
  column: number,
  appId: string | null,
  appIds: readonly string[],
): LayoutResult {
  if (!inRange(row, layout.rows) || !inRange(column, layout.columns)) return { ok: false, reason: 'out-of-bounds' };
  if (appId !== null && !appIds.includes(appId)) return { ok: false, reason: 'unknown-app' };
  const cells = layout.cells.map((cellRow, r) =>
    r === row ? cellRow.map((cell, c) => (c === column ? appId : cell)) : cellRow,
  );
  return { ok: true, layout: { ...layout, cells } };
}

function isCellRows(value: unknown): value is Cell[][] {
  return (
    Array.isArray(value) &&
    value.every((row) => Array.isArray(row) && row.every((cell) => cell === null || typeof cell === 'string'))
  );
}

function clamp(size: number): number {
  return Math.min(LIMITS.max, Math.max(LIMITS.min, size));
}

/**
 * Validates an untrusted stored value. A wrong shape or unknown version gives the default layout; a size
 * outside `LIMITS` is clamped and the cells reshaped; unknown app IDs become `null`. Never throws. The
 * caller logs from the returned diagnostics.
 */
export function parseLayout(value: unknown, appIds: readonly string[]): ParsedLayout {
  const rejected = (invalid: InvalidReason): ParsedLayout => ({
    layout: defaultLayout(appIds),
    invalid,
    clamped: false,
    droppedAppIds: [],
  });
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return rejected('invalid-shape');
  const doc = value as Record<string, unknown>;
  if (doc.version !== LAYOUT_VERSION) return rejected('unknown-version');
  const { columns, rows, cells } = doc;
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || !isCellRows(cells)) return rejected('invalid-shape');

  const clampedColumns = clamp(columns as number);
  const clampedRows = clamp(rows as number);
  const dropped = new Set<string>();
  const known = reshape(cells, clampedColumns, clampedRows).map((row) =>
    row.map((cell) => {
      if (cell === null || appIds.includes(cell)) return cell;
      dropped.add(cell);
      return null;
    }),
  );
  return {
    layout: { version: LAYOUT_VERSION, columns: clampedColumns, rows: clampedRows, cells: known },
    invalid: null,
    clamped: clampedColumns !== columns || clampedRows !== rows,
    droppedAppIds: [...dropped],
  };
}
