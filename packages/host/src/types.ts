/** One micro-frontend declared in the manifest. */
export interface AppEntry {
  /** Key in `apps` (e.g. `todo`). */
  name: string;
  /** Hash route, e.g. `#/todo`. */
  route: string;
  /** Absolute URL of the remote ES module (resolved against the manifest URL). */
  url: string;
  /** The single root custom element tag the remote defines. */
  tag: string;
}

/** Validated manifest. */
export interface HostConfig {
  apps: AppEntry[];
}

export type ErrorScope = 'global' | 'route';

/** Notifications colleagues (and main.ts) send to the mediator. */
export type HostEvent =
  | { type: 'configLoaded'; config: HostConfig }
  | { type: 'configFailed'; error: Error }
  | { type: 'routeChanged'; path: string; entry: AppEntry | null }
  | { type: 'navigateRequested'; path: string }
  | { type: 'appLoaded'; entry: AppEntry; activationId: number }
  | { type: 'appFailed'; entry: AppEntry; activationId: number; error: Error }
  | { type: 'retryRequested'; scope: ErrorScope };

export type Notify = (event: HostEvent) => void;

export type StateName =
  | 'booting'
  | 'fatalError'
  | 'home'
  | 'notFound'
  | 'loadingApp'
  | 'appActive'
  | 'appError';

export interface HostState {
  name: StateName;
  /** Null until `configLoaded`. */
  config: HostConfig | null;
  /** Id of the latest entry into `loadingApp`. */
  activationId: number;
  /** The app of the current route (loadingApp, appActive, appError). */
  entry: AppEntry | null;
  /** Current hash path once a route is known. */
  path: string | null;
}

export type LogLevel = 'info' | 'warn' | 'error';

/** Commands the mediator runs against colleagues. They return nothing. */
export type Command =
  | { type: 'config.load' }
  | { type: 'header.render'; apps: AppEntry[] }
  | { type: 'header.setActive'; entry: AppEntry | null }
  | { type: 'router.start'; apps: AppEntry[] }
  | { type: 'router.navigate'; path: string }
  | { type: 'outlet.showHome'; apps: AppEntry[] }
  | { type: 'outlet.showLoading'; entry: AppEntry }
  | { type: 'outlet.showError'; scope: ErrorScope; message: string; retryable: boolean }
  | { type: 'outlet.showNotFound'; path: string }
  | { type: 'outlet.mount'; entry: AppEntry }
  | { type: 'loader.load'; entry: AppEntry; activationId: number; retry: boolean }
  | { type: 'log'; level: LogLevel; message: string; fields?: Record<string, unknown> };

export interface Transition {
  state: HostState;
  commands: Command[];
}
