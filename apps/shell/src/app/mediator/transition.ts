import { HOME_ROUTE } from '../routes.ts';
import type { HostCommand, HostEvent, HostState, Transition } from './types.ts';

export const initialState: HostState = {
  phase: { kind: 'booting' },
  config: null,
  lastActivationId: 0,
};

/**
 * The host's decision logic (M1 §2.4): pure, no DOM and no I/O.
 * Given the current state and a notification, returns the next state and the commands to run.
 */
export function transition(state: HostState, event: HostEvent): Transition {
  switch (event.type) {
    case 'start':
      if (state.phase.kind === 'booting' && state.config === null) {
        return { state, commands: [{ type: 'config.load' }] };
      }
      return ignore(state, 'start ignored: host already started', { phase: state.phase.kind });

    case 'configLoaded':
      if (state.phase.kind !== 'booting' || state.config !== null) {
        return ignore(state, 'configLoaded ignored outside booting', { phase: state.phase.kind });
      }
      return {
        state: { ...state, config: event.config },
        commands: [
          { type: 'header.render', apps: event.config.apps },
          { type: 'router.start', apps: event.config.apps },
        ],
      };

    case 'configFailed':
      if (state.phase.kind !== 'booting' || state.config !== null) {
        return ignore(state, 'configFailed ignored outside booting', { phase: state.phase.kind });
      }
      return {
        state: { ...state, phase: { kind: 'fatalError' } },
        commands: [
          { type: 'outlet.showError', scope: 'global', message: event.message, retryable: true },
          { type: 'log.warn', message: 'config failed to load', data: { error: event.message } },
        ],
      };

    case 'routeChanged':
      return route(state, event.hash, event.appId);

    case 'appLoaded':
    case 'appFailed': {
      const { phase } = state;
      const entry = state.config?.apps[event.appId];
      if (
        phase.kind !== 'loadingApp' ||
        phase.activationId !== event.activationId ||
        phase.appId !== event.appId ||
        !entry
      ) {
        return ignore(state, `stale ${event.type} ignored`, {
          appId: event.appId,
          activationId: event.activationId,
        });
      }
      if (event.type === 'appLoaded') {
        return {
          state: { ...state, phase: { ...phase, kind: 'appActive' } },
          commands: [{ type: 'outlet.mount', entry }],
        };
      }
      const data: Record<string, unknown> = { appId: event.appId, activationId: event.activationId, error: event.message };
      if (event.cause) data.cause = event.cause;
      return {
        state: { ...state, phase: { ...phase, kind: 'appError' } },
        commands: [
          { type: 'outlet.showError', scope: 'route', message: event.message, retryable: true },
          { type: 'log.warn', message: 'app failed to load', data },
        ],
      };
    }

    case 'retryRequested': {
      const { phase } = state;
      if (event.scope === 'global' && phase.kind === 'fatalError') {
        return { state: { ...state, phase: { kind: 'booting' } }, commands: [{ type: 'config.load' }] };
      }
      if (event.scope === 'route' && phase.kind === 'appError') {
        const entry = state.config?.apps[phase.appId];
        if (entry) return loadApp(state, phase.appId, true, []);
      }
      return ignore(state, 'retryRequested ignored', { scope: event.scope, phase: phase.kind });
    }

    case 'navigateRequested': {
      const apps = state.config?.apps;
      if (!apps) return ignore(state, 'navigateRequested ignored before config loaded', { path: event.path });
      const declared = event.path === HOME_ROUTE || Object.values(apps).some((e) => e.route === event.path);
      if (!declared) {
        return ignore(state, 'navigation to undeclared route ignored', { path: event.path });
      }
      return { state, commands: [{ type: 'router.navigate', path: event.path }] };
    }
  }
}

function route(state: HostState, hash: string, appId: string | null): Transition {
  const { config } = state;
  if (!config) return ignore(state, 'routeChanged ignored before config loaded', { hash });

  if (hash === HOME_ROUTE) {
    return {
      state: { ...state, phase: { kind: 'home' } },
      commands: [
        { type: 'header.setActive', appId: null },
        { type: 'outlet.showHome', apps: config.apps },
      ],
    };
  }
  if (appId !== null && config.apps[appId]) {
    return loadApp(state, appId, false, [{ type: 'header.setActive', appId }]);
  }
  return {
    state: { ...state, phase: { kind: 'notFound', hash } },
    commands: [
      { type: 'header.setActive', appId: null },
      { type: 'outlet.showNotFound', hash },
    ],
  };
}

/** Enters loadingApp with a fresh activation id. Caller guarantees the app exists in the config. */
function loadApp(state: HostState, appId: string, retry: boolean, before: HostCommand[]): Transition {
  const entry = state.config!.apps[appId]!;
  const activationId = state.lastActivationId + 1;
  return {
    state: { ...state, phase: { kind: 'loadingApp', appId, activationId }, lastActivationId: activationId },
    commands: [
      ...before,
      { type: 'outlet.showLoading', entry },
      { type: 'loader.load', appId, entry, activationId, retry },
    ],
  };
}

function ignore(state: HostState, message: string, data: Record<string, unknown>): Transition {
  return { state, commands: [{ type: 'log.warn', message, data }] };
}
