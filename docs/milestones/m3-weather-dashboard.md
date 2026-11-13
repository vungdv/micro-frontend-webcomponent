# M3: Weather dashboard (Lit)

Parent spec: [01.init-spec.md](../specs/01.init-spec.md#weather-dashboard-weather-dashboard-lit). Milestone index: [README.md](README.md). Testing rules: [02.testing.md](../specs/02.testing.md).

## 1. Goal

Replace the M1 vanilla placeholder in `apps/weather-app` with the real weather dashboard, built with Lit, behind the **same** public contract (`<weather-dashboard>`, `units` attribute). Together with M2 this answers exploration question 2 (framework independence): the host does not change at all.

At the end of M3:

1. Users can search cities through Open-Meteo Geocoding, save up to 10 of them, and remove them. Saved cities persist in `localStorage` under `weather:cities` as `{ id, name, country, lat, lon }`. A city with the same lat/lon as a saved one is rejected.
2. Each saved city has one card from Open-Meteo Forecast: current temperature, min/max, precipitation chance, and a WMO weather label and icon. Each card has its own loading and error state.
3. Forecasts refresh on load, every 15 minutes while mounted, and when the user clicks "Refresh". Every request has a 10 s timeout. The timer is cleared and in-flight requests are aborted on disconnect.
4. When a fetch fails and the card holds an earlier forecast for that city, the card shows that forecast marked stale. Without one, it shows an error.
5. `units="metric|imperial"` (default `metric`, unknown values fall back to `metric` with a `console.warn`) switches the displayed units without refetching.
6. The remote builds into one self-contained ES module (`weather-app.js`) with Lit bundled in, and it still runs standalone through `index.html`.

Out of scope: syncing across tabs (`storage` event), reordering cities, search-as-you-type (search runs on submit), geolocation, theming beyond the `--mf-*` fallbacks (M5).

**No changes outside `apps/weather-app`**, except the milestone index status and `pnpm-lock.yaml` (the new `lit` dependency). The shell, `@mf/contracts` and `host.config.json` stay as they are.

## 2. Design

### 2.1 Layers (dependencies point inward)

```
src/
  web-component.ts            WeatherDashboardElement (LitElement): units property/attribute, styles,
                              owns one DashboardController, render() → renderDashboardPage(...)
  pages/
    dashboard-controller.ts   DashboardController (Lit ReactiveController): state, fetch orchestration,
                              15-min timer; hostConnected / hostDisconnected
    dashboard-page.ts         renderDashboardPage(controller, units): TemplateResult (composes components)
  components/                 plain functions returning TemplateResult (NOT custom elements):
    search-form.ts            SearchState/SearchStatus types; renderSearchForm(search, notice, handlers)
    search-results.ts         renderSearchResults(suggestions, canAdd, onAdd), suggestionLabel
    city-card.ts              renderCityCard(city, card, units, handlers)
  services/
    http.ts                   getJson(url, { fetch, signal }, onStatus): the one fetch call site
    geocoding-client.ts       searchCities(query, { fetch, signal }) → CitySuggestion[]
    forecast-client.ts        fetchForecast(city, { fetch, signal, now }) → Forecast
    request-tracker.ts        RequestTracker: one in-flight request per key, AbortController + 10 s timeout
    weather-storage.ts        weather:cities and weather:forecasts (Storage injected)
  domain/                     pure: no Lit, no DOM, no I/O
    units.ts                  normalizeUnits (existing), celsiusToFahrenheit, formatTemperature
    time.ts                   formatTime(epochMs, timeZone?) → "HH:MM"
    cities.ts                 City, MAX_CITIES, sameLocation, addCity, removeCity, sanitizeCities
    weather-codes.ts          WMO code → { label, icon } table
    card-state.ts             Forecast, CardState, transitions (loading/succeeded/failed), isForecast
  styles.css                  all shadow styles; imported with ?inline, applied via static styles
  test/fetch-fakes.ts         test-only network fakes: jsonResponse, deferredFetch, immediateFetch
```

**Only the root element is registered.** Following the namespacing rule, `components/` contains no `LitElement` subclasses and no `customElements.define` calls. Components are plain functions that return Lit `TemplateResult`s and receive data and callbacks as arguments. `web-component.ts` stays the module's only side effect (the guarded define).

- **`domain/units.ts`** keeps `Units`, `DEFAULT_UNITS` and `normalizeUnits` unchanged. It adds:
  - `celsiusToFahrenheit(c) = c * 9 / 5 + 32`.
  - `formatTemperature(celsius, units)` converts when `imperial`, rounds with `Math.round`, normalizes `-0` to `0`, and appends the unit: `"21 °C"`, `"71 °F"`.
  - **Units decision:** forecasts are always fetched and cached in °C (the API default, no `temperature_unit` param). Imperial is a pure display conversion, so changing `units` never refetches and the cache is unit-independent. Precipitation probability is a percentage and is unaffected by units.
- **`domain/time.ts`**: `formatTime(epochMs, timeZone?)` returns 24-hour `HH:MM` from `Intl.DateTimeFormat`. The page passes no zone, so it uses the viewer's local time. Tests pass `'UTC'`.
- **`domain/cities.ts`**:
  - `type City = { id: string; name: string; country: string; lat: number; lon: number }`. `id` is the geocoding result `id` as a string.
  - `MAX_CITIES = 10`.
  - `sameLocation(a, b)`: true when `Math.round(lat * 1e4)` and `Math.round(lon * 1e4)` are both equal (4 decimals, about 11 m). This targets the exact coordinates Open-Meteo returns for a place: the same place always comes back with the same values, and the rounding only absorbs float noise. Name and id are ignored: lat/lon alone decides duplicates, as the spec says.
  - `addCity(list, city)` returns `{ ok: true, cities }` (a new array ending with the city), or `{ ok: false, reason: 'duplicate' | 'limit' }` with the list untouched. The duplicate check runs first.
  - `removeCity(list, id)` returns a new array.
  - `sanitizeCities(unknown)` keeps only valid items (non-empty `id` and `name`, string `country`, finite `lat` in [-90, 90] and `lon` in [-180, 180]), drops later items with an id already kept or a location already kept (`sameLocation`), truncates to `MAX_CITIES`, and strips extra fields. A non-array gives `[]`.
- **`domain/weather-codes.ts`** exports `describeWeather(code: number | null): { label: string; icon: string }`. Icons are emoji, rendered with `aria-hidden="true"` next to the text label. Unknown or `null` codes give `{ label: 'Unknown', icon: '❔' }`.

  | WMO codes | Label | Icon |
  |---|---|---|
  | 0 | Clear sky | ☀️ |
  | 1 | Mainly clear | 🌤️ |
  | 2 | Partly cloudy | ⛅ |
  | 3 | Overcast | ☁️ |
  | 45, 48 | Fog | 🌫️ |
  | 51, 53, 55 | Drizzle | 🌦️ |
  | 56, 57 | Freezing drizzle | 🌧️ |
  | 61, 63, 65 | Rain | 🌧️ |
  | 66, 67 | Freezing rain | 🌧️ |
  | 71, 73, 75 | Snow | 🌨️ |
  | 77 | Snow grains | 🌨️ |
  | 80, 81, 82 | Rain showers | 🌦️ |
  | 85, 86 | Snow showers | 🌨️ |
  | 95 | Thunderstorm | ⛈️ |
  | 96, 99 | Thunderstorm with hail | ⛈️ |

- **`domain/card-state.ts`**:
  - `type Forecast = { currentC: number; minC: number; maxC: number; precipitationPct: number | null; weatherCode: number | null; fetchedAt: number }`, where `fetchedAt` is epoch ms.
  - `type CardState`: `loading` (with an optional forecast), `ready` (with a forecast), `stale` (with a forecast), or `error`.
  - `loading(cached?)` → `{ status: 'loading', forecast: cached }`. A forecast the card already holds stays visible while it refreshes.
  - `succeeded(forecast)` → `{ status: 'ready', forecast }`.
  - `failed(cached?)` → `{ status: 'stale', forecast: cached }` when there is one, otherwise `{ status: 'error' }`.
  - `forecastOf(card)` returns the forecast a card holds. `isForecast(value)` is the shape check for untrusted cache data.
  - **Staleness rule:** a card is stale exactly when its latest fetch failed and it is showing an earlier forecast. Every failure counts: a network error (offline), a non-2xx response, an invalid payload, or a timeout. A caller abort is not a failure. Aborts happen when the request is superseded, the city is removed, or the element disconnects, and an aborted result is discarded with no state change.
- **`services/http.ts`**: `getJson(url, { fetch?, signal? }, onStatus)` makes a GET, reads `globalThis.fetch` at call time when no `fetch` is injected, throws `onStatus(status)` for a non-2xx response, and returns `response.json()`. Network errors and `AbortError` propagate.
- **`services/geocoding-client.ts`**:
  - `GET https://geocoding-api.open-meteo.com/v1/search?name=<query>&count=5&language=en&format=json`, with `signal`.
  - It maps `results[]` to `CitySuggestion = City & { region?: string }` (`region` is `admin1`, for display only and never stored). A missing `results` gives `[]`. Items without a finite `latitude`/`longitude`, an `id` or a `name` are dropped, and a missing `country` becomes `''`.
  - A non-2xx response throws `GeocodingError(status)`.
- **`services/forecast-client.ts`**:
  - `GET https://api.open-meteo.com/v1/forecast` with exactly these params: `latitude`, `longitude`, `current=temperature_2m`, `daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`, `timezone=auto`, `forecast_days=1`. No unit param.
  - It maps `current.temperature_2m` and `daily.*[0]` to `Forecast`, with `fetchedAt = now()` (default `Date.now`). `precipitation_probability_max[0]` and `weather_code[0]` may be `null`.
  - Missing or non-numeric temperatures throw `ForecastError('invalid-payload')`. A non-2xx response throws `ForecastError(status)`.
  - The base URLs are module constants (public, keyless endpoints, so there are no secrets to source from the environment). Tests assert them through the injected `fetch`.
- **`services/request-tracker.ts`**: `RequestTracker.run(key, request)` resolves to `{ status: 'ok', value }`, `{ status: 'failed', error }` or `{ status: 'ignored' }`. It never rejects.
  - A new `run` for the same key aborts the previous request, whose outcome is `ignored`.
  - Each request gets an `AbortController` and a `setTimeout` of `REQUEST_TIMEOUT_MS = 10_000`. The tracker uses `setTimeout`, not `AbortSignal.timeout`, so fake timers control it. On timeout the tracker aborts with a private reason, and the outcome is `failed`: a timeout is a failure, not a silent abort.
  - `abort(key)` and `abortAll()` cancel requests (outcome `ignored`) and clear their timeouts.
  - A late answer that arrives after an abort is discarded like the abort itself.
- **`services/weather-storage.ts`**: `Storage` is injected and defaults to `localStorage`. It exports `CITIES_KEY = 'weather:cities'`, `FORECASTS_KEY = 'weather:forecasts'`, `loadCities`, `saveCities`, `loadForecasts`, `saveForecast(id, forecast)` and `removeForecast(id)`.
  - `weather:cities` holds a JSON array of `City`. `loadCities` passes it through `sanitizeCities`.
  - `weather:forecasts` holds a JSON object `{ [cityId]: Forecast }`. Entries that fail `isForecast` are dropped on load.
  - Corrupt JSON gives `[]` / `{}` and a `console.warn`. A `setItem` error (quota, private mode) is caught and logged with `console.warn`. These functions never throw.
- **`pages/dashboard-controller.ts`**: `DashboardController implements ReactiveController`. It is created by the root with `new DashboardController(host, deps?)`, where `deps = { fetch?, storage?, now? }`. The defaults read `globalThis.fetch`, `localStorage` and `Date.now` **at call time**, so contract tests can stub the globals. It owns `cities`, `cards: Map<id, CardState>`, `search: SearchState` (`{ query, status: 'idle' | 'searching' | 'results' | 'empty' | 'error', results }`), a `notice`, and one `RequestTracker`. It calls `host.requestUpdate()` after every change.
  - `hostConnected()`: clears any existing interval (so it is idempotent), loads cities, and **seeds each card's in-memory forecast from `weather:forecasts`** (`loading(cache[id])`). It then resets the search, calls `refreshAll()`, and starts `setInterval(refreshAll, 15 * 60 * 1000)`.
  - `hostDisconnected()`: `clearInterval`, then `abortAll()`. After this no timer (interval or timeout), fetch or listener is left.
  - `#load(city)`: sets the card to `loading(<card's in-memory forecast>)` and runs `fetchForecast` under the key `forecast:<id>`. `ok` → `succeeded` + `saveForecast`. `failed` → `failed(<card's in-memory forecast>)`. `ignored` → no change. That covers a superseded request, a removed city (`remove` aborts first) and a disconnect. **`load` always uses the card's in-memory forecast**, seeded from `weather:forecasts` on connect and replaced on every success, so a refresh that fails after a success shows the latest good values as stale (WE-31). `refreshAll()` calls `#load` for every city in parallel, and a refresh supersedes a hung request.
  - `runSearch(query)`: trims the query. Fewer than 2 characters sets the notice "Type at least 2 characters" and makes no request. Otherwise it sets `searching` and runs `searchCities` under the key `search`. An `ignored` (superseded or disconnected) search changes nothing: no error state, no stale results. `failed`, including a timeout, → `error`.
  - `add(suggestion)`: strips `region` and calls `addCity`. On `ok` it saves the cities, clears the search and notice, and calls `#load(city)`, which renders the card at once in `loading`. That is exactly one forecast request, with no debounce and no timer in the path. On `duplicate` the notice is "`<name>` is already saved". On `limit` it is "You can save up to 10 cities".
  - `notice` is the last action's message. When results are listed with 10 cities saved, it is "You can save up to 10 cities".
  - `remove(id)`: aborts the city's request, then calls `removeCity`, `saveCities` and `removeForecast`.
  - `retry(id)`: calls `#load` for that city.
  - `setQuery(text)`: records the typed text, so re-renders (bound with `live`) do not reset the input.
- **`web-component.ts`**:
  - `class WeatherDashboardElement extends LitElement`, with no decorators. Styles are `static styles = unsafeCSS(styles)`, where `styles` comes from `./styles.css?inline`. Lit applies them through `adoptedStyleSheets`, or a `<style>` inside the shadow root where those are unsupported. Nothing goes into `document.head`.
  - **`units`** is declared in `static properties` as `{ reflect: true, noAccessor: true }`, with a hand-written accessor.
    - The element stores only the **normalized** value (`#units`), so there is no separate raw value to drift.
    - The setter captures `old = this.#units` before normalizing. On an invalid value it calls `console.warn` naming it, so every invalid **property assignment** warns. It then stores the normalized value and calls `requestUpdate('units', old)`.
    - `attributeChangedCallback` returns early when the attribute is re-set to the value it already has. Every other attribute write goes through Lit to the setter, so every invalid **attribute value set by the host warns once per change**. That holds even after an earlier invalid property set (WE-09b).
    - Lit does not reflect a change that came from the attribute, so a host-set `units="kelvin"` stays as written.
    - Setting the property to an invalid value normalizes it to `metric`. The attribute is reflected only when the normalized value changes: from `imperial` it becomes `metric`, and from `metric` it is left as it was. This is accepted and documented.
  - `#dashboard = new DashboardController(this)` is a field initializer, so the constructor only registers the controller and does no I/O. Lit forwards `connectedCallback` and `disconnectedCallback` to it.
  - `render()` returns `renderDashboardPage(this.#dashboard, this.units)`.
  - It keeps the guarded `if (!customElements.get(TAGS.weather)) customElements.define(TAGS.weather, WeatherDashboardElement)` as its only side effect.
  - CEM JSDoc: on the class, `@tag weather-dashboard`, `@attr units`, and `@cssprop` for `--mf-font-family`, `--mf-color-primary`, `--mf-color-error`, `--mf-color-text`, `--mf-color-border` and `--mf-color-muted` (the stale and secondary text color). The `units` getter carries `@type {"metric" | "imperial"}` and `@attr units`, so the manifest links the attribute (`fieldName: "units"`) and the typed field. `static properties` and `static styles` are `@internal`, which keeps them out of the manifest.
  - **Lit lifecycle details.** Both still meet the [element lifecycle](../specs/01.init-spec.md#element-lifecycle) contract, because no timer, fetch or listener survives a disconnect:
    1. Lit creates the open shadow root on the **first connect** (`createRenderRoot`), not in the constructor.
    2. Lit **keeps the rendered DOM on disconnect**. Re-connecting re-renders into it, and the controller reloads and refreshes.
  - **Window globals:** the app adds none. The documented exception is Lit's own unconfigurable markers. These are its version registries `litHtmlVersions`, `litElementVersions` and `reactiveElementVersions`, plus **`litPropertyMetadata`**, the WeakMap behind Lit's property metadata, which Lit 3's production `reactive-element` sets (`globalThis.litPropertyMetadata ??= new WeakMap()`). WE-29a allow-lists exactly these four. The fourth name was found during implementation; the shipped bundle contains it too.

### 2.2 UI behaviour

| Feature | Behaviour |
|---|---|
| Header | Heading "Weather", `Units: <output data-testid="units">metric</output>`, and a "Refresh" button (`data-action="refresh"`, disabled when no city is saved). |
| Search | A form (`data-testid="search"`) with a search input (`name="q"`) and a "Search" button. Submitting (Enter or button) runs `runSearch`. The status line (`data-testid="search-status"`) reads "Searching…" while pending, "No cities found" for an empty result, and "Search failed. Try again." on failure or timeout. It is empty otherwise. Results are a list of up to 5 suggestions labelled `Name, Region, Country`, with empty parts omitted (`Atlantis` when there is no region or country). Each has an "Add" button. |
| Add | "Add" saves the city and shows its card at once in the loading state. The input and results are cleared. A duplicate (same lat/lon) or the limit shows the notice (`data-testid="notice"`) and adds nothing. With 10 cities saved, every "Add" button is disabled and "You can save up to 10 cities" is shown. |
| Card | `<article data-testid="city-card" data-city-id="…" data-status="loading\|ready\|stale\|error">` with heading `Name, Country` and a "Remove" button (`aria-label="Remove <name>"`). With a forecast it shows the current temperature (large), `Min x / Max y`, `Precipitation n%` (`Precipitation –` when null), and icon + WMO label. The status line is `data-testid="card-status"`. |
| Card states | **loading**: "Loading…" without a forecast, or the held forecast plus "Updating…". **ready**: the forecast, with an empty status line. **stale**: the held forecast, dimmed, with "Couldn't refresh · last updated HH:MM" (`formatTime(fetchedAt)`, local time). **error**: "Couldn't load forecast" and a "Retry" button (`data-action="retry"`). |
| Remove | Removes the card, the saved city and its cached forecast. |
| Empty state | No saved cities: "No saved cities yet. Search for a city to add it." No forecast request is made. |
| Units | Re-renders all temperatures in °C or °F from the held °C values. Nothing is refetched. |

Persistence: the controller loads both keys on every connect, so re-entering the route reads fresh data. It saves `weather:cities` after add or remove, and `weather:forecasts` after each successful fetch or removal. Only `weather:*` keys are used.

### 2.3 Refresh, timers, timeouts and aborts

- Triggers: connect (refresh on load), `setInterval` every 900 000 ms, the "Refresh" button, per-card "Retry", and a newly added city (that city only).
- One tracked request per city (`forecast:<id>`) plus one for search (`search`), each with a 10 s timeout. A new request for the same key aborts the previous one.
- A timeout counts as a failure: the card goes to `stale` or `error`, and the search shows "Search failed. Try again.".
- Disconnect aborts everything and clears the interval and all timeouts. After removal no request is pending, `vi.getTimerCount()` is 0, and no late result re-renders the element.
- Moving the element (disconnect followed by connect) runs a fresh refresh and leaves exactly one interval.

### 2.4 Build and test configuration

- Add `lit` (v3) as a dependency, which also updates `pnpm-lock.yaml`. There is no Lit plugin. Library mode stays `web-component.ts → weather-app.js` (ES, one file) with Lit bundled, not external.
- Lit picks its development or production build through package `exports` conditions, not `process.env.NODE_ENV`, so `vite.config.ts` needs no `define` (unlike M2). `vite build` resolves Lit's browser production build.
- The build output contains no `.css` asset (styles come in through `?inline`). No bare `import "lit"` remains, and the bundle contains neither Lit's dev-mode markers (`litIssuedWarnings`) nor its SSR shim (`litServerRoot`).
- `vitest.config.ts`:
  - `test.css: { include: [/\.css(\?|$)/] }`, as in todo-app. Without it, `?inline` returns `''` under Vitest.
  - Tests run **Lit's browser production build**, like the shipped bundle. The guard is WE-29b: `'litIssuedWarnings' in window` is false. Two problems had to be solved:
    1. Vite resolves `development|production` to `development` outside production. Lit's development build adds dev-mode `console.warn`s (which would break WE-09) and the `litIssuedWarnings` global.
    2. Vitest resolves with server conditions (`node`). Lit's node build loads an SSR DOM shim that sets `litServerRoot`.
  - **Deviation from the review decision:** `resolve.conditions` (with or without `server.deps.inline`) did not work in Vitest 5 / Vite 8. Vitest sets each environment's conditions in its own config hook and merges them with the user's, so `development` stays in. The working fix is a small `enforce: 'post'` plugin in `vitest.config.ts` (`weather:lit-browser-production-build`). Its `configEnvironment` hook maps `development|production` / `development` to `production` and puts `browser` first. `server.deps.inline` is not needed.
- `tsconfig.json` already has `"types": ["vite/client"]` for `?inline`. No decorators are used.
- `package.json` `"customElements"` is fixed from a stale absolute scratchpad path to `"custom-elements.json"`. `custom-elements.json` is regenerated with `pnpm analyze`: it records superclass `LitElement`, the typed `units` field and attribute (linked through `fieldName`/`attribute`) and six `@cssprop`s.
- `index.html` (the standalone harness with the units buttons) is unchanged.

## 3. Test scenarios

Tests are written before the code ([02.testing.md](../specs/02.testing.md)). The IDs are stable, and each `it` ends with its ID. One `it` checks one outcome: where a scenario has several outcomes, it is split into IDs with letter suffixes (`a`, `b`, `c`).

Only the edges are faked:

- **Network.** `fetch` is faked through `src/test/fetch-fakes.ts`. The services get the fake injected; contract tests use `vi.stubGlobal('fetch', fake)`. Every contract test starts from a `fetch` that rejects with "unexpected network request in test", so nothing reaches the real network.
  - **`deferredFetch()`** holds each request until the test calls `resolve(response)` or `reject(error)` on it, and it honours `signal`. It is used in **every scenario that asserts a transient state** (loading, Updating…, Searching…) and for in-flight aborts and timeouts.
  - **`immediateFetch(route)`** answers at once. It is used only for end-state assertions.
- **Storage.** A fake `Storage` in the service tests. The real happy-dom `localStorage`, cleared before and after each test, in contract tests.
- **Timers and `Date`.** `vi.useFakeTimers()` in the 15-minute timer and 10 s timeout scenarios.

There is no real network and no wall-clock wait. A `settle(el)` helper does three things in order:

1. It awaits the installed fake's `whenSettled()`. Both fakes expose it, and it resolves once every request that has settled so far has run its callbacks. Held requests are not awaited.
2. It runs a bounded microtask flush (`MICROTASK_BOUND = 50`). An answer takes about 10 hops to reach state; the bound is commented in the test and keeps a test from ever hanging.
3. It awaits `el.updateComplete`.

So negative assertions after `settle` see every reaction to every answer that was released.

### 3.1 Domain (no DOM)

`domain/units.test.ts` keeps WE-01 … WE-03 unchanged. The other files are `time.test.ts`, `cities.test.ts`, `weather-codes.test.ts` and `card-state.test.ts`.

| ID | Given / when / then |
|---|---|
| WDM-01 | given 0, 100 and -40 °C, when converted, then 32, 212 and -40 °F |
| WDM-02a | given 21.4 °C, when formatted metric, then `"21 °C"` |
| WDM-02b | given 21.4 °C, when formatted imperial, then `"71 °F"` |
| WDM-02c | given -0.4 °C, when formatted metric, then `"0 °C"` (no minus sign) |
| WDM-03a | given 52.52/13.41 and 52.52004/13.40996, when compared, then `sameLocation` is true |
| WDM-03b | given 52.52/13.41 and 52.5212/13.41, when compared, then false |
| WDM-04 | given a list, when `addCity` with a new location, then ok and a new list ends with the city; the input is unchanged |
| WDM-05 | given a saved city, when `addCity` with a different id and name but the same lat/lon, then not ok, reason `duplicate`, list unchanged |
| WDM-06a | given 9 cities, when `addCity`, then ok with 10 |
| WDM-06b | given 10 cities, when `addCity`, then not ok, reason `limit` |
| WDM-06c | given 10 cities, when a duplicate is added, then reason `duplicate` (checked first) |
| WDM-07a | given cities, when `removeCity(id)`, then only that city is gone |
| WDM-07b | given cities, when `removeCity` with an unknown id, then an equal list |
| WDM-08a | given invalid items (empty name, lat 91, infinite lon, non-string country, null, a string), when sanitized, then they are dropped |
| WDM-08b | given a duplicate location, when sanitized, then the first is kept |
| WDM-08c | given 12 valid cities, when sanitized, then the first 10 are kept |
| WDM-08d | given items with extra fields, when sanitized, then only `id, name, country, lat, lon` remain |
| WDM-08e | given a non-array, when sanitized, then `[]` |
| WDM-08f | given two items with the same id at different locations, when sanitized, then the first is kept |
| WDM-09 | given every code in the WMO table, when described, then the table's label and icon (table-driven, one `it` per code) |
| WDM-10a | given code 4, when described, then `{ label: 'Unknown', icon: '❔' }` |
| WDM-10b | given `null`, when described, then `{ label: 'Unknown', icon: '❔' }` |
| WDM-11a | given a cached forecast, when `loading(cached)`, then status `loading` keeps the forecast |
| WDM-11b | given no cache, when `loading()`, then status `loading` without a forecast |
| WDM-12 | given any state, when `succeeded(f)`, then status `ready` with `f` |
| WDM-13a | given a cached forecast, when `failed(cached)`, then status `stale` with it |
| WDM-13b | given no cache, when `failed()`, then status `error` |
| WDM-14 | given 2026-11-13T14:05:09Z, when `formatTime(…, 'UTC')`, then `"14:05"` |
| WDM-15 | given 2026-11-13T00:07Z, when `formatTime(…, 'UTC')`, then `"00:07"` (24-hour, zero-padded) |

### 3.2 Services (fake `fetch`, fake `Storage`)

`geocoding-client.test.ts`, `forecast-client.test.ts` and `weather-storage.test.ts`. `RequestTracker` is exercised through the contract scenarios at the seam where production uses it: supersede (WE-33a, WE-33b), abort on remove (WE-33c), abort and timer cleanup on disconnect (WE-27), timeout (WE-32a, WE-32b), and the request-in-flight render (WE-17a).

| ID | Given / when / then |
|---|---|
| WSV-01 | given `"São Paulo"`, when searched, then one GET to `geocoding-api.open-meteo.com/v1/search` with exactly `name` (URL-encoded), `count=5`, `language=en`, `format=json`, and the given `signal` |
| WSV-02 | given a results payload, when searched, then suggestions `{ id: String(id), name, country, lat, lon, region: admin1 }` in order |
| WSV-03a | given a payload without `results`, when searched, then `[]` |
| WSV-03b | given items without coordinates or without a country, when searched, then the former are dropped and the country becomes `''` |
| WSV-04a | given a 500 response, when searched, then it rejects with `GeocodingError` |
| WSV-04b | given the signal is aborted, when searched, then it rejects with `AbortError` |
| WSV-05 | given a city, when the forecast is fetched, then the URL is `api.open-meteo.com/v1/forecast` with exactly `latitude`, `longitude`, `current=temperature_2m`, `daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`, `timezone=auto`, `forecast_days=1` |
| WSV-06a | given a valid payload and `now()` = T, then `Forecast { currentC, minC, maxC, precipitationPct, weatherCode, fetchedAt: T }` |
| WSV-06b | given `null` precipitation and code, then they are kept as `null` |
| WSV-07a | given a 503 response, then it rejects with `ForecastError` |
| WSV-07b | given a payload missing `current.temperature_2m`, then `ForecastError` |
| WSV-07c | given a payload missing the daily temperatures, then `ForecastError` |
| WSV-07d | given the signal is aborted, then `AbortError` |
| WSV-08 | given empty storage, when loaded, then cities `[]` and forecasts `{}` |
| WSV-09a | given cities saved, when loaded, then the same cities come back from `weather:cities`, each with exactly the five fields |
| WSV-09b | given stored cities with an invalid item and a duplicate, when loaded, then `sanitizeCities` applies |
| WSV-10a | given corrupt JSON in `weather:cities`, when loaded, then `[]` and `console.warn` |
| WSV-10b | given corrupt JSON in `weather:forecasts`, when loaded, then `{}` and `console.warn` |
| WSV-10c | given a forecast entry with an invalid shape, when loaded, then it is dropped |
| WSV-11a | given `saveForecast(id, f)`, then `weather:forecasts` holds `{ [id]: f }` (with `fetchedAt`) next to other entries |
| WSV-11b | given a stored forecast, when `removeForecast(id)`, then only that entry is gone |
| WSV-12 | given `setItem` throws, when cities or a forecast are saved, then nothing throws and `console.warn` is called |

### 3.3 Contract and UI: `web-component.test.ts` (through the element only)

WE-04 … WE-12 stay and keep their meaning. Lit renders asynchronously, so **WE-05, WE-06, WE-07, WE-08, WE-09, WE-10 and WE-11** (and the new WE-09b) now `await el.updateComplete` after mount, after an attribute or property change, and after re-append, before asserting. WE-04 and WE-12 are unchanged.

- **WE-05** changes only its first assertion: the placeholder text "Weather placeholder" goes away, so it asserts the `h2` reads "Weather". It still asserts that `[data-testid="units"]` and `el.units` show `imperial`.
- **WE-06** checks both `styles.css?inline` and the CSS applied in the shadow root. A helper collects the text of the `adoptedStyleSheets` rules and any `<style>`, with whitespace and `;` removed. The test asserts that this starts with `:host{display:block}:host([hidden]){display:none}`.
- **WE-12** is extended by WE-30.

| ID | Given / when / then |
|---|---|
| WE-09b | given `el.units = 'kelvin'` (warns once), when the host then sets `units="kelvin"`, then it warns again; re-setting the same value does not warn; `imperial` then `kelvin` warns again; `units` stays `metric` |
| WE-13 | given no saved cities, when appended, then the empty state shows, "Refresh" is disabled, and `fetch` is not called |
| WE-14a | given two saved cities (deferred fetch), when appended, then two cards render with `data-status="loading"` and "Loading…" |
| WE-14b | given two loading cards, when the forecasts are released, then each card shows `Name, Country`, the current temp, `Min/Max`, `Precipitation n%`, and icon + label; exactly one forecast request per city |
| WE-14c | given a forecast with `null` precipitation, when shown, then `Precipitation –` |
| WE-15a | given a query "Ber" (deferred fetch), when submitted, then "Searching…" shows and one geocoding request with `name=Ber` is pending |
| WE-15b | given a pending search, when results are released, then suggestions render as `Berlin, Land Berlin, Germany` / `Paris, Île-de-France, France` with "Add" buttons, and the status line is empty |
| WE-15c | given a suggestion without region and country, when rendered, then its label is just `Atlantis` |
| WE-16a | given a 1-character query, when submitted, then no request is made and "Type at least 2 characters" shows |
| WE-16b | given geocoding returns no results, when searched, then "No cities found" |
| WE-16c | given geocoding responds 500, when searched, then "Search failed. Try again." |
| WE-17a | given search results (deferred fetch), when "Add" is clicked, then the card appears at once with `data-status="loading"` before the forecast arrives, one forecast request is pending, and the results and input are cleared |
| WE-17b | given search results (immediate fetch), when "Add" is clicked, then after settle the card is `ready` (`21 °C`), one forecast request was made, and `weather:cities` holds exactly `{ id, name, country, lat, lon }` |
| WE-18 | given a saved city, when a suggestion with the same lat/lon (different id and name) is added, then no card or request is added and "Berlin is already saved" shows |
| WE-19 | given 10 saved cities, when results show, then every "Add" is disabled, "You can save up to 10 cities" shows, and storage still holds 10 |
| WE-20 | given two ready cards, when "Remove" is clicked on one, then its card, its `weather:cities` entry and its `weather:forecasts` entry are gone; the other card stays `ready` |
| WE-21 | given ready cards in metric (21.4 °C), when `units` is set to `imperial`, then the cards read `71 °F` and `Min 59 °F / Max 77 °F`, the header shows `imperial`, and the `fetch` call count is unchanged |
| WE-22 | given fake timers and two ready cards, when time advances by 15 min − 1 ms, then there are no new requests; when it advances 1 ms more, then one new forecast request per city |
| WE-23a | given ready cards, when "Refresh" is clicked (deferred fetch), then one request per city is pending, and the cards are `loading` with "Updating…" and the old values |
| WE-23b | given a card updating after Refresh, when the new forecast is released, then it is `ready` with the new value and an empty status line |
| WE-24a | given one city whose forecast responds 500, when settled, then only that card is `error` with "Couldn't load forecast" and "Retry"; the other is `ready` |
| WE-24b | given a card in error, when "Retry" is clicked and the fetch succeeds, then one request is made and the card is `ready` |
| WE-25a | given a cached forecast in `weather:forecasts` and a `fetch` rejecting with `TypeError` (offline), when appended, then the card shows the cached values with `data-status="stale"` and "Couldn't refresh · last updated HH:MM" |
| WE-25b | given no cache and a `fetch` rejecting with `TypeError`, when appended, then `data-status="error"` |
| WE-26 | given fake timers and a mounted element with cities, when it is removed, then `vi.getTimerCount()` is 0 and advancing 15 min makes no request |
| WE-27 | given fake timers and a forecast and a search in flight (deferred fetch), when the element is removed, then `vi.getTimerCount()` is 0 at once (the 10 s timeouts are cleared), both received signals are `aborted`, the card does not turn to error, "Search failed" is not shown, and `console.error` is not called |
| WE-28 | given fake timers and a mounted element, when it is removed and re-appended, then a refresh runs once and, after 15 min, exactly one more request per city is made (one interval, not two) |
| WE-29a | given rendering, searching and adding a city, then `document.head` gains no nodes (no `<style>`/`<link>`), `window` gains no own properties besides exactly `litHtmlVersions`, `litElementVersions`, `reactiveElementVersions` and `litPropertyMetadata` (baseline taken before the first import), and every `localStorage` key starts with `weather:` |
| WE-29b | given the test run, then `'litIssuedWarnings' in window` is false (Lit's production build is in use) |
| WE-30 | given `custom-elements.json`, then it documents the `weather-dashboard` tag, the `units` attribute, and every `--mf-*` property used in `styles.css`; `package.json` `customElements` is `"custom-elements.json"` |
| WE-31 | given a ready card, when "Refresh" fails with `TypeError`, then it is `stale` with the previous values; when a later "Refresh" succeeds, then it is `ready` with the new values |
| WE-32a | given fake timers and a hanging forecast request, when 10 s − 1 ms pass, then the card is still `loading`; at 10 s the request's signal is aborted and the card is `error` (`stale` if it held a forecast) |
| WE-32b | given fake timers and a hanging search, when 10 s pass, then "Search failed. Try again." shows |
| WE-33a | given a search in flight, when a newer search is submitted, then "Searching…" stays (the superseded one shows no error); when the newer answer arrives first and the older one last, then the older request is aborted and only the newer results show |
| WE-33b | given a forecast in flight, when "Refresh" is clicked and the old answer arrives after the new one, then the old one is ignored: the card and `weather:forecasts` hold the newer value |
| WE-33c | given a city whose forecast is in flight, when it is removed and the answer arrives later, then `weather:forecasts` has no entry for it and no card renders |

"New card within 2s" acceptance: WE-17a shows that the card renders in the same update as the click, before any response, with no timer or debounce in between. WE-17b shows it fills with data as soon as the single forecast request answers. The 2 s budget itself is checked manually (section 4).

## 4. Exit criteria

- `pnpm -r test` and `pnpm -r typecheck` pass. `pnpm -F @mf/weather-app build` emits a single `dist/weather-app.js` with Lit bundled and no CSS asset.
- Manual check:
  - Run `pnpm dev` and open the shell at `#/weather`. Search "Berlin" and add it: its card shows a temperature within 2 s (watch the DevTools Network tab for one `forecast` request).
  - Try to add Berlin again: it is rejected. Add cities until there are 10: "Add" is disabled.
  - Reload: the cities persist and refresh. Go to `#/todo` and back: the cities persist.
  - Switch DevTools to Offline and click "Refresh": the cards show their last data with "Couldn't refresh · last updated HH:MM".
  - In the standalone harness, the units buttons switch °C/°F without network requests, and "kelvin" shows metric with a console warning.
- The shell code and `host.config.json` are unchanged.
