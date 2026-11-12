import { describe, expect, it } from 'vitest';
import { normalizeUnits } from './units.ts';

describe('normalizeUnits', () => {
  it('given no value, when normalized, then it is metric and valid [WE-01]', () => {
    expect(normalizeUnits(null)).toEqual({ units: 'metric', valid: true });
  });

  it('given "imperial", when normalized, then it is imperial and valid [WE-02]', () => {
    expect(normalizeUnits('imperial')).toEqual({ units: 'imperial', valid: true });
  });

  it('given an unknown value, when normalized, then it falls back to metric and is invalid [WE-03]', () => {
    expect(normalizeUnits('kelvin')).toEqual({ units: 'metric', valid: false });
  });
});
