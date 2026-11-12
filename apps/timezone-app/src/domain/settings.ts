/** Persisted settings (added zones and home-zone ranges) and their immutable operations. */
import type { Reason } from './reasons.ts';
import { validateTime } from './wall-time.ts';
import { validateZone } from './zones.ts';

export { MESSAGES, type Reason } from './reasons.ts';

export const SETTINGS_VERSION = 1;
export const MAX_ZONES = 10;
export const MAX_RANGES = 10;

export interface TimeRange {
  readonly id: string;
  /** `HH:mm` in the home zone. */
  readonly start: string;
  /** `HH:mm` in the home zone; at or before `start` means the next day. */
  readonly end: string;
}

export interface Settings {
  readonly version: typeof SETTINGS_VERSION;
  readonly zones: readonly string[];
  readonly ranges: readonly TimeRange[];
}

export type SettingsResult = { ok: true; settings: Settings } | { ok: false; reason: Reason };

export const DEFAULT_SETTINGS: Settings = Object.freeze({ version: SETTINGS_VERSION, zones: [], ranges: [] });

/** Appends a zone matched against `supportedZones`; the home zone and added zones are duplicates. */
export function addZone(
  settings: Settings,
  input: string,
  homeZone: string | undefined,
  supportedZones: readonly string[],
): SettingsResult {
  const result = validateZone(input, supportedZones);
  if (!result.ok) return result;
  if (result.zone === homeZone || settings.zones.includes(result.zone)) return { ok: false, reason: 'duplicate-zone' };
  if (settings.zones.length >= MAX_ZONES) return { ok: false, reason: 'too-many-zones' };
  return { ok: true, settings: { ...settings, zones: [...settings.zones, result.zone] } };
}

export function removeZone(settings: Settings, zone: string): Settings {
  return { ...settings, zones: settings.zones.filter((z) => z !== zone) };
}

/** Appends a range; `range.id` is chosen by the caller. */
export function addRange(settings: Settings, range: TimeRange): SettingsResult {
  const { id, start, end } = range;
  if (!validateTime(start).ok || !validateTime(end).ok) return { ok: false, reason: 'invalid-time' };
  if (start === end) return { ok: false, reason: 'zero-length' };
  if (settings.ranges.some((r) => r.start === start && r.end === end)) return { ok: false, reason: 'duplicate-range' };
  if (settings.ranges.length >= MAX_RANGES) return { ok: false, reason: 'too-many-ranges' };
  return { ok: true, settings: { ...settings, ranges: [...settings.ranges, { id, start, end }] } };
}

export function removeRange(settings: Settings, id: string): Settings {
  return { ...settings, ranges: settings.ranges.filter((r) => r.id !== id) };
}

function isRangeShape(value: unknown): value is TimeRange {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && v.id !== '' && typeof v.start === 'string' && typeof v.end === 'string';
}

/**
 * Validates an untrusted stored document. A wrong shape or unknown version gives the defaults; invalid,
 * duplicate or over-limit entries are dropped one by one. Every problem is logged with `console.warn`.
 * A stored zone equal to the current home zone is kept (the user may have travelled into it); the page
 * hides it at render time.
 */
export function parseSettings(value: unknown, supportedZones: readonly string[]): Settings {
  const doc = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  if (doc.version !== SETTINGS_VERSION || !Array.isArray(doc.zones) || !Array.isArray(doc.ranges)) {
    console.warn('[timezone-app] stored settings have an unknown version or shape; using defaults');
    return DEFAULT_SETTINGS;
  }
  let settings: Settings = DEFAULT_SETTINGS;
  for (const zone of doc.zones) {
    const result = typeof zone === 'string' ? addZone(settings, zone, undefined, supportedZones) : null;
    if (result?.ok) settings = result.settings;
    else console.warn('[timezone-app] dropped stored zone', zone, result?.reason ?? 'not a string');
  }
  for (const range of doc.ranges) {
    const unique = isRangeShape(range) && !settings.ranges.some((r) => r.id === range.id);
    const result = unique ? addRange(settings, range) : null;
    if (result?.ok) settings = result.settings;
    else console.warn('[timezone-app] dropped stored range', range, result?.reason ?? 'malformed or repeated id');
  }
  return settings;
}
