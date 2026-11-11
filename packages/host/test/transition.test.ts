import { describe, expect, it } from 'vitest';
import { HOME_PATH, start, transition } from '../src/transition';
import type { AppEntry, Command, HostConfig, HostEvent, HostState, StateName } from '../src/types';

const todo: AppEntry = { name: 'todo', route: '#/todo', url: 'http://localhost:5175/src/todo-app.ts', tag: 'todo-app' };
const weather: AppEntry = {
  name: 'weather',
  route: '#/weather',
  url: 'http://localhost:5176/src/weather-app.ts',
  tag: 'weather-dashboard',
};
const config: HostConfig = { apps: [todo, weather] };

function state(name: StateName, overrides: Partial<HostState> = {}): HostState {
  const appStates: StateName[] = ['loadingApp', 'appActive', 'appError'];
  return {
    name,
    config: name === 'fatalError' ? null : config,
    activationId: 1,
    entry: appStates.includes(name) ? todo : null,
    path: appStates.includes(name) ? todo.route : name === 'home' ? HOME_PATH : name === 'notFound' ? '#/nope' : null,
    ...overrides,
  };
}

const booted = (): HostState => state('booting'); // booting with config loaded
const route = (path: string, entry: AppEntry | null = null): HostEvent => ({ type: 'routeChanged', path, entry });
const nonLog = (commands: Command[]): Command[] => commands.filter((c) => c.type !== 'log');
const logs = (commands: Command[]) => commands.filter((c): c is Extract<Command, { type: 'log' }> => c.type === 'log');

const routeStates: StateName[] = ['home', 'notFound', 'loadingApp', 'appActive', 'appError'];

describe('start', () => {
  it('[*] → booting / config.load', () => {
    const t = start();
    expect(t.state).toEqual({ name: 'booting', config: null, activationId: 0, entry: null, path: null });
    expect(t.commands).toEqual([{ type: 'config.load' }]);
  });
});

describe('booting', () => {
  const initial = start().state;

  it('configLoaded → booting / header.render + router.start', () => {
    const t = transition(initial, { type: 'configLoaded', config });
    expect(t.state).toEqual({ ...initial, config });
    expect(t.commands).toEqual([
      { type: 'header.render', apps: config.apps },
      { type: 'router.start', apps: config.apps },
    ]);
  });

  it('configFailed → fatalError / outlet.showError(global, retryable)', () => {
    const t = transition(initial, { type: 'configFailed', error: new Error('HTTP 404') });
    expect(t.state.name).toBe('fatalError');
    expect(nonLog(t.commands)).toEqual([
      {
        type: 'outlet.showError',
        scope: 'global',
        message: 'Could not load the host configuration: HTTP 404',
        retryable: true,
      },
    ]);
    expect(logs(t.commands)[0]?.level).toBe('error');
  });

  it('routeChanged("#/") → home / header.setActive(null) + outlet.showHome', () => {
    const t = transition(booted(), route(HOME_PATH));
    expect(t.state.name).toBe('home');
    expect(t.commands).toEqual([
      { type: 'header.setActive', entry: null },
      { type: 'outlet.showHome', apps: config.apps },
    ]);
  });

  it('routeChanged(unknown) → notFound / outlet.showNotFound', () => {
    const t = transition(booted(), route('#/nope'));
    expect(t.state).toMatchObject({ name: 'notFound', path: '#/nope' });
    expect(t.commands).toEqual([
      { type: 'header.setActive', entry: null },
      { type: 'outlet.showNotFound', path: '#/nope' },
    ]);
  });

  it('routeChanged(app) → loadingApp with id 1 / setActive + showLoading + loader.load', () => {
    const t = transition({ ...booted(), activationId: 0 }, route('#/todo', todo));
    expect(t.state).toMatchObject({ name: 'loadingApp', activationId: 1, entry: todo });
    expect(t.commands).toEqual([
      { type: 'header.setActive', entry: todo },
      { type: 'outlet.showLoading', entry: todo },
      { type: 'loader.load', entry: todo, activationId: 1, retry: false },
    ]);
  });

  it('ignores routeChanged before the config is loaded', () => {
    const t = transition(initial, route(HOME_PATH));
    expect(t.state).toBe(initial);
    expect(nonLog(t.commands)).toEqual([]);
    expect(logs(t.commands)).toHaveLength(1);
  });

  it('ignores a second configLoaded / configFailed once the config is loaded', () => {
    for (const event of [
      { type: 'configLoaded', config },
      { type: 'configFailed', error: new Error('x') },
    ] as HostEvent[]) {
      const t = transition(booted(), event);
      expect(t.state).toEqual(booted());
      expect(nonLog(t.commands)).toEqual([]);
    }
  });
});

describe('fatalError', () => {
  it('retryRequested(global) → booting / config.load', () => {
    const t = transition(state('fatalError'), { type: 'retryRequested', scope: 'global' });
    expect(t.state).toMatchObject({ name: 'booting', config: null });
    expect(t.commands).toEqual([{ type: 'config.load' }]);
  });

  it('after retry, configLoaded proceeds normally', () => {
    const retried = transition(state('fatalError'), { type: 'retryRequested', scope: 'global' }).state;
    const t = transition(retried, { type: 'configLoaded', config });
    expect(nonLog(t.commands).map((c) => c.type)).toEqual(['header.render', 'router.start']);
  });

  it.each<HostEvent>([
    { type: 'retryRequested', scope: 'route' },
    route(HOME_PATH),
    route('#/todo', todo),
    { type: 'navigateRequested', path: '#/todo' },
    { type: 'configLoaded', config },
  ])('ignores $type', (event) => {
    const s = state('fatalError');
    const t = transition(s, event);
    expect(t.state).toBe(s);
    expect(nonLog(t.commands)).toEqual([]);
    expect(logs(t.commands)).toHaveLength(1);
  });
});

describe('routing is the same from every state (booting with config + every routed state)', () => {
  const sources: StateName[] = ['booting', ...routeStates];

  describe.each(sources)('from %s', (name) => {
    it('routeChanged("#/") → home / header.setActive(null) + outlet.showHome', () => {
      const t = transition(state(name), route(HOME_PATH));
      expect(t.state).toMatchObject({ name: 'home', entry: null, path: HOME_PATH, config });
      expect(t.commands).toEqual([
        { type: 'header.setActive', entry: null },
        { type: 'outlet.showHome', apps: config.apps },
      ]);
    });

    it('routeChanged(unknown) → notFound / header.setActive(null) + outlet.showNotFound', () => {
      const t = transition(state(name), route('#/elsewhere'));
      expect(t.state).toMatchObject({ name: 'notFound', entry: null, path: '#/elsewhere' });
      expect(t.commands).toEqual([
        { type: 'header.setActive', entry: null },
        { type: 'outlet.showNotFound', path: '#/elsewhere' },
      ]);
    });

    it.each([todo, weather])('routeChanged($name) → loadingApp with a new activation id (same or other app)', (target) => {
      const t = transition(state(name, { activationId: 7 }), route(target.route, target));
      expect(t.state).toMatchObject({ name: 'loadingApp', entry: target, activationId: 8, path: target.route });
      expect(t.commands).toEqual([
        { type: 'header.setActive', entry: target },
        { type: 'outlet.showLoading', entry: target },
        { type: 'loader.load', entry: target, activationId: 8, retry: false },
      ]);
    });
  });

  it('is ignored in fatalError and in booting before configLoaded', () => {
    for (const s of [state('fatalError'), start().state]) {
      for (const event of [route(HOME_PATH), route('#/todo', todo), route('#/x')]) {
        const t = transition(s, event);
        expect(t.state).toBe(s);
        expect(nonLog(t.commands)).toEqual([]);
        expect(logs(t.commands)).toHaveLength(1);
      }
    }
  });
});

describe('loadingApp results', () => {
  it('appLoaded(current id) → appActive / outlet.mount', () => {
    const t = transition(state('loadingApp', { activationId: 2 }), { type: 'appLoaded', entry: todo, activationId: 2 });
    expect(t.state).toMatchObject({ name: 'appActive', entry: todo, activationId: 2 });
    expect(t.commands).toEqual([{ type: 'outlet.mount', entry: todo }]);
  });

  it('appFailed(current id) → appError / outlet.showError(route, retryable)', () => {
    const t = transition(state('loadingApp', { activationId: 3 }), {
      type: 'appFailed',
      entry: todo,
      activationId: 3,
      error: new Error('could not reach todo'),
    });
    expect(t.state).toMatchObject({ name: 'appError', entry: todo, activationId: 3 });
    expect(nonLog(t.commands)).toEqual([
      { type: 'outlet.showError', scope: 'route', message: 'Could not load todo: could not reach todo', retryable: true },
    ]);
  });

  it('ignores a stale appLoaded (older id) with a warning', () => {
    const s = state('loadingApp', { entry: weather, activationId: 2 });
    const t = transition(s, { type: 'appLoaded', entry: todo, activationId: 1 });
    expect(t.state).toBe(s);
    expect(nonLog(t.commands)).toEqual([]);
    expect(logs(t.commands)[0]).toMatchObject({ level: 'warn', message: 'stale load result ignored' });
  });

  it('ignores a stale appFailed (older id) with a warning', () => {
    const s = state('loadingApp', { entry: weather, activationId: 2 });
    const t = transition(s, { type: 'appFailed', entry: todo, activationId: 1, error: new Error('x') });
    expect(t.state).toBe(s);
    expect(nonLog(t.commands)).toEqual([]);
    expect(logs(t.commands)[0]?.level).toBe('warn');
  });

  it.each<StateName>(['home', 'notFound', 'appActive', 'appError'])(
    'ignores a late appLoaded/appFailed in %s, even with the latest id',
    (name) => {
      const s = state(name, { activationId: 5 });
      for (const event of [
        { type: 'appLoaded', entry: todo, activationId: 5 },
        { type: 'appFailed', entry: todo, activationId: 5, error: new Error('x') },
      ] as HostEvent[]) {
        const t = transition(s, event);
        expect(t.state).toBe(s);
        expect(nonLog(t.commands)).toEqual([]);
        expect(logs(t.commands)[0]?.level).toBe('warn');
      }
    },
  );

  it('fast navigation: A loading → B loading → A result is stale, B result mounts', () => {
    let s = booted();
    s = transition(s, route('#/todo', todo)).state; // id 2
    const todoId = s.activationId;
    s = transition(s, route('#/weather', weather)).state; // id 3
    expect(s.activationId).toBe(todoId + 1);
    const late = transition(s, { type: 'appLoaded', entry: todo, activationId: todoId });
    expect(late.state).toBe(s);
    expect(nonLog(late.commands)).toEqual([]);
    const ok = transition(s, { type: 'appLoaded', entry: weather, activationId: s.activationId });
    expect(ok.state.name).toBe('appActive');
    expect(ok.commands).toEqual([{ type: 'outlet.mount', entry: weather }]);
  });
});

describe('appError', () => {
  it('retryRequested(route) → loadingApp with new id / showLoading + loader.load(retry)', () => {
    const t = transition(state('appError', { entry: weather, activationId: 3 }), { type: 'retryRequested', scope: 'route' });
    expect(t.state).toMatchObject({ name: 'loadingApp', entry: weather, activationId: 4 });
    expect(t.commands).toEqual([
      { type: 'outlet.showLoading', entry: weather },
      { type: 'loader.load', entry: weather, activationId: 4, retry: true },
    ]);
  });

  it('ignores retryRequested(global)', () => {
    const s = state('appError');
    const t = transition(s, { type: 'retryRequested', scope: 'global' });
    expect(t.state).toBe(s);
    expect(nonLog(t.commands)).toEqual([]);
  });
});

describe('retryRequested outside of error states', () => {
  it.each<StateName>(['home', 'notFound', 'loadingApp', 'appActive'])('is ignored in %s', (name) => {
    for (const scope of ['global', 'route'] as const) {
      const s = state(name);
      const t = transition(s, { type: 'retryRequested', scope });
      expect(t.state).toBe(s);
      expect(nonLog(t.commands)).toEqual([]);
      expect(logs(t.commands)).toHaveLength(1);
    }
  });
});

describe('navigateRequested', () => {
  describe.each<StateName>([...routeStates, 'booting'])('in %s', (name) => {
    it.each([HOME_PATH, '#/todo', '#/weather'])('accepts %s → router.navigate, state unchanged', (path) => {
      const s = state(name);
      const t = transition(s, { type: 'navigateRequested', path });
      expect(t.state).toBe(s);
      expect(t.commands).toEqual([{ type: 'router.navigate', path }]);
    });

    it.each(['#/unknown', 'https://evil.example/', '', '#/todo/extra'])('rejects %j with a warning, state unchanged', (path) => {
      const s = state(name);
      const t = transition(s, { type: 'navigateRequested', path });
      expect(t.state).toBe(s);
      expect(t.commands).toEqual([
        { type: 'log', level: 'warn', message: 'navigate request rejected: unknown path', fields: { path } },
      ]);
    });
  });

  it('is ignored before the config is loaded', () => {
    const s = start().state;
    const t = transition(s, { type: 'navigateRequested', path: '#/todo' });
    expect(t.state).toBe(s);
    expect(nonLog(t.commands)).toEqual([]);
  });
});

describe('activation id', () => {
  it('increments on every entry into loadingApp', () => {
    let s = booted();
    s = { ...s, activationId: 0 };
    const ids: number[] = [];
    const step = (event: HostEvent) => {
      s = transition(s, event).state;
      if (s.name === 'loadingApp') ids.push(s.activationId);
    };
    step(route('#/todo', todo)); // 1
    step({ type: 'appFailed', entry: todo, activationId: 1, error: new Error('down') });
    step({ type: 'retryRequested', scope: 'route' }); // 2
    step({ type: 'appLoaded', entry: todo, activationId: 2 });
    step(route('#/weather', weather)); // 3
    step(route('#/todo', todo)); // 4 (loadingApp → loadingApp, other app)
    step(route(HOME_PATH));
    step(route('#/weather', weather)); // 5
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('never throws', () => {
  const events: HostEvent[] = [
    { type: 'configLoaded', config },
    { type: 'configFailed', error: new Error('x') },
    route(HOME_PATH),
    route('#/x'),
    route('#/todo', todo),
    { type: 'navigateRequested', path: '#/todo' },
    { type: 'appLoaded', entry: todo, activationId: 1 },
    { type: 'appFailed', entry: todo, activationId: 1, error: new Error('x') },
    { type: 'retryRequested', scope: 'global' },
    { type: 'retryRequested', scope: 'route' },
  ];
  const states: HostState[] = [start().state, booted(), state('fatalError'), ...routeStates.map((n) => state(n))];
  it('for every (state, event) pair', () => {
    for (const s of states) for (const e of events) expect(() => transition(s, e)).not.toThrow();
  });
});

describe('unknown event types', () => {
  it('are ignored with a warning, state unchanged', () => {
    const s = state('home');
    const t = transition(s, { type: 'somethingNew' } as unknown as HostEvent);
    expect(t.state).toBe(s);
    expect(t.commands).toEqual([
      { type: 'log', level: 'warn', message: 'event ignored in current state', fields: { event: 'somethingNew', state: 'home' } },
    ]);
  });
});
