/** Display formatting (spec §3.4): `en-US` 12-hour times, day markers and durations. */
import type { ZonedTime } from './convert.ts';
import { parseTime } from './wall-time.ts';

/** `HH:mm` → `h:mm AM/PM`. */
export function formatTime(time: string): string {
  const { hour, minute } = parseTime(time);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** `h:mm AM/PM`, plus ` (+1d)` / ` (-1d)` when the day offset is not 0. */
export function formatZonedTime({ time, dayOffset }: ZonedTime): string {
  if (dayOffset === 0) return formatTime(time);
  return `${formatTime(time)} (${dayOffset > 0 ? '+' : ''}${dayOffset}d)`;
}

/** Elapsed minutes → `18h`, `3h 30m` or `30m`. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
