import { describe, expect, it } from 'vitest';
import type { HostConfig } from '@mf/contracts';
import { initialState, transition } from './transition.ts';
import type { HostEvent, HostState, Phase } from './types.ts';

const config: HostConfig = {
  apps: {
    todo: { route: '#/todo', url: 'http://t/todo.js', tag: 'todo-app', attributes: { 'weather-route': '#/weather' } },
    weather: { route: '#/weather', url: 'http://w/weather.js', tag: 'weather-dashboard' },
  },
};
const todo = config.apps.todo!;
const weather = config.apps.weather!;

function loaded(phase: Phase, lastActivationId = 0): HostState {
  return { phase, config, lastActivationId };
}

const routeTodo: HostEvent = { type: 'routeChanged', hash: '#/todo', appId: 'todo' };
const routeWeather: HostEvent = { type: 'routeChanged', hash: '#/weather', appId: 'weather' };
const routeHome: HostEvent = { type: 'routeChanged', hash: '#/', appId: null };
const routeUnknown: HostEvent = { type: 'routeChanged', hash: '#/nope', appId: null };

/** Every phase the host can be in once the config is loaded. */
const routedPhases: Phase[] = [
  { kind: 'booting' },
  { kind: 'home' },
  { kind: 'notFound', hash: '#/nope' },
  { kind: 'loadingApp', appId: 'todo', activationId: 3 },
  { kind: 'appActive', appId: 'todo', activationId: 3 },
  { kind: 'appError', appId: 'todo', activationId: 3 },
];

describe('transition: boot', () => {
  it('given the initial state, when start, then it stays booting and loads the config [TR-01]', () => {
    const result = transition(initialState, { type: 'start' });
    expect(result.state).toEqual(initialState);
    expect(result.commands).toEqual([{ type: 'config.load' }]);
  });

  it('given booting, when configLoaded, then it stores the config, renders the header and starts the router [TR-02]', () => {
    const result = transition(initialState, { type: 'configLoaded', config });
    expect(result.state).toEqual({ phase: { kind: 'booting' }, config, lastActivationId: 0 });
    expect(result.commands).toEqual([
      { type: 'header.render', apps: config.apps },
      { type: 'router.start', apps: config.apps },
    ]);
  });

  it('given booting, when configFailed, then it enters fatalError, shows a retryable global error and logs a warning [TR-03]', () => {
    const result = transition(initialState, { type: 'configFailed', message: 'bad manifest' });
    expect(result.state.phase).toEqual({ kind: 'fatalError' });
    expect(result.commands).toEqual([
      { type: 'outlet.showError', scope: 'global', message: 'bad manifest', retryable: true },
      { type: 'log.warn', message: 'config failed to load', data: { error: 'bad manifest' } },
    ]);
  });

  it('given fatalError, when retryRequested(global), then it goes back to booting and reloads the config [TR-04]', () => {
    const state: HostState = { phase: { kind: 'fatalError' }, config: null, lastActivationId: 0 };
    const result = transition(state, { type: 'retryRequested', scope: 'global' });
    expect(result.state.phase).toEqual({ kind: 'booting' });
    expect(result.commands).toEqual([{ type: 'config.load' }]);
  });

  it('given the config is not loaded, when routeChanged, then it is ignored with a warning [TR-15]', () => {
    const result = transition(initialState, routeTodo);
    expect(result.state).toBe(initialState);
    expect(result.commands).toEqual([
      expect.objectContaining({ type: 'log.warn' }),
    ]);
  });

  it('given the config is not loaded, when navigateRequested, then it is ignored with a warning [TR-15]', () => {
    const result = transition(initialState, { type: 'navigateRequested', path: '#/todo' });
    expect(result.state).toBe(initialState);
    expect(result.commands).toEqual([expect.objectContaining({ type: 'log.warn' })]);
  });

  it.each(routedPhases.filter((p) => p.kind !== 'booting'))(
    'given phase %o, when configLoaded or configFailed, then it is ignored with a warning [TR-17]',
    (phase) => {
      const state = loaded(phase, 3);
      for (const event of [
        { type: 'configLoaded', config } as const,
        { type: 'configFailed', message: 'x' } as const,
      ]) {
        const result = transition(state, event);
        expect(result.state).toBe(state);
        expect(result.commands).toEqual([expect.objectContaining({ type: 'log.warn' })]);
      }
    },
  );

  it('given the config is already loaded while booting, when start again, then it is ignored with a warning [TR-17]', () => {
    const state = loaded({ kind: 'booting' });
    const result = transition(state, { type: 'start' });
    expect(result.state).toBe(state);
    expect(result.commands).toEqual([expect.objectContaining({ type: 'log.warn' })]);
  });
});

describe('transition: routing is the same from every state', () => {
  describe.each(routedPhases)('given phase %o with the config loaded', (phase) => {
    const state = loaded(phase, 3);

    it('when routeChanged("#/"), then it shows home with no active link [TR-05]', () => {
      const result = transition(state, routeHome);
      expect(result.state).toEqual(loaded({ kind: 'home' }, 3));
      expect(result.commands).toEqual([
        { type: 'header.setActive', appId: null },
        { type: 'outlet.showHome', apps: config.apps },
      ]);
    });

    it('when routeChanged to a declared route, then it enters loadingApp with a new id and loads the app [TR-06]', () => {
      const result = transition(state, routeWeather);
      expect(result.state).toEqual(loaded({ kind: 'loadingApp', appId: 'weather', activationId: 4 }, 4));
      expect(result.commands).toEqual([
        { type: 'header.setActive', appId: 'weather' },
        { type: 'outlet.showLoading', entry: weather },
        { type: 'loader.load', appId: 'weather', entry: weather, activationId: 4, retry: false },
      ]);
    });

    it('when routeChanged to an unknown route, then it shows not-found [TR-07]', () => {
      const result = transition(state, routeUnknown);
      expect(result.state).toEqual(loaded({ kind: 'notFound', hash: '#/nope' }, 3));
      expect(result.commands).toEqual([
        { type: 'header.setActive', appId: null },
        { type: 'outlet.showNotFound', hash: '#/nope' },
      ]);
    });

    it('when routeChanged names an app id missing from the config, then it shows not-found [TR-07]', () => {
      const result = transition(state, { type: 'routeChanged', hash: '#/ghost', appId: 'ghost' });
      expect(result.state.phase).toEqual({ kind: 'notFound', hash: '#/ghost' });
    });
  });
});

describe('transition: loading an app', () => {
  const loading = loaded({ kind: 'loadingApp', appId: 'todo', activationId: 1 }, 1);

  it('given loadingApp(1), when appLoaded(1), then it enters appActive and mounts the element [TR-08]', () => {
    const result = transition(loading, { type: 'appLoaded', appId: 'todo', activationId: 1 });
    expect(result.state).toEqual(loaded({ kind: 'appActive', appId: 'todo', activationId: 1 }, 1));
    expect(result.commands).toEqual([{ type: 'outlet.mount', entry: todo }]);
  });

  it('given loadingApp(1), when appFailed(1), then it enters appError, shows a retryable route error and logs the cause [TR-10]', () => {
    const result = transition(loading, {
      type: 'appFailed', appId: 'todo', activationId: 1, message: 'could not reach todo', cause: 'Failed to fetch',
    });
    expect(result.state).toEqual(loaded({ kind: 'appError', appId: 'todo', activationId: 1 }, 1));
    expect(result.commands).toEqual([
      { type: 'outlet.showError', scope: 'route', message: 'could not reach todo', retryable: true },
      {
        type: 'log.warn', message: 'app failed to load',
        data: { appId: 'todo', activationId: 1, error: 'could not reach todo', cause: 'Failed to fetch' },
      },
    ]);
  });

  it('given loadingApp(1), when appFailed(1) without a cause, then the warning carries no cause [TR-10]', () => {
    const result = transition(loading, { type: 'appFailed', appId: 'todo', activationId: 1, message: 'timed out' });
    expect(result.commands).toContainEqual({
      type: 'log.warn', message: 'app failed to load', data: { appId: 'todo', activationId: 1, error: 'timed out' },
    });
  });

  it('given app A is loading, when the user navigates to B, then A is not mounted [TR-09]', () => {
    const toB = transition(loading, routeWeather).state;
    const result = transition(toB, { type: 'appLoaded', appId: 'todo', activationId: 1 });
    expect(result.state).toBe(toB);
    expect(result.commands).toEqual([
      { type: 'log.warn', message: 'stale appLoaded ignored', data: { appId: 'todo', activationId: 1 } },
    ]);
  });

  it('given app A is loading, when the user navigates away and A fails, then no error is shown [TR-09]', () => {
    const home = transition(loading, routeHome).state;
    const result = transition(home, { type: 'appFailed', appId: 'todo', activationId: 1, message: 'x' });
    expect(result.state).toBe(home);
    expect(result.commands).toEqual([
      { type: 'log.warn', message: 'stale appFailed ignored', data: { appId: 'todo', activationId: 1 } },
    ]);
  });

  it('given the user left and came back to the same app, when the first load settles, then it is ignored as stale [TR-09]', () => {
    const again = transition(transition(loading, routeHome).state, routeTodo).state;
    expect(again.phase).toEqual({ kind: 'loadingApp', appId: 'todo', activationId: 2 });
    const result = transition(again, { type: 'appLoaded', appId: 'todo', activationId: 1 });
    expect(result.state).toBe(again);
    expect(result.commands[0]).toMatchObject({ type: 'log.warn' });
  });

  it.each([
    { kind: 'appActive', appId: 'todo', activationId: 1 },
    { kind: 'appError', appId: 'todo', activationId: 1 },
  ] as Phase[])('given phase %o, when a duplicate appLoaded(1) arrives, then it is ignored [TR-09]', (phase) => {
    const state = loaded(phase, 1);
    const result = transition(state, { type: 'appLoaded', appId: 'todo', activationId: 1 });
    expect(result.state).toBe(state);
    expect(result.commands[0]).toMatchObject({ type: 'log.warn' });
  });

  it('given a sequence of route changes, then each entry into loadingApp gets the next activation id [TR-18]', () => {
    let state = loaded({ kind: 'home' });
    const ids: number[] = [];
    for (const event of [routeTodo, routeWeather, routeHome, routeTodo]) {
      state = transition(state, event).state;
      if (state.phase.kind === 'loadingApp') ids.push(state.phase.activationId);
    }
    expect(ids).toEqual([1, 2, 3]);
  });
});

describe('transition: retry', () => {
  const error = loaded({ kind: 'appError', appId: 'weather', activationId: 3 }, 3);

  it('given appError(3), when retryRequested(route), then it re-loads the app with retry=true and id 4 [TR-11]', () => {
    const result = transition(error, { type: 'retryRequested', scope: 'route' });
    expect(result.state).toEqual(loaded({ kind: 'loadingApp', appId: 'weather', activationId: 4 }, 4));
    expect(result.commands).toEqual([
      { type: 'outlet.showLoading', entry: weather },
      { type: 'loader.load', appId: 'weather', entry: weather, activationId: 4, retry: true },
    ]);
  });

  it('given appError, when retryRequested(global), then it is ignored with a warning [TR-12]', () => {
    const result = transition(error, { type: 'retryRequested', scope: 'global' });
    expect(result.state).toBe(error);
    expect(result.commands).toEqual([expect.objectContaining({ type: 'log.warn' })]);
  });

  it('given fatalError, when retryRequested(route), then it is ignored with a warning [TR-12]', () => {
    const state: HostState = { phase: { kind: 'fatalError' }, config: null, lastActivationId: 0 };
    const result = transition(state, { type: 'retryRequested', scope: 'route' });
    expect(result.state).toBe(state);
    expect(result.commands).toEqual([expect.objectContaining({ type: 'log.warn' })]);
  });

  it.each(routedPhases.filter((p) => p.kind !== 'appError'))(
    'given phase %o, when retryRequested(route), then it is ignored with a warning [TR-12]',
    (phase) => {
      const state = loaded(phase, 3);
      const result = transition(state, { type: 'retryRequested', scope: 'route' });
      expect(result.state).toBe(state);
      expect(result.commands).toEqual([expect.objectContaining({ type: 'log.warn' })]);
    },
  );

  it.each(routedPhases)('given phase %o, when retryRequested(global), then it is ignored [TR-12]', (phase) => {
    const state = loaded(phase, 3);
    const result = transition(state, { type: 'retryRequested', scope: 'global' });
    expect(result.state).toBe(state);
    expect(result.commands).toEqual([expect.objectContaining({ type: 'log.warn' })]);
  });

  it('given appError, when the user clicks another route, then that route loads normally [TR-16]', () => {
    const result = transition(error, routeTodo);
    expect(result.state.phase).toEqual({ kind: 'loadingApp', appId: 'todo', activationId: 4 });
    expect(result.commands).toContainEqual({ type: 'header.setActive', appId: 'todo' });
  });
});

describe('transition: navigation requested by an app', () => {
  const active = loaded({ kind: 'appActive', appId: 'todo', activationId: 1 }, 1);

  it.each(['#/', '#/weather', '#/todo'])(
    'given the config is loaded, when navigateRequested(%s), then it asks the router to navigate and keeps the state [TR-13]',
    (path) => {
      const result = transition(active, { type: 'navigateRequested', path });
      expect(result.state).toBe(active);
      expect(result.commands).toEqual([{ type: 'router.navigate', path }]);
    },
  );

  it.each(['#/nope', 'https://evil.example', '', '#weather'])(
    'given the config is loaded, when navigateRequested(%j) for an undeclared path, then it warns and keeps the state [TR-14]',
    (path) => {
      const result = transition(active, { type: 'navigateRequested', path });
      expect(result.state).toBe(active);
      expect(result.commands).toEqual([
        { type: 'log.warn', message: 'navigation to undeclared route ignored', data: { path } },
      ]);
    },
  );
});
