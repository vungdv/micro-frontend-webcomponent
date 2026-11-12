/**
 * Wall time <-> instant conversion with ECMA-402 `Intl.DateTimeFormat` (no date library).
 * Instants are epoch milliseconds. Ambiguous wall times follow Temporal's `compatible` rule.
 */
import { addDays, dateToUtcMs, daysBetween, parseTime, utcMsToDate } from './wall-time.ts';

export type Instant = number;
export interface LocalDateTime {
  date: string;
  time: string;
}
export interface ZonedTime extends LocalDateTime {
  /** Calendar days between `date` and the reference date. */
  dayOffset: number;
}
export interface ConvertedRange {
  start: ZonedTime;
  end: ZonedTime;
  durationMinutes: number;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** The zone's wall clock at `instant`, expressed as epoch ms "as if UTC". */
function wallClockMs(instant: Instant, zone: string): number {
  const parts: Record<string, number> = {};
  for (const { type, value } of formatter(zone).formatToParts(instant)) parts[type] = Number(value);
  const { year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = parts;
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/** UTC offset of `zone` at `instant`, in milliseconds. */
function offsetMs(instant: Instant, zone: string): number {
  const whole = Math.floor(instant / 1000) * 1000;
  return wallClockMs(whole, zone) - whole;
}

/** Wall date and time (`HH:mm`) in `zone` at `instant`. */
export function toZoned(instant: Instant, zone: string): LocalDateTime {
  const wall = wallClockMs(instant, zone);
  return { date: utcMsToDate(wall), time: new Date(wall).toISOString().slice(11, 16) };
}

/**
 * Instant of `time` on `date` in `zone`. Takes the offset at a UTC guess and corrects it once; if the
 * corrected candidate does not round-trip (DST gap) or another candidate also does (DST overlap), the
 * `compatible` rule applies: a gap moves forward by its length, an overlap takes the earlier instant.
 */
export function toInstant(date: string, time: string, zone: string): Instant {
  const { hour, minute } = parseTime(time);
  const local = dateToUtcMs(date) + (hour * 60 + minute) * MINUTE_MS;
  const fits = (offset: number): boolean => offsetMs(local - offset, zone) === offset;

  const guess = local - offsetMs(local, zone);
  const corrected = offsetMs(guess, zone);
  const before = offsetMs(local - DAY_MS, zone);
  const after = offsetMs(local + DAY_MS, zone);
  const candidates = [corrected, before, after].filter(fits).map((offset) => local - offset);
  // No candidate fits: a gap. The offset in force before the transition pushes the time forward.
  return candidates.length > 0 ? Math.min(...candidates) : local - before;
}

function zonedAt(instant: Instant, zone: string, referenceDate: string): ZonedTime {
  const local = toZoned(instant, zone);
  return { ...local, dayOffset: daysBetween(referenceDate, local.date) };
}

/**
 * Places a home-zone range on `referenceDate` (the end rolls to the next day when `end <= start`) and
 * shows it in `targetZone`. `durationMinutes` is elapsed time, so it reflects DST changes.
 */
export function convertRange(
  range: { start: string; end: string },
  referenceDate: string,
  homeZone: string,
  targetZone: string,
): ConvertedRange {
  const endDate = range.end > range.start ? referenceDate : addDays(referenceDate, 1);
  const start = toInstant(referenceDate, range.start, homeZone);
  const end = toInstant(endDate, range.end, homeZone);
  return {
    start: zonedAt(start, targetZone, referenceDate),
    end: zonedAt(end, targetZone, referenceDate),
    durationMinutes: Math.round((end - start) / MINUTE_MS),
  };
}
