/** Units accepted by `<weather-dashboard units="...">`. */
export type Units = 'metric' | 'imperial';

export const DEFAULT_UNITS: Units = 'metric';

export interface NormalizedUnits {
  units: Units;
  /** False when a non-empty value was given but is not a known unit system. */
  valid: boolean;
}

/** Maps a raw attribute value to a known unit system; absent or unknown values fall back to metric. */
export function normalizeUnits(value: string | null): NormalizedUnits {
  if (value === null) return { units: DEFAULT_UNITS, valid: true };
  if (value === 'metric' || value === 'imperial') return { units: value, valid: true };
  return { units: DEFAULT_UNITS, valid: false };
}

/** Converts degrees Celsius to degrees Fahrenheit. */
export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/** Formats a Celsius value for display in `units`, rounded to whole degrees: `"21 °C"`, `"71 °F"`. */
export function formatTemperature(celsius: number, units: Units): string {
  const value = units === 'imperial' ? celsiusToFahrenheit(celsius) : celsius;
  const rounded = Math.round(value) || 0; // `|| 0` turns -0 into 0
  return `${rounded} ${units === 'imperial' ? '°F' : '°C'}`;
}
