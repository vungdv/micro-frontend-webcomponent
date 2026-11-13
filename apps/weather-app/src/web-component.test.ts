import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAGS } from '@mf/contracts';
import manifest from '../custom-elements.json';
import pkg from '../package.json';
import styles from './styles.css?inline';
import { deferredFetch, immediateFetch, jsonResponse, type DeferredCall } from './test/fetch-fakes.ts';

/**
 * Lit's own markers on the global object, written by every bundled Lit copy (production build):
 * the version registries `litHtmlVersions`, `litElementVersions`, `reactiveElementVersions`, and
 * `litPropertyMetadata` (the WeakMap behind Lit's property metadata). They are framework internals,
 * not app state, and cannot be configured away, so WE-29 tolerates exactly these and nothing else.
 */
const LIT_RUNTIME_GLOBALS = new Set(['litHtmlVersions', 'litElementVersions', 'reactiveElementVersions', 'litPropertyMetadata']);

const FIFTEEN_MIN = 15 * 60 * 1000;
const TIMEOUT_MS = 10_000;

type WeatherEl = HTMLElement & { units: string; updateComplete: Promise<boolean> };

interface TestCity {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
}

const BERLIN: TestCity = { id: '2950159', name: 'Berlin', country: 'Germany', lat: 52.52437, lon: 13.41053 };
const PARIS: TestCity = { id: '2988507', name: 'Paris', country: 'France', lat: 48.85341, lon: 2.3488 };

const GEO_BERLIN = { id: 2950159, name: 'Berlin', latitude: 52.52437, longitude: 13.41053, country: 'Germany', admin1: 'Land Berlin' };
const GEO_PARIS = { id: 2988507, name: 'Paris', latitude: 48.85341, longitude: 2.3488, country: 'France', admin1: 'Île-de-France' };

let windowKeysBeforeImport: Set<string>;

const declaration = manifest.modules
  .flatMap((m) => m.declarations)
  .find((d) => 'tagName' in d && d.tagName === TAGS.weather) as
  | { attributes?: Array<{ name: string }>; cssProperties?: Array<{ name: string }> }
  | undefined;

function forecastPayload({ current = 21.4, min = 15, max = 25.2, precip = 40 as number | null, code = 2 } = {}) {
  return {
    current: { time: '2026-11-13T14:00', temperature_2m: current },
    daily: {
      time: ['2026-11-13'],
      weather_code: [code],
      temperature_2m_max: [max],
      temperature_2m_min: [min],
      precipitation_probability_max: [precip],
    },
  };
}

function isForecast(url: URL): boolean {
  return url.host === 'api.open-meteo.com';
}

function isGeocoding(url: URL): boolean {
  return url.host === 'geocoding-api.open-meteo.com';
}

/** Immediate fake: geocoding returns Berlin and Paris; forecasts come from `forecast(url)`. */
function okFetch(forecast: (url: URL) => Response | Error = () => jsonResponse(forecastPayload())) {
  return immediateFetch((url) => (isGeocoding(url) ? jsonResponse({ results: [GEO_BERLIN, GEO_PARIS] }) : forecast(url)));
}

/** The fake currently installed as `fetch`; `settle` awaits its settled requests. */
let activeFetch: { whenSettled?: () => Promise<void> } | undefined;

function stubFetch<T extends (...args: never[]) => unknown>(fetch: T): T {
  vi.stubGlobal('fetch', fetch);
  activeFetch = fetch as { whenSettled?: () => Promise<void> };
  return fetch;
}

function urls(fetch: { mock: { calls: Array<[string | URL | Request, ...unknown[]]> } }): URL[] {
  return fetch.mock.calls.map(([input]) => new URL(String(input)));
}

function forecastCount(fetch: Parameters<typeof urls>[0]): number {
  return urls(fetch).filter(isForecast).length;
}

function seedCities(...cities: TestCity[]): void {
  localStorage.setItem('weather:cities', JSON.stringify(cities));
}

function mount(attributes: Record<string, string> = {}): WeatherEl {
  const el = document.createElement(TAGS.weather) as WeatherEl;
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  document.body.append(el);
  return el;
}

/**
 * MICROTASK_BOUND: after a fake `fetch` promise settles, the app needs a fixed, small number of
 * microtask hops to reach state (getJson → json() → client → RequestTracker.run → controller →
 * requestUpdate, about 10). 50 leaves ample headroom while staying bounded, so a test can never hang.
 */
const MICROTASK_BOUND = 50;

/**
 * Waits until the installed fake's settled requests have run their callbacks, then lets their
 * results flow through the app (bounded microtask flush) and waits for Lit's render. Negative
 * assertions after `settle` therefore see every reaction to every answer the test released.
 */
async function settle(el: WeatherEl): Promise<void> {
  await activeFetch?.whenSettled?.();
  for (let i = 0; i < MICROTASK_BOUND; i += 1) await Promise.resolve();
  await el.updateComplete;
}

function $(el: HTMLElement, selector: string): HTMLElement | null {
  return el.shadowRoot?.querySelector<HTMLElement>(selector) ?? null;
}

function text(el: HTMLElement, selector: string): string {
  return $(el, selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function shownUnits(el: HTMLElement): string {
  return text(el, '[data-testid="units"]');
}

function cards(el: HTMLElement): HTMLElement[] {
  return [...(el.shadowRoot?.querySelectorAll<HTMLElement>('[data-testid="city-card"]') ?? [])];
}

function card(el: HTMLElement, city: TestCity): HTMLElement {
  const found = el.shadowRoot?.querySelector<HTMLElement>(`[data-testid="city-card"][data-city-id="${city.id}"]`);
  if (!found) throw new Error(`no card for ${city.name}`);
  return found;
}

function cardText(cardEl: HTMLElement, testid: string): string {
  return cardEl.querySelector(`[data-testid="${testid}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function button(root: ParentNode | null | undefined, selector: string): HTMLButtonElement {
  const found = root?.querySelector<HTMLButtonElement>(selector);
  if (!found) throw new Error(`no button ${selector}`);
  return found;
}

async function search(el: WeatherEl, query: string): Promise<void> {
  const form = $(el, 'form[data-testid="search"]') as HTMLFormElement;
  (form.querySelector('input[name="q"]') as HTMLInputElement).value = query;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await el.updateComplete;
}

function suggestions(el: HTMLElement): HTMLElement[] {
  return [...(el.shadowRoot?.querySelectorAll<HTMLElement>('[data-testid="suggestion"]') ?? [])];
}

async function addSuggestion(el: WeatherEl, index: number): Promise<void> {
  button(suggestions(el)[index], 'button').click();
  await el.updateComplete;
}

/** All CSS applied in the shadow root (constructed sheets or <style>), with whitespace and `;` removed. */
function shadowCss(el: HTMLElement): string {
  const root = el.shadowRoot!;
  const adopted = (root.adoptedStyleSheets ?? []).flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText));
  const inline = [...root.querySelectorAll('style')].map((style) => style.textContent ?? '');
  return [...adopted, ...inline].join('').replace(/[\s;]/g, '');
}

function forecastCallFor(calls: DeferredCall[], city: TestCity): DeferredCall {
  const call = calls.filter((c) => isForecast(c.url) && Number(c.url.searchParams.get('latitude')) === city.lat).at(-1);
  if (!call) throw new Error(`no forecast call for ${city.name}`);
  return call;
}

beforeAll(async () => {
  // Baseline before anything loads Lit, so WE-29 sees every global the remote adds.
  windowKeysBeforeImport = new Set(Object.getOwnPropertyNames(window));
  await import('./web-component.ts');
});

beforeEach(() => {
  localStorage.clear();
  // Safety net: any request a test did not fake fails loudly instead of reaching the real network.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('unexpected network request in test'))),
  );
});

afterEach(() => {
  activeFetch = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<weather-dashboard> contract', () => {
  it('given the module is imported twice, when it re-evaluates, then the guarded define does not throw and keeps the first class [WE-04]', async () => {
    const first = customElements.get(TAGS.weather);
    expect(first).toBeDefined();
    vi.resetModules();
    await expect(import('./web-component.ts')).resolves.toBeDefined();
    expect(customElements.get(TAGS.weather)).toBe(first);
  });

  it('given units="imperial", when the element is appended, then an open shadow root shows the Weather heading and imperial [WE-05]', async () => {
    const el = mount({ units: 'imperial' });
    await el.updateComplete;
    expect(text(el, 'h2')).toBe('Weather');
    expect(shownUnits(el)).toBe('imperial');
    expect(el.units).toBe('imperial');
  });

  it('given shadow styles, when rendered, then they start with :host display rules [WE-06]', async () => {
    const el = mount();
    await el.updateComplete;
    expect(styles.replace(/[\s;]/g, '').startsWith(':host{display:block}:host([hidden]){display:none}')).toBe(true);
    expect(shadowCss(el).startsWith(':host{display:block}:host([hidden]){display:none}')).toBe(true);
  });

  it('given no units attribute, when the element is appended, then it renders metric [WE-07]', async () => {
    const el = mount();
    await el.updateComplete;
    expect(shownUnits(el)).toBe('metric');
    expect(el.units).toBe('metric');
  });

  it('given a mounted element, when units changes to imperial, then it re-renders with imperial [WE-08]', async () => {
    const el = mount({ units: 'metric' });
    await el.updateComplete;
    el.setAttribute('units', 'imperial');
    await el.updateComplete;
    expect(shownUnits(el)).toBe('imperial');
  });

  it('given an unknown units value, when it is set, then it falls back to metric with a console.warn [WE-09]', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = mount({ units: 'kelvin' });
    await el.updateComplete;
    expect(shownUnits(el)).toBe('metric');
    expect(el.units).toBe('metric');
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('kelvin');
  });

  it('given units was set to "kelvin" through the property, when the host sets the attribute to "kelvin", then it warns again, once per attribute change [WE-09b]', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = mount();
    await el.updateComplete;
    el.units = 'kelvin';
    await el.updateComplete;
    expect(warn).toHaveBeenCalledTimes(1);
    el.setAttribute('units', 'kelvin');
    expect(warn).toHaveBeenCalledTimes(2);
    el.setAttribute('units', 'kelvin');
    expect(warn).toHaveBeenCalledTimes(2);
    el.setAttribute('units', 'imperial');
    el.setAttribute('units', 'kelvin');
    expect(warn).toHaveBeenCalledTimes(3);
    await el.updateComplete;
    expect(el.units).toBe('metric');
    expect(shownUnits(el)).toBe('metric');
    expect(warn.mock.calls.every(([message]) => String(message).includes('kelvin'))).toBe(true);
  });

  it('given the units property, when it is set, then it reflects to the units attribute and re-renders [WE-10]', async () => {
    const el = mount();
    await el.updateComplete;
    el.units = 'imperial';
    await el.updateComplete;
    expect(el.getAttribute('units')).toBe('imperial');
    expect(shownUnits(el)).toBe('imperial');
  });

  it('given a mounted element, when it is removed and re-appended, then it renders again without errors [WE-11]', async () => {
    const el = mount({ units: 'imperial' });
    await el.updateComplete;
    el.remove();
    document.body.append(el);
    await el.updateComplete;
    expect(shownUnits(el)).toBe('imperial');
  });

  it('given the contract tests, when custom-elements.json is read, then the tag and units attribute are documented [WE-12]', () => {
    expect(declaration).toBeDefined();
    expect(declaration?.attributes?.map((a) => a.name)).toContain('units');
  });
});

describe('<weather-dashboard> cards', () => {
  it('given no saved cities, when appended, then the empty state shows, Refresh is disabled and nothing is fetched [WE-13]', async () => {
    const fetch = stubFetch(okFetch());
    const el = mount();
    await settle(el);
    expect(text(el, '[data-testid="empty"]')).toBe('No saved cities yet. Search for a city to add it.');
    expect(button(el.shadowRoot, 'button[data-action="refresh"]').disabled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('given two saved cities, when appended, then two cards render in the loading state [WE-14a]', async () => {
    const { fetch } = deferredFetch();
    stubFetch(fetch);
    seedCities(BERLIN, PARIS);
    const el = mount();
    await el.updateComplete;
    expect(cards(el).map((c) => c.dataset.status)).toEqual(['loading', 'loading']);
    expect(cardText(card(el, BERLIN), 'card-status')).toBe('Loading…');
  });

  it('given two loading cards, when the forecasts arrive, then each card shows temp, min/max, precipitation and condition, with one request per city [WE-14b]', async () => {
    const { fetch, calls } = deferredFetch();
    stubFetch(fetch);
    seedCities(BERLIN, PARIS);
    const el = mount();
    await el.updateComplete;
    forecastCallFor(calls, BERLIN).resolve(jsonResponse(forecastPayload()));
    forecastCallFor(calls, PARIS).resolve(jsonResponse(forecastPayload({ current: 9, code: 61 })));
    await settle(el);
    const berlin = card(el, BERLIN);
    expect(berlin.dataset.status).toBe('ready');
    expect(cardText(berlin, 'name')).toBe('Berlin, Germany');
    expect(cardText(berlin, 'temp')).toBe('21 °C');
    expect(cardText(berlin, 'range')).toBe('Min 15 °C / Max 25 °C');
    expect(cardText(berlin, 'precip')).toBe('Precipitation 40%');
    expect(cardText(berlin, 'condition')).toBe('⛅ Partly cloudy');
    expect(cardText(card(el, PARIS), 'condition')).toBe('🌧️ Rain');
    expect(forecastCount(fetch)).toBe(2);
  });

  it('given a forecast without precipitation probability, when shown, then it reads "Precipitation –" [WE-14c]', async () => {
    stubFetch(okFetch(() => jsonResponse(forecastPayload({ precip: null }))));
    seedCities(BERLIN);
    const el = mount();
    await settle(el);
    expect(cardText(card(el, BERLIN), 'precip')).toBe('Precipitation –');
  });

  it('given a query, when the search form is submitted, then "Searching…" shows while the request is pending [WE-15a]', async () => {
    const { fetch, calls } = deferredFetch();
    stubFetch(fetch);
    const el = mount();
    await el.updateComplete;
    await search(el, 'Ber');
    expect(text(el, '[data-testid="search-status"]')).toBe('Searching…');
    expect(calls.filter((c) => isGeocoding(c.url))).toHaveLength(1);
    expect(calls[0]?.url.searchParams.get('name')).toBe('Ber');
  });

  it('given a pending search, when results arrive, then suggestions render as "Name, Region, Country" with Add buttons [WE-15b]', async () => {
    const { fetch, calls } = deferredFetch();
    stubFetch(fetch);
    const el = mount();
    await el.updateComplete;
    await search(el, 'Ber');
    calls[0]!.resolve(jsonResponse({ results: [GEO_BERLIN, GEO_PARIS] }));
    await settle(el);
    expect(suggestions(el).map((s) => s.querySelector('[data-testid="suggestion-label"]')?.textContent)).toEqual([
      'Berlin, Land Berlin, Germany',
      'Paris, Île-de-France, France',
    ]);
    expect(suggestions(el).map((s) => button(s, 'button').textContent?.trim())).toEqual(['Add', 'Add']);
    expect(text(el, '[data-testid="search-status"]')).toBe('');
  });

  it('given a suggestion without region and country, when rendered, then the empty parts are omitted [WE-15c]', async () => {
    stubFetch(immediateFetch(() => jsonResponse({ results: [{ id: 7, name: 'Atlantis', latitude: 1, longitude: 2 }] })));
    const el = mount();
    await el.updateComplete;
    await search(el, 'Atl');
    await settle(el);
    expect(suggestions(el)[0]?.querySelector('[data-testid="suggestion-label"]')?.textContent).toBe('Atlantis');
  });

  it('given a 1-character query, when submitted, then no request is made and a hint is shown [WE-16a]', async () => {
    const fetch = stubFetch(okFetch());
    const el = mount();
    await el.updateComplete;
    await search(el, ' B ');
    expect(fetch).not.toHaveBeenCalled();
    expect(text(el, '[data-testid="notice"]')).toBe('Type at least 2 characters');
  });

  it('given geocoding returns no results, when searched, then "No cities found" [WE-16b]', async () => {
    stubFetch(immediateFetch(() => jsonResponse({})));
    const el = mount();
    await el.updateComplete;
    await search(el, 'Zzzz');
    await settle(el);
    expect(text(el, '[data-testid="search-status"]')).toBe('No cities found');
  });

  it('given geocoding responds 500, when searched, then "Search failed. Try again." [WE-16c]', async () => {
    stubFetch(immediateFetch(() => jsonResponse({}, 500)));
    const el = mount();
    await el.updateComplete;
    await search(el, 'Berlin');
    await settle(el);
    expect(text(el, '[data-testid="search-status"]')).toBe('Search failed. Try again.');
  });

  it('given search results, when Add is clicked, then the card appears at once in the loading state before the forecast arrives [WE-17a]', async () => {
    const { fetch, calls } = deferredFetch();
    stubFetch(fetch);
    const el = mount();
    await el.updateComplete;
    await search(el, 'Ber');
    calls[0]!.resolve(jsonResponse({ results: [GEO_BERLIN] }));
    await settle(el);
    await addSuggestion(el, 0);
    expect(card(el, BERLIN).dataset.status).toBe('loading');
    expect(calls.filter((c) => isForecast(c.url))).toHaveLength(1);
    expect(suggestions(el)).toHaveLength(0);
    expect(($(el, 'input[name="q"]') as HTMLInputElement).value).toBe('');
  });

  it('given search results, when Add is clicked and the forecast answers, then the card is ready and weather:cities holds exactly the five fields [WE-17b]', async () => {
    const fetch = stubFetch(okFetch());
    const el = mount();
    await el.updateComplete;
    await search(el, 'Ber');
    await settle(el);
    await addSuggestion(el, 0);
    await settle(el);
    expect(card(el, BERLIN).dataset.status).toBe('ready');
    expect(cardText(card(el, BERLIN), 'temp')).toBe('21 °C');
    expect(forecastCount(fetch)).toBe(1);
    expect(JSON.parse(localStorage.getItem('weather:cities')!)).toEqual([BERLIN]);
  });

  it('given a saved city, when a suggestion with the same lat/lon is added, then no card or request is added and a notice shows [WE-18]', async () => {
    seedCities({ ...BERLIN, id: 'saved', name: 'Berlin Mitte' });
    const fetch = stubFetch(okFetch());
    const el = mount();
    await settle(el);
    await search(el, 'Ber');
    await settle(el);
    const before = forecastCount(fetch);
    await addSuggestion(el, 0);
    await settle(el);
    expect(cards(el)).toHaveLength(1);
    expect(forecastCount(fetch)).toBe(before);
    expect(text(el, '[data-testid="notice"]')).toBe('Berlin is already saved');
  });

  it('given 10 saved cities, when results show, then every Add is disabled, the limit notice shows and storage keeps 10 [WE-19]', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, country: 'X', lat: i, lon: i }));
    seedCities(...ten);
    stubFetch(okFetch());
    const el = mount();
    await settle(el);
    await search(el, 'Ber');
    await settle(el);
    expect(suggestions(el).map((s) => button(s, 'button').disabled)).toEqual([true, true]);
    expect(text(el, '[data-testid="notice"]')).toBe('You can save up to 10 cities');
    expect(JSON.parse(localStorage.getItem('weather:cities')!)).toHaveLength(10);
  });

  it('given two ready cards, when Remove is clicked on one, then its card, saved city and cached forecast are gone [WE-20]', async () => {
    seedCities(BERLIN, PARIS);
    stubFetch(okFetch());
    const el = mount();
    await settle(el);
    button(card(el, BERLIN), 'button[data-action="remove"]').click();
    await el.updateComplete;
    expect(cards(el).map((c) => c.dataset.cityId)).toEqual([PARIS.id]);
    expect(card(el, PARIS).dataset.status).toBe('ready');
    expect(JSON.parse(localStorage.getItem('weather:cities')!)).toEqual([PARIS]);
    expect(Object.keys(JSON.parse(localStorage.getItem('weather:forecasts')!))).toEqual([PARIS.id]);
  });

  it('given ready cards in metric, when units becomes imperial, then temperatures show in °F and nothing is refetched [WE-21]', async () => {
    seedCities(BERLIN);
    const fetch = stubFetch(okFetch());
    const el = mount();
    await settle(el);
    expect(cardText(card(el, BERLIN), 'temp')).toBe('21 °C');
    const calls = fetch.mock.calls.length;
    el.setAttribute('units', 'imperial');
    await settle(el);
    expect(cardText(card(el, BERLIN), 'temp')).toBe('71 °F');
    expect(cardText(card(el, BERLIN), 'range')).toBe('Min 59 °F / Max 77 °F');
    expect(shownUnits(el)).toBe('imperial');
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it('given ready cards, when time advances to 15 min, then exactly one new request per city is made at 15 min [WE-22]', async () => {
    vi.useFakeTimers();
    seedCities(BERLIN, PARIS);
    const fetch = stubFetch(okFetch());
    const el = mount();
    await settle(el);
    expect(forecastCount(fetch)).toBe(2);
    vi.advanceTimersByTime(FIFTEEN_MIN - 1);
    expect(forecastCount(fetch)).toBe(2);
    vi.advanceTimersByTime(1);
    expect(forecastCount(fetch)).toBe(4);
  });

  it('given ready cards, when Refresh is clicked, then one request per city is made and the cards show Updating… with the old values [WE-23a]', async () => {
    seedCities(BERLIN, PARIS);
    stubFetch(okFetch());
    const el = mount();
    await settle(el);
    const { fetch, calls } = deferredFetch();
    stubFetch(fetch);
    button(el.shadowRoot, 'button[data-action="refresh"]').click();
    await el.updateComplete;
    expect(calls.filter((c) => isForecast(c.url))).toHaveLength(2);
    const berlin = card(el, BERLIN);
    expect(berlin.dataset.status).toBe('loading');
    expect(cardText(berlin, 'card-status')).toBe('Updating…');
    expect(cardText(berlin, 'temp')).toBe('21 °C');
  });

  it('given cards updating after Refresh, when the new forecasts arrive, then they show the new data [WE-23b]', async () => {
    seedCities(BERLIN);
    stubFetch(okFetch());
    const el = mount();
    await settle(el);
    const { fetch, calls } = deferredFetch();
    stubFetch(fetch);
    button(el.shadowRoot, 'button[data-action="refresh"]').click();
    await el.updateComplete;
    forecastCallFor(calls, BERLIN).resolve(jsonResponse(forecastPayload({ current: 5 })));
    await settle(el);
    expect(card(el, BERLIN).dataset.status).toBe('ready');
    expect(cardText(card(el, BERLIN), 'temp')).toBe('5 °C');
    expect(cardText(card(el, BERLIN), 'card-status')).toBe('');
  });

  it('given one city whose forecast responds 500, when settled, then only that card shows an error with Retry [WE-24a]', async () => {
    seedCities(BERLIN, PARIS);
    stubFetch(okFetch((url) => (Number(url.searchParams.get('latitude')) === BERLIN.lat ? jsonResponse({}, 500) : jsonResponse(forecastPayload()))));
    const el = mount();
    await settle(el);
    expect(card(el, BERLIN).dataset.status).toBe('error');
    expect(cardText(card(el, BERLIN), 'card-status')).toBe("Couldn't load forecast");
    expect(button(card(el, BERLIN), 'button[data-action="retry"]')).toBeDefined();
    expect(card(el, PARIS).dataset.status).toBe('ready');
  });

  it('given a card in error, when Retry is clicked and the fetch succeeds, then it becomes ready [WE-24b]', async () => {
    seedCities(BERLIN);
    stubFetch(okFetch(() => jsonResponse({}, 500)));
    const el = mount();
    await settle(el);
    const fetch = stubFetch(okFetch());
    button(card(el, BERLIN), 'button[data-action="retry"]').click();
    await settle(el);
    expect(forecastCount(fetch)).toBe(1);
    expect(card(el, BERLIN).dataset.status).toBe('ready');
  });

  it('given a cached forecast and the network is down, when appended, then the card shows the cached values marked stale [WE-25a]', async () => {
    seedCities(BERLIN);
    const cached = { currentC: 3, minC: 1, maxC: 6, precipitationPct: 10, weatherCode: 3, fetchedAt: Date.UTC(2026, 10, 13, 9, 30) };
    localStorage.setItem('weather:forecasts', JSON.stringify({ [BERLIN.id]: cached }));
    stubFetch(okFetch(() => new TypeError('Failed to fetch')));
    const el = mount();
    await settle(el);
    const berlin = card(el, BERLIN);
    expect(berlin.dataset.status).toBe('stale');
    expect(cardText(berlin, 'temp')).toBe('3 °C');
    expect(cardText(berlin, 'card-status')).toMatch(/^Couldn't refresh · last updated \d{2}:\d{2}$/);
  });

  it('given no cached forecast and the network is down, when appended, then the card shows an error [WE-25b]', async () => {
    seedCities(BERLIN);
    stubFetch(okFetch(() => new TypeError('Failed to fetch')));
    const el = mount();
    await settle(el);
    expect(card(el, BERLIN).dataset.status).toBe('error');
  });

  it('given a mounted element with cities, when it is removed, then no timer remains and no later request is made [WE-26]', async () => {
    vi.useFakeTimers();
    seedCities(BERLIN);
    const fetch = stubFetch(okFetch());
    const el = mount();
    await settle(el);
    el.remove();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(FIFTEEN_MIN);
    expect(forecastCount(fetch)).toBe(1);
  });

  it('given a forecast and a search in flight, when the element is removed, then both are aborted, no timer (incl. 10 s timeouts) remains, and no error or "Search failed" shows [WE-27]', async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, 'error');
    const { fetch, calls } = deferredFetch();
    stubFetch(fetch);
    seedCities(BERLIN);
    const el = mount();
    await el.updateComplete;
    await search(el, 'Ber');
    expect(calls).toHaveLength(2);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    el.remove();
    expect(vi.getTimerCount()).toBe(0);
    await settle(el);
    expect(calls.map((c) => c.signal?.aborted)).toEqual([true, true]);
    expect(card(el, BERLIN).dataset.status).toBe('loading');
    expect(text(el, '[data-testid="search-status"]')).not.toContain('Search failed');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('given a mounted element, when it is removed and re-appended, then it refreshes once and keeps a single 15-min timer [WE-28]', async () => {
    vi.useFakeTimers();
    seedCities(BERLIN);
    const fetch = stubFetch(okFetch());
    const el = mount();
    await settle(el);
    el.remove();
    document.body.append(el);
    await settle(el);
    expect(forecastCount(fetch)).toBe(2);
    vi.advanceTimersByTime(FIFTEEN_MIN);
    expect(forecastCount(fetch)).toBe(3);
  });

  it('given rendering, searching and adding a city, then document.head, window and localStorage gain nothing outside the allow-lists [WE-29a]', async () => {
    const headBefore = document.head.children.length;
    stubFetch(okFetch());
    const el = mount();
    await el.updateComplete;
    await search(el, 'Ber');
    await settle(el);
    await addSuggestion(el, 0);
    await settle(el);
    expect(document.head.querySelectorAll('style, link')).toHaveLength(0);
    expect(document.head.children.length).toBe(headBefore);
    const added = Object.getOwnPropertyNames(window).filter(
      (name) => !windowKeysBeforeImport.has(name) && !LIT_RUNTIME_GLOBALS.has(name),
    );
    expect(added).toEqual([]);
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.startsWith('weather:'))).toBe(true);
  });

  it('given the test run, then Lit runs its production build (no dev-mode warning registry on window) [WE-29b]', () => {
    expect('litIssuedWarnings' in window).toBe(false);
  });

  it('given custom-elements.json, then it documents the tag, units, every --mf-* custom property in styles.css, and package.json points at it [WE-30]', async () => {
    expect(declaration).toBeDefined();
    expect(declaration?.attributes?.map((a) => a.name)).toContain('units');
    const used = new Set([...styles.matchAll(/var\((--mf-[a-z-]+)/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(0);
    const documented = new Set(declaration?.cssProperties?.map((p) => p.name));
    for (const prop of used) expect(documented).toContain(prop);
    expect(pkg.customElements).toBe('custom-elements.json');
  });

  it('given a ready card, when Refresh fails and later succeeds, then it goes stale with the previous values and then ready with new ones [WE-31]', async () => {
    seedCities(BERLIN);
    stubFetch(okFetch());
    const el = mount();
    await settle(el);
    stubFetch(okFetch(() => new TypeError('Failed to fetch')));
    button(el.shadowRoot, 'button[data-action="refresh"]').click();
    await settle(el);
    expect(card(el, BERLIN).dataset.status).toBe('stale');
    expect(cardText(card(el, BERLIN), 'temp')).toBe('21 °C');
    stubFetch(okFetch(() => jsonResponse(forecastPayload({ current: 12 }))));
    button(el.shadowRoot, 'button[data-action="refresh"]').click();
    await settle(el);
    expect(card(el, BERLIN).dataset.status).toBe('ready');
    expect(cardText(card(el, BERLIN), 'temp')).toBe('12 °C');
  });

  it('given a forecast request that hangs, when 10 s pass, then it is aborted and the card shows an error [WE-32a]', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = deferredFetch();
    stubFetch(fetch);
    seedCities(BERLIN);
    const el = mount();
    await el.updateComplete;
    vi.advanceTimersByTime(TIMEOUT_MS - 1);
    await settle(el);
    expect(card(el, BERLIN).dataset.status).toBe('loading');
    vi.advanceTimersByTime(1);
    await settle(el);
    expect(calls[0]?.signal?.aborted).toBe(true);
    expect(card(el, BERLIN).dataset.status).toBe('error');
  });

  it('given a search request that hangs, when 10 s pass, then "Search failed. Try again." shows [WE-32b]', async () => {
    vi.useFakeTimers();
    const { fetch } = deferredFetch();
    stubFetch(fetch);
    const el = mount();
    await el.updateComplete;
    await search(el, 'Ber');
    vi.advanceTimersByTime(TIMEOUT_MS);
    await settle(el);
    expect(text(el, '[data-testid="search-status"]')).toBe('Search failed. Try again.');
  });

  it('given a search in flight, when a newer search is submitted and the old answer arrives last, then the old one is dropped and the newer results win [WE-33a]', async () => {
    const { fetch, calls } = deferredFetch();
    stubFetch(fetch);
    const el = mount();
    await el.updateComplete;
    await search(el, 'Ber');
    await search(el, 'Par');
    await settle(el);
    expect(text(el, '[data-testid="search-status"]')).toBe('Searching…');
    const [older, newer] = calls;
    newer!.resolve(jsonResponse({ results: [GEO_PARIS] }));
    older!.resolve(jsonResponse({ results: [GEO_BERLIN] }));
    await settle(el);
    expect(older!.signal?.aborted).toBe(true);
    expect(suggestions(el).map((s) => s.querySelector('[data-testid="suggestion-label"]')?.textContent)).toEqual([
      'Paris, Île-de-France, France',
    ]);
  });

  it('given a forecast in flight, when Refresh is clicked and the old answer arrives last, then it is ignored and the card shows the newer result [WE-33b]', async () => {
    const { fetch, calls } = deferredFetch();
    stubFetch(fetch);
    seedCities(BERLIN);
    const el = mount();
    await el.updateComplete;
    const older = forecastCallFor(calls, BERLIN);
    button(el.shadowRoot, 'button[data-action="refresh"]').click();
    await el.updateComplete;
    const newer = forecastCallFor(calls, BERLIN);
    expect(newer).not.toBe(older);
    newer.resolve(jsonResponse(forecastPayload({ current: 5 })));
    older.resolve(jsonResponse(forecastPayload({ current: 30 })));
    await settle(el);
    expect(cardText(card(el, BERLIN), 'temp')).toBe('5 °C');
    expect(JSON.parse(localStorage.getItem('weather:forecasts')!)[BERLIN.id].currentC).toBe(5);
  });

  it('given a city whose forecast is in flight, when it is removed and the answer arrives later, then nothing is cached and no card renders [WE-33c]', async () => {
    const { fetch, calls } = deferredFetch();
    stubFetch(fetch);
    seedCities(BERLIN, PARIS);
    const el = mount();
    await el.updateComplete;
    button(card(el, BERLIN), 'button[data-action="remove"]').click();
    await el.updateComplete;
    forecastCallFor(calls, BERLIN).resolve(jsonResponse(forecastPayload()));
    await settle(el);
    expect(cards(el).map((c) => c.dataset.cityId)).toEqual([PARIS.id]);
    const cached = JSON.parse(localStorage.getItem('weather:forecasts') ?? '{}') as Record<string, unknown>;
    expect(Object.keys(cached)).not.toContain(BERLIN.id);
  });
});
