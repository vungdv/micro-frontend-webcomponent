export interface WeatherDescription {
  label: string;
  icon: string;
}

const ENTRIES: Array<[number[], string, string]> = [
  [[0], 'Clear sky', '☀️'],
  [[1], 'Mainly clear', '🌤️'],
  [[2], 'Partly cloudy', '⛅'],
  [[3], 'Overcast', '☁️'],
  [[45, 48], 'Fog', '🌫️'],
  [[51, 53, 55], 'Drizzle', '🌦️'],
  [[56, 57], 'Freezing drizzle', '🌧️'],
  [[61, 63, 65], 'Rain', '🌧️'],
  [[66, 67], 'Freezing rain', '🌧️'],
  [[71, 73, 75], 'Snow', '🌨️'],
  [[77], 'Snow grains', '🌨️'],
  [[80, 81, 82], 'Rain showers', '🌦️'],
  [[85, 86], 'Snow showers', '🌨️'],
  [[95], 'Thunderstorm', '⛈️'],
  [[96, 99], 'Thunderstorm with hail', '⛈️'],
];

/** WMO weather interpretation codes (as used by Open-Meteo) → label and icon. */
const TABLE = new Map<number, WeatherDescription>(
  ENTRIES.flatMap(([codes, label, icon]) => codes.map((code) => [code, { label, icon }] as const)),
);

const UNKNOWN: WeatherDescription = { label: 'Unknown', icon: '❔' };

export function describeWeather(code: number | null): WeatherDescription {
  return (code === null ? undefined : TABLE.get(code)) ?? UNKNOWN;
}
