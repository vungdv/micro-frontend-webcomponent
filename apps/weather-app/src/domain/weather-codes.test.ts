import { describe, expect, it } from 'vitest';
import { describeWeather } from './weather-codes.ts';

const TABLE: Array<[number[], string, string]> = [
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

describe('describeWeather', () => {
  it.each(TABLE.flatMap(([codes, label, icon]) => codes.map((code) => [code, label, icon] as const)))(
    'given WMO code %i, when described, then "%s" with its icon [WDM-09]',
    (code, label, icon) => {
      expect(describeWeather(code)).toEqual({ label, icon });
    },
  );

  it('given an unknown code (4), when described, then Unknown with ❔ [WDM-10a]', () => {
    expect(describeWeather(4)).toEqual({ label: 'Unknown', icon: '❔' });
  });

  it('given a null code, when described, then Unknown with ❔ [WDM-10b]', () => {
    expect(describeWeather(null)).toEqual({ label: 'Unknown', icon: '❔' });
  });
});
