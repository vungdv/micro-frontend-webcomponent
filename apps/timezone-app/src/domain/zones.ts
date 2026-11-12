/** IANA time zone validation and display labels. */
import { toInstant } from './convert.ts';

export type ZoneResult = { ok: true; zone: string } | { ok: false; reason: 'unknown-zone' };

/**
 * CLDR keeps some renamed zones under their old IANA ids, and V8/ICU returns those from
 * `Intl.supportedValuesOf` and `resolvedOptions()`. Maps them to the current IANA id (both are valid
 * `timeZone` options), so `Asia/Saigon` shows as `Asia/Ho_Chi_Minh`.
 */
const LEGACY_IDS: Readonly<Record<string, string>> = {
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Coral_Harbour': 'America/Atikokan',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
};
const LEGACY_BY_LOWER = new Map(Object.entries(LEGACY_IDS).map(([from, to]) => [from.toLowerCase(), to]));

/** Current IANA id for a legacy CLDR id; any other id is returned unchanged. */
export function canonicalZone(zone: string): string {
  return LEGACY_BY_LOWER.get(zone.toLowerCase()) ?? zone;
}

/** Matches `input` case-insensitively (legacy ids included) against `supportedZones`, returning its casing. */
export function validateZone(input: string, supportedZones: readonly string[]): ZoneResult {
  const wanted = canonicalZone(input.trim()).toLowerCase();
  const zone = supportedZones.find((z) => z.toLowerCase() === wanted);
  return zone ? { ok: true, zone } : { ok: false, reason: 'unknown-zone' };
}

/** Last id segment with `_` as spaces: `America/Argentina/Buenos_Aires` → `Buenos Aires`. */
export function zoneLabel(zone: string): string {
  return (zone.split('/').pop() ?? zone).replaceAll('_', ' ');
}

/** Offset of `zone` at noon of `date` there, as `UTC±hh:mm` (from `timeZoneName: 'longOffset'`). */
export function offsetLabel(zone: string, date: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(
    toInstant(date, '12:00', zone),
  );
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  return name === 'GMT' ? 'UTC+00:00' : name.replace('GMT', 'UTC');
}
