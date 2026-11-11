/**
 * Test-data builders (docs/specs/03.testing.md §3).
 * Defaults are valid and boring; a test spells out only what matters to its situation.
 */
import type { AppEntry, Command, ErrorScope, HostConfig, HostEvent, HostState, StateName } from '../../src/types';

const PORTS: Record<string, number> = { todo: 5175, weather: 5176 };
const TAGS: Record<string, string> = { todo: 'todo-app', weather: 'weather-dashboard' };

/** A valid manifest entry: `anApp('todo')` → route `#/todo`, tag `todo-app`, an absolute http URL. */
export function anApp(name: string, overrides: Partial<AppEntry> = {}): AppEntry {
  const port = PORTS[name] ?? 5199;
  return {
    name,
    route: `#/${name}`,
    url: `http://localhost:${port}/src/${name}-app.ts`,
    tag: TAGS[name] ?? `${name}-app`,
    ...overrides,
  };
}

/** A validated config. With no apps given: `todo` and `weather`. */
export function aConfig(...apps: AppEntry[]): HostConfig {
  return { apps: apps.length > 0 ? apps : [anApp('todo'), anApp('weather')] };
}

/** The raw JSON body of `host.config.json` for the given entries (inverse of `parseConfig`). */
export function aManifest(...apps: AppEntry[]): { apps: Record<string, { route: string; url: string; tag: string }> } {
  const list = apps.length > 0 ? apps : aConfig().apps;
  return { apps: Object.fromEntries(list.map(({ name, route, url, tag }) => [name, { route, url, tag }])) };
}

const APP_STATES: StateName[] = ['loadingApp', 'appActive', 'appError'];

/** Every state that `routeChanged` can be received in once the config is loaded. */
export const ROUTED_STATES: StateName[] = ['home', 'notFound', 'loadingApp', 'appActive', 'appError'];

/**
 * A host state. Defaults: config loaded (except `fatalError`), activation id 1,
 * entry `todo` for app states, and a matching path.
 * `aState('booting')` is booting *with* config; use `aState('booting', { config: null })` for before configLoaded.
 */
export function aState(name: StateName, overrides: Partial<HostState> = {}): HostState {
  const config = aConfig();
  const isApp = APP_STATES.includes(name);
  const entry = isApp ? config.apps[0] : null;
  const path = isApp ? entry!.route : name === 'home' ? '#/' : name === 'notFound' ? '#/nope' : null;
  return {
    name,
    config: name === 'fatalError' ? null : config,
    activationId: 1,
    entry,
    path,
    ...overrides,
  };
}

/** Event builders, one per notification. */
export const on = {
  configLoaded: (config: HostConfig = aConfig()): HostEvent => ({ type: 'configLoaded', config }),
  configFailed: (message = 'HTTP 404'): HostEvent => ({ type: 'configFailed', error: new Error(message) }),
  routeChanged: (path: string, entry: AppEntry | null = null): HostEvent => ({ type: 'routeChanged', path, entry }),
  navigateRequested: (path: string): HostEvent => ({ type: 'navigateRequested', path }),
  appLoaded: (entry: AppEntry, activationId: number): HostEvent => ({ type: 'appLoaded', entry, activationId }),
  appFailed: (entry: AppEntry, activationId: number, message = 'could not reach remote'): HostEvent => ({
    type: 'appFailed',
    entry,
    activationId,
    error: new Error(message),
  }),
  retryRequested: (scope: ErrorScope): HostEvent => ({ type: 'retryRequested', scope }),
};

type LogCommand = Extract<Command, { type: 'log' }>;

/** Commands without the `log` ones: what colleagues are asked to do. */
export const effects = (commands: Command[]): Command[] => commands.filter((c) => c.type !== 'log');

/** Only the `log` commands. */
export const logs = (commands: Command[]): LogCommand[] => commands.filter((c): c is LogCommand => c.type === 'log');
