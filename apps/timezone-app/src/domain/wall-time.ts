/** ISO 8601 local wall time and calendar date helpers. Pure string arithmetic, no time zone. */

/** `HH:mm`, `00:00`–`23:59`. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export type TimeResult = { ok: true; time: string } | { ok: false; reason: 'invalid-time' };

export function validateTime(time: string): TimeResult {
  return TIME_PATTERN.test(time) ? { ok: true, time } : { ok: false, reason: 'invalid-time' };
}

/** Parses `HH:mm` into hour and minute. Assumes a valid time. */
export function parseTime(time: string): { hour: number; minute: number } {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return { hour, minute };
}

/** Milliseconds since the epoch of `date` at 00:00 UTC, or NaN when it is not a real `YYYY-MM-DD` date. */
export function dateToUtcMs(date: string): number {
  const match = DATE_PATTERN.exec(date);
  if (!match) return Number.NaN;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const ms = Date.UTC(y, m - 1, d);
  return utcMsToDate(ms) === date ? ms : Number.NaN;
}

/** `YYYY-MM-DD` of a UTC epoch millisecond value. */
export function utcMsToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isValidDate(date: string): boolean {
  return !Number.isNaN(dateToUtcMs(date));
}

export function addDays(date: string, days: number): string {
  return utcMsToDate(dateToUtcMs(date) + days * DAY_MS);
}

/** Signed number of calendar days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateToUtcMs(to) - dateToUtcMs(from)) / DAY_MS);
}
