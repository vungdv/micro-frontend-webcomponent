import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { MAX_CITIES, addCity, removeCity, type City } from '../domain/cities.ts';
import { failed, forecastOf, loading, succeeded, type CardState } from '../domain/card-state.ts';
import type { SearchState } from '../components/search-form.ts';
import { fetchForecast } from '../services/forecast-client.ts';
import { searchCities, type CitySuggestion } from '../services/geocoding-client.ts';
import type { Fetch } from '../services/http.ts';
import { RequestTracker } from '../services/request-tracker.ts';
import { loadCities, loadForecasts, removeForecast, saveCities, saveForecast } from '../services/weather-storage.ts';

export const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
export const MIN_QUERY_LENGTH = 2;
export const LIMIT_NOTICE = `You can save up to ${MAX_CITIES} cities`;

/** Edges the controller talks to. Each default is read at call time, so tests can stub the globals. */
export interface DashboardDeps {
  fetch?: Fetch;
  storage?: Storage;
  now?: () => number;
}

const IDLE_SEARCH: SearchState = { query: '', status: 'idle', results: [] };

/**
 * Dashboard state and orchestration (Lit ReactiveController): saved cities, one card state per city,
 * the search, the 15-min refresh timer, and every in-flight request (one per city plus one search,
 * each with a 10 s timeout). Connect loads and refreshes; disconnect clears the timer and aborts all.
 */
export class DashboardController implements ReactiveController {
  cities: City[] = [];
  readonly cards = new Map<string, CardState>();
  search: SearchState = IDLE_SEARCH;

  readonly #host: ReactiveControllerHost;
  readonly #deps: DashboardDeps;
  readonly #requests = new RequestTracker();
  #notice: string | null = null;
  #interval: ReturnType<typeof setInterval> | undefined;

  constructor(host: ReactiveControllerHost, deps: DashboardDeps = {}) {
    this.#host = host;
    this.#deps = deps;
    host.addController(this);
  }

  get canAdd(): boolean {
    return this.cities.length < MAX_CITIES;
  }

  /** Message for the last search/add action; the limit message also shows whenever results are listed at the limit. */
  get notice(): string | null {
    return this.#notice ?? (this.search.status === 'results' && !this.canAdd ? LIMIT_NOTICE : null);
  }

  hostConnected(): void {
    this.#stopTimer();
    const storage = this.#storage();
    const cache = loadForecasts(storage);
    this.cities = loadCities(storage);
    this.cards.clear();
    // Cards are seeded from the cache; from here on `#load` uses the in-memory forecast.
    for (const city of this.cities) this.cards.set(city.id, loading(cache[city.id]));
    this.search = IDLE_SEARCH;
    this.#notice = null;
    this.refreshAll();
    this.#interval = setInterval(() => this.refreshAll(), REFRESH_INTERVAL_MS);
  }

  hostDisconnected(): void {
    this.#stopTimer();
    this.#requests.abortAll();
  }

  refreshAll(): void {
    for (const city of this.cities) void this.#load(city);
  }

  retry(id: string): void {
    const city = this.cities.find((c) => c.id === id);
    if (city) void this.#load(city);
  }

  /** Keeps the typed text so re-renders do not reset the input. */
  setQuery(query: string): void {
    this.search = { ...this.search, query };
  }

  async runSearch(query: string): Promise<void> {
    const trimmed = query.trim();
    this.#notice = null;
    if (trimmed.length < MIN_QUERY_LENGTH) {
      this.#requests.abort('search');
      this.search = { query, status: 'idle', results: [] };
      this.#notice = `Type at least ${MIN_QUERY_LENGTH} characters`;
      this.#host.requestUpdate();
      return;
    }
    this.search = { query, status: 'searching', results: [] };
    this.#host.requestUpdate();
    const outcome = await this.#requests.run('search', (signal) => searchCities(trimmed, { fetch: this.#deps.fetch, signal }));
    if (outcome.status === 'ignored') return; // superseded or disconnected: keep no stale results, show no error
    if (outcome.status === 'ok') {
      this.search = { query, status: outcome.value.length > 0 ? 'results' : 'empty', results: outcome.value };
    } else {
      this.search = { query, status: 'error', results: [] };
    }
    this.#host.requestUpdate();
  }

  add(suggestion: CitySuggestion): void {
    const city: City = { id: suggestion.id, name: suggestion.name, country: suggestion.country, lat: suggestion.lat, lon: suggestion.lon };
    const result = addCity(this.cities, city);
    if (!result.ok) {
      this.#notice = result.reason === 'duplicate' ? `${city.name} is already saved` : LIMIT_NOTICE;
      this.#host.requestUpdate();
      return;
    }
    this.cities = result.cities;
    saveCities(this.cities, this.#storage());
    this.search = IDLE_SEARCH;
    this.#notice = null;
    void this.#load(city);
  }

  remove(id: string): void {
    this.#requests.abort(forecastKey(id));
    this.cities = removeCity(this.cities, id);
    this.cards.delete(id);
    const storage = this.#storage();
    saveCities(this.cities, storage);
    removeForecast(id, storage);
    this.#host.requestUpdate();
  }

  async #load(city: City): Promise<void> {
    this.cards.set(city.id, loading(forecastOf(this.cards.get(city.id))));
    this.#host.requestUpdate();
    const outcome = await this.#requests.run(forecastKey(city.id), (signal) =>
      fetchForecast(city, { fetch: this.#deps.fetch, signal, now: this.#deps.now }),
    );
    // Superseded, removed (remove() aborts first) or disconnected: discard the answer.
    if (outcome.status === 'ignored') return;
    if (outcome.status === 'ok') {
      this.cards.set(city.id, succeeded(outcome.value));
      saveForecast(city.id, outcome.value, this.#storage());
    } else {
      this.cards.set(city.id, failed(forecastOf(this.cards.get(city.id))));
    }
    this.#host.requestUpdate();
  }

  #storage(): Storage {
    return this.#deps.storage ?? localStorage;
  }

  #stopTimer(): void {
    if (this.#interval !== undefined) clearInterval(this.#interval);
    this.#interval = undefined;
  }
}

function forecastKey(id: string): string {
  return `forecast:${id}`;
}
