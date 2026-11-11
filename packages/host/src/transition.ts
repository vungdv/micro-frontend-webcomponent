import type { AppEntry, Command, HostEvent, HostState, LogLevel, Transition } from './types';

/**
 * The host's decision logic as a pure function (docs/milestones/m1-host-shell.md §2.4).
 * No DOM, no I/O: logging is returned as a `log` command for the mediator to run.
 */

export const HOME_PATH = '#/';

/** `[*] --> booting: start / config.load` */
export function start(): Transition {
  return {
    state: { name: 'booting', config: null, activationId: 0, entry: null, path: null },
    commands: [{ type: 'config.load' }],
  };
}

export function transition(state: HostState, event: HostEvent): Transition {
  switch (event.type) {
    case 'configLoaded':
      if (state.name !== 'booting' || state.config) return ignore(state, event, 'warn');
      return {
        state: { ...state, config: event.config },
        commands: [
          { type: 'header.render', apps: event.config.apps },
          { type: 'router.start', apps: event.config.apps },
        ],
      };

    case 'configFailed':
      if (state.name !== 'booting' || state.config) return ignore(state, event, 'warn');
      return {
        state: { ...state, name: 'fatalError' },
        commands: [
          log('error', 'config failed', { error: event.error.message }),
          {
            type: 'outlet.showError',
            scope: 'global',
            message: `Could not load the host configuration: ${event.error.message}`,
            retryable: true,
          },
        ],
      };

    case 'routeChanged':
      return onRouteChanged(state, event.path, event.entry);

    case 'navigateRequested': {
      if (!state.config) return ignore(state, event, 'warn');
      const known = event.path === HOME_PATH || state.config.apps.some((app) => app.route === event.path);
      if (!known) {
        return { state, commands: [log('warn', 'navigate request rejected: unknown path', { path: event.path })] };
      }
      return { state, commands: [{ type: 'router.navigate', path: event.path }] };
    }

    case 'appLoaded':
      if (!isCurrentLoad(state, event.activationId)) return stale(state, event);
      return {
        state: { ...state, name: 'appActive' },
        commands: [{ type: 'outlet.mount', entry: event.entry }],
      };

    case 'appFailed':
      if (!isCurrentLoad(state, event.activationId)) return stale(state, event);
      return {
        state: { ...state, name: 'appError' },
        commands: [
          log('error', 'app failed', { app: event.entry.name, activationId: event.activationId, error: event.error.message }),
          {
            type: 'outlet.showError',
            scope: 'route',
            message: `Could not load ${event.entry.name}: ${event.error.message}`,
            retryable: true,
          },
        ],
      };

    case 'retryRequested':
      if (event.scope === 'global' && state.name === 'fatalError') {
        return { state: { ...state, name: 'booting', config: null }, commands: [{ type: 'config.load' }] };
      }
      if (event.scope === 'route' && state.name === 'appError' && state.entry) {
        return enterLoadingApp(state, state.entry, true);
      }
      return ignore(state, event, 'warn');

    default:
      return ignore(state, event as { type: string }, 'warn');
  }
}

/**
 * "Routing is the same from every state": once the config is loaded, the next state
 * depends on the hash alone (booting or any routed state). `#/` → home,
 * a declared route → loadingApp (always a new activation id), anything else → notFound.
 */
function onRouteChanged(state: HostState, path: string, entry: AppEntry | null): Transition {
  if (!state.config || state.name === 'fatalError') {
    return ignore(state, { type: 'routeChanged' }, 'warn');
  }
  if (path === HOME_PATH) {
    return {
      state: { ...state, name: 'home', entry: null, path },
      commands: [
        { type: 'header.setActive', entry: null },
        { type: 'outlet.showHome', apps: state.config.apps },
      ],
    };
  }
  if (entry) return enterLoadingApp({ ...state, path }, entry, false);
  return {
    state: { ...state, name: 'notFound', entry: null, path },
    commands: [
      { type: 'header.setActive', entry: null },
      { type: 'outlet.showNotFound', path },
    ],
  };
}

/** Every entry into loadingApp gets a new activation id. */
function enterLoadingApp(state: HostState, entry: AppEntry, retry: boolean): Transition {
  const activationId = state.activationId + 1;
  const commands: Command[] = [];
  if (!retry) commands.push({ type: 'header.setActive', entry });
  commands.push(
    { type: 'outlet.showLoading', entry },
    { type: 'loader.load', entry, activationId, retry },
  );
  return { state: { ...state, name: 'loadingApp', entry, activationId }, commands };
}

function isCurrentLoad(state: HostState, activationId: number): boolean {
  return state.name === 'loadingApp' && activationId === state.activationId;
}

function stale(state: HostState, event: Extract<HostEvent, { activationId: number }>): Transition {
  return {
    state,
    commands: [
      log('warn', 'stale load result ignored', {
        event: event.type,
        app: event.entry.name,
        activationId: event.activationId,
        currentActivationId: state.activationId,
        state: state.name,
      }),
    ],
  };
}

function ignore(state: HostState, event: { type: string }, level: LogLevel): Transition {
  return { state, commands: [log(level, 'event ignored in current state', { event: event.type, state: state.name })] };
}

function log(level: LogLevel, message: string, fields?: Record<string, unknown>): Command {
  return { type: 'log', level, message, fields };
}
