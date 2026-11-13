import { describe, expect, it } from 'vitest';
import { celsiusToFahrenheit, formatTemperature, normalizeUnits } from './units.ts';

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

describe('celsiusToFahrenheit', () => {
  it('given 0, 100 and -40 °C, when converted, then 32, 212 and -40 °F [WDM-01]', () => {
    expect([0, 100, -40].map(celsiusToFahrenheit)).toEqual([32, 212, -40]);
  });
});

describe('formatTemperature', () => {
  it('given 21.4 °C, when formatted metric, then "21 °C" [WDM-02a]', () => {
    expect(formatTemperature(21.4, 'metric')).toBe('21 °C');
  });

  it('given 21.4 °C, when formatted imperial, then "71 °F" [WDM-02b]', () => {
    expect(formatTemperature(21.4, 'imperial')).toBe('71 °F');
  });

  it('given -0.4 °C, when formatted metric, then "0 °C" without a minus sign [WDM-02c]', () => {
    expect(formatTemperature(-0.4, 'metric')).toBe('0 °C');
  });
});
