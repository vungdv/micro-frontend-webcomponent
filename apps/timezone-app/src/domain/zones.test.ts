import { describe, expect, it } from 'vitest';
import { canonicalZone, offsetLabel, validateZone, zoneLabel } from './zones.ts';

const supported = ['America/New_York', 'Asia/Kolkata', 'UTC'];

describe('validateZone', () => {
  it('given America/New_York, utc, asia/kolkata, then valid in canonical casing; given Mars/Olympus, then unknown-zone [TZD-02]', () => {
    expect(validateZone('America/New_York', supported)).toEqual({ ok: true, zone: 'America/New_York' });
    expect(validateZone('utc', supported)).toEqual({ ok: true, zone: 'UTC' });
    expect(validateZone('asia/kolkata', supported)).toEqual({ ok: true, zone: 'Asia/Kolkata' });
    expect(validateZone('Mars/Olympus', supported)).toEqual({ ok: false, reason: 'unknown-zone' });
  });

  it('given surrounding spaces or a legacy CLDR alias, when validated, then the current IANA id is returned', () => {
    expect(validateZone('  Asia/Kolkata ', supported)).toEqual({ ok: true, zone: 'Asia/Kolkata' });
    expect(validateZone('asia/calcutta', supported)).toEqual({ ok: true, zone: 'Asia/Kolkata' });
  });
});

describe('canonicalZone', () => {
  it('given a legacy CLDR id, then the current IANA id; given a current id, then it is unchanged', () => {
    expect(canonicalZone('Asia/Saigon')).toBe('Asia/Ho_Chi_Minh');
    expect(canonicalZone('Asia/Calcutta')).toBe('Asia/Kolkata');
    expect(canonicalZone('America/Buenos_Aires')).toBe('America/Argentina/Buenos_Aires');
    expect(canonicalZone('America/New_York')).toBe('America/New_York');
  });
});

describe('zoneLabel', () => {
  it('given America/Argentina/Buenos_Aires, then Buenos Aires; given UTC, then UTC [TZD-03]', () => {
    expect(zoneLabel('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(zoneLabel('UTC')).toBe('UTC');
  });
});

describe('offsetLabel', () => {
  it('given 2026-11-12, then Kolkata UTC+05:30, Kathmandu UTC+05:45, London UTC+00:00 [TZD-04]', () => {
    expect(offsetLabel('Asia/Kolkata', '2026-11-12')).toBe('UTC+05:30');
    expect(offsetLabel('Asia/Kathmandu', '2026-11-12')).toBe('UTC+05:45');
    expect(offsetLabel('Europe/London', '2026-11-12')).toBe('UTC+00:00');
  });

  it('given New York on 2026-11-12 and London in summer, then negative and DST offsets are shown', () => {
    expect(offsetLabel('America/New_York', '2026-11-12')).toBe('UTC-05:00');
    expect(offsetLabel('Europe/London', '2026-07-01')).toBe('UTC+01:00');
    expect(offsetLabel('UTC', '2026-11-12')).toBe('UTC+00:00');
  });
});
