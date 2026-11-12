/** The only reads of ambient state (system time zone, clock, engine zone list). */
import { toZoned } from '../domain/convert.ts';
import { canonicalZone } from '../domain/zones.ts';

export interface Environment {
  /** The user's IANA zone, read fresh on every call and never stored. */
  homeZone(): string;
  /** Today's `YYYY-MM-DD` in `zone`. */
  today(zone: string): string;
  /** Accepted zone ids: `Intl.supportedValuesOf('timeZone')` ∪ `UTC`, sorted. */
  supportedZones(): readonly string[];
}

export function homeZone(): string {
  return canonicalZone(new Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function today(zone: string): string {
  return toZoned(Date.now(), zone).date;
}

let zones: readonly string[] | null = null;

export function supportedZones(): readonly string[] {
  zones ??= Object.freeze(
    [...new Set([...Intl.supportedValuesOf('timeZone').map(canonicalZone), 'UTC'])].sort(),
  );
  return zones;
}

export const environment: Environment = { homeZone, today, supportedZones };
