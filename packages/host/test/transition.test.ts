import { beforeEach, describe, expect, it } from 'vitest';
import { HOME_PATH, start, transition } from '../src/transition';
import type { HostEvent, HostState, StateName, Transition } from '../src/types';
import { aConfig, anApp, aState, effects, logs, on, ROUTED_STATES } from './support/builders';

const todo = anApp('todo');
const weather = anApp('weather');
const config = aConfig(todo, weather);

/** booting with the config loaded, plus every routed state: where routing applies. */
const CONFIGURED_STATES: StateName[] = ['booting', ...ROUTED_STATES];

/** Then: the state is the same object, no colleague is asked to act, and one warning says why. */
function expectIgnored(t: Transition, before: HostState, message = 'event ignored in current state'): void {
  expect(t.state).toBe(before);
  expect(effects(t.commands)).toEqual([]);
  expect(logs(t.commands)).toEqual([expect.objectContaining({ level: 'warn', message })]);
}

describe('Given the host has not started', () => {
  describe('when start() is called', () => {
    let t: Transition;
    beforeEach(() => {
      t = start();
    });

    it('then the state is booting with no config and activation id 0 [BT-01]', () => {
      expect(t.state).toEqual({ name: 'booting', config: null, activationId: 0, entry: null, path: null });
    });

    it('then the only command is config.load [BT-01]', () => {
      expect(t.commands).toEqual([{ type: 'config.load' }]);
    });
  });
});

describe('Given booting without a config', () => {
  let initial: HostState;
  beforeEach(() => {
    initial = start().state;
  });

  describe('when configLoaded arrives', () => {
    let t: Transition;
    beforeEach(() => {
      t = transition(initial, on.configLoaded(config));
    });

    it('then the config is stored and the state stays booting [BT-02]', () => {
      expect(t.state).toEqual({ ...initial, config });
    });

    it('then header.render runs before router.start, with nothing logged [BT-02]', () => {
      expect(t.commands).toEqual([
        { type: 'header.render', apps: config.apps },
        { type: 'router.start', apps: config.apps },
      ]);
    });
  });

  describe('when configFailed("HTTP 404") arrives', () => {
    let t: Transition;
    beforeEach(() => {
      t = transition(initial, on.configFailed('HTTP 404'));
    });

    it('then the state is fatalError [BT-03]', () => {
      expect(t.state.name).toBe('fatalError');
    });

    it('then a global retryable error panel names the cause [BT-03]', () => {
      expect(effects(t.commands)).toEqual([
        {
          type: 'outlet.showError',
          scope: 'global',
          message: 'Could not load the host configuration: HTTP 404',
          retryable: true,
        },
      ]);
    });

    it('then the error is logged [BT-03]', () => {
      expect(logs(t.commands)).toEqual([
        { type: 'log', level: 'error', message: 'config failed', fields: { error: 'HTTP 404' } },
      ]);
    });
  });
});

describe('Given fatalError', () => {
  let s: HostState;
  beforeEach(() => {
    s = aState('fatalError');
  });

  describe('when the global Retry is requested', () => {
    let t: Transition;
    beforeEach(() => {
      t = transition(s, on.retryRequested('global'));
    });

    it('then the state is booting with the config cleared [BT-04]', () => {
      expect(t.state).toMatchObject({ name: 'booting', config: null });
    });

    it('then the only command is config.load [BT-04]', () => {
      expect(t.commands).toEqual([{ type: 'config.load' }]);
    });

    it('then a following configLoaded proceeds as on first boot [BT-04, BT-02]', () => {
      const next = transition(t.state, on.configLoaded(config));
      expect(next.commands.map((c) => c.type)).toEqual(['header.render', 'router.start']);
    });
  });
});

describe.each<[string, () => HostState]>([
  ['booting with the config already loaded', () => aState('booting')],
  ['fatalError', () => aState('fatalError')],
  ...ROUTED_STATES.map((name): [string, () => HostState] => [name, () => aState(name)]),
])('Given %s', (_label, given) => {
  let s: HostState;
  beforeEach(() => {
    s = given();
  });

  it.each<[string, HostEvent]>([
    ['a second configLoaded', on.configLoaded(config)],
    ['a configFailed', on.configFailed('x')],
  ])('when %s arrives, then it is ignored with a warning [BT-05]', (_event, event) => {
    expectIgnored(transition(s, event), s);
  });
});

describe.each(CONFIGURED_STATES)('Given %s with the config loaded and activation id 7', (name) => {
  let s: HostState;
  beforeEach(() => {
    s = aState(name, { activationId: 7 });
  });

  describe('when routeChanged("#/") arrives', () => {
    let t: Transition;
    beforeEach(() => {
      t = transition(s, on.routeChanged(HOME_PATH));
    });

    it('then the state is home with no entry and the config kept [TR-01]', () => {
      expect(t.state).toMatchObject({ name: 'home', entry: null, path: HOME_PATH, config });
    });

    it('then the header is cleared and the home view is shown [TR-01]', () => {
      expect(t.commands).toEqual([
        { type: 'header.setActive', entry: null },
        { type: 'outlet.showHome', apps: config.apps },
      ]);
    });
  });

  describe('when routeChanged("#/nope", null) arrives', () => {
    let t: Transition;
    beforeEach(() => {
      t = transition(s, on.routeChanged('#/nope'));
    });

    it('then the state is notFound with that path [TR-02]', () => {
      expect(t.state).toMatchObject({ name: 'notFound', entry: null, path: '#/nope' });
    });

    it('then the header is cleared and the not-found view names the path [TR-02]', () => {
      expect(t.commands).toEqual([
        { type: 'header.setActive', entry: null },
        { type: 'outlet.showNotFound', path: '#/nope' },
      ]);
    });
  });

  describe.each([todo, weather])('when routeChanged to $name arrives (same or other app)', (target) => {
    let t: Transition;
    beforeEach(() => {
      t = transition(s, on.routeChanged(target.route, target));
    });

    it('then the state is loadingApp with activation id 8 [TR-03]', () => {
      expect(t.state).toMatchObject({ name: 'loadingApp', entry: target, activationId: 8, path: target.route });
    });

    it('then the header is set, loading is shown and loader.load(retry=false) runs [TR-03]', () => {
      expect(t.commands).toEqual([
        { type: 'header.setActive', entry: target },
        { type: 'outlet.showLoading', entry: target },
        { type: 'loader.load', entry: target, activationId: 8, retry: false },
      ]);
    });
  });
});

describe.each<[string, () => HostState]>([
  ['fatalError', () => aState('fatalError')],
  ['booting without a config', () => start().state],
])('Given %s', (_label, given) => {
  let s: HostState;
  beforeEach(() => {
    s = given();
  });

  it.each<[string, HostEvent]>([
    ['"#/"', on.routeChanged(HOME_PATH)],
    ['"#/todo"', on.routeChanged(todo.route, todo)],
    ['an unknown path', on.routeChanged('#/x')],
  ])('when routeChanged to %s arrives, then it is ignored with a warning [TR-04]', (_path, event) => {
    expectIgnored(transition(s, event), s);
  });

  it('when navigateRequested("#/todo") arrives, then it is ignored with a warning [NV-03]', () => {
    expectIgnored(transition(s, on.navigateRequested(todo.route)), s);
  });
});

describe('Given loadingApp(todo) with activation id 2', () => {
  let s: HostState;
  beforeEach(() => {
    s = aState('loadingApp', { activationId: 2 });
  });

  describe('when appLoaded(2) arrives', () => {
    let t: Transition;
    beforeEach(() => {
      t = transition(s, on.appLoaded(todo, 2));
    });

    it('then the state is appActive for the same activation [TR-05]', () => {
      expect(t.state).toMatchObject({ name: 'appActive', entry: todo, activationId: 2 });
    });

    it('then the only command is outlet.mount(todo) [TR-05]', () => {
      expect(t.commands).toEqual([{ type: 'outlet.mount', entry: todo }]);
    });
  });

  describe('when appFailed(2, "could not reach todo") arrives', () => {
    let t: Transition;
    beforeEach(() => {
      t = transition(s, on.appFailed(todo, 2, 'could not reach todo'));
    });

    it('then the state is appError for the same activation [TR-06]', () => {
      expect(t.state).toMatchObject({ name: 'appError', entry: todo, activationId: 2 });
    });

    it('then a route retryable error panel names the app and the cause [TR-06]', () => {
      expect(effects(t.commands)).toEqual([
        { type: 'outlet.showError', scope: 'route', message: 'Could not load todo: could not reach todo', retryable: true },
      ]);
    });

    it('then the error is logged with the app and activation id [TR-06]', () => {
      expect(logs(t.commands)).toEqual([
        {
          type: 'log',
          level: 'error',
          message: 'app failed',
          fields: { app: 'todo', activationId: 2, error: 'could not reach todo' },
        },
      ]);
    });
  });
});

describe('Given appError(weather) with activation id 3', () => {
  let s: HostState;
  beforeEach(() => {
    s = aState('appError', { entry: weather, path: weather.route, activationId: 3 });
  });

  describe('when the route Retry is requested', () => {
    let t: Transition;
    beforeEach(() => {
      t = transition(s, on.retryRequested('route'));
    });

    it('then the state is loadingApp(weather) with activation id 4 [TR-07]', () => {
      expect(t.state).toMatchObject({ name: 'loadingApp', entry: weather, activationId: 4 });
    });

    it('then loading is shown and loader.load(retry=true) runs, without updating the header [TR-07]', () => {
      expect(t.commands).toEqual([
        { type: 'outlet.showLoading', entry: weather },
        { type: 'loader.load', entry: weather, activationId: 4, retry: true },
      ]);
    });
  });

  it('when the global Retry is requested, then it is ignored with a warning [TR-08]', () => {
    expectIgnored(transition(s, on.retryRequested('global')), s);
  });
});

describe.each<StateName>(['booting', 'home', 'notFound', 'loadingApp', 'appActive'])('Given %s', (name) => {
  let s: HostState;
  beforeEach(() => {
    s = aState(name);
  });

  it.each(['global', 'route'] as const)('when a %s Retry is requested, then it is ignored with a warning [TR-08]', (scope) => {
    expectIgnored(transition(s, on.retryRequested(scope)), s);
  });
});

it('given fatalError, when a route Retry is requested, then it is ignored with a warning [TR-08]', () => {
  const s = aState('fatalError');
  expectIgnored(transition(s, on.retryRequested('route')), s);
});

it('given appError without an entry, when a route Retry is requested, then it is ignored with a warning [TR-08]', () => {
  const s = aState('appError', { entry: null });
  expectIgnored(transition(s, on.retryRequested('route')), s);
});

describe('Given loadingApp(weather) with activation id 2', () => {
  let s: HostState;
  beforeEach(() => {
    s = aState('loadingApp', { entry: weather, path: weather.route, activationId: 2 });
  });

  it.each<[string, HostEvent]>([
    ['appLoaded(1)', on.appLoaded(todo, 1)],
    ['appFailed(1)', on.appFailed(todo, 1)],
  ])('when %s arrives, then the state is unchanged, a stale warning is logged and nothing is mounted [TR-09]', (_e, event) => {
    const t = transition(s, event);
    expectIgnored(t, s, 'stale load result ignored');
    expect(logs(t.commands)[0]?.fields).toEqual({
      event: event.type,
      app: 'todo',
      activationId: 1,
      currentActivationId: 2,
      state: 'loadingApp',
    });
  });
});

describe.each<StateName>(['home', 'notFound', 'appActive', 'appError'])('Given %s with activation id 5', (name) => {
  let s: HostState;
  beforeEach(() => {
    s = aState(name, { activationId: 5 });
  });

  it.each<[string, HostEvent]>([
    ['appLoaded(5)', on.appLoaded(todo, 5)],
    ['appFailed(5)', on.appFailed(todo, 5)],
  ])('when a late %s arrives, then it is ignored as stale even with the latest id [TR-09]', (_e, event) => {
    expectIgnored(transition(s, event), s, 'stale load result ignored');
  });
});

describe('Given todo is loading and the user then opens weather', () => {
  let s: HostState;
  let todoId: number;
  beforeEach(() => {
    s = transition(aState('booting'), on.routeChanged(todo.route, todo)).state;
    todoId = s.activationId;
    s = transition(s, on.routeChanged(weather.route, weather)).state;
  });

  it('when the todo result arrives, then it is stale and nothing is mounted [TR-09]', () => {
    expect(s.activationId).toBe(todoId + 1);
    expectIgnored(transition(s, on.appLoaded(todo, todoId)), s, 'stale load result ignored');
  });

  it('when the weather result arrives, then weather is mounted [TR-09, TR-05]', () => {
    const t = transition(s, on.appLoaded(weather, s.activationId));
    expect(t.state.name).toBe('appActive');
    expect(t.commands).toEqual([{ type: 'outlet.mount', entry: weather }]);
  });
});

it('given booting with config and activation id 0, when the user opens, fails, retries and switches apps, then every entry into loadingApp gets the next id [TR-03, TR-07]', () => {
  let s = aState('booting', { activationId: 0 });
  const ids: number[] = [];
  for (const event of [
    on.routeChanged(todo.route, todo), // 1
    on.appFailed(todo, 1, 'down'),
    on.retryRequested('route'), // 2
    on.appLoaded(todo, 2),
    on.routeChanged(weather.route, weather), // 3
    on.routeChanged(todo.route, todo), // 4: loadingApp → loadingApp, other app
    on.routeChanged(HOME_PATH),
    on.routeChanged(weather.route, weather), // 5
  ]) {
    s = transition(s, event).state;
    if (s.name === 'loadingApp') ids.push(s.activationId);
  }
  expect(ids).toEqual([1, 2, 3, 4, 5]);
});

describe('Given any state', () => {
  const states: HostState[] = [start().state, aState('booting'), aState('fatalError'), ...ROUTED_STATES.map((n) => aState(n))];
  const events: HostEvent[] = [
    on.configLoaded(config),
    on.configFailed('x'),
    on.routeChanged(HOME_PATH),
    on.routeChanged('#/x'),
    on.routeChanged(todo.route, todo),
    on.navigateRequested(todo.route),
    on.appLoaded(todo, 1),
    on.appFailed(todo, 1),
    on.retryRequested('global'),
    on.retryRequested('route'),
    { type: 'somethingNew' } as unknown as HostEvent,
  ];

  it.each(states.map((s) => [`${s.name}${s.config ? '' : ' (no config)'}`, s] as const))(
    'when any event arrives in %s, then transition never throws [TR-10]',
    (_label, s) => {
      for (const e of events) expect(() => transition(s, e)).not.toThrow();
    },
  );

  it('when an unknown event type arrives, then it is ignored with a warning naming it [TR-10]', () => {
    const s = aState('home');
    const t = transition(s, { type: 'somethingNew' } as unknown as HostEvent);
    expect(t.state).toBe(s);
    expect(t.commands).toEqual([
      { type: 'log', level: 'warn', message: 'event ignored in current state', fields: { event: 'somethingNew', state: 'home' } },
    ]);
  });
});

describe.each(CONFIGURED_STATES)('Given %s with the config loaded', (name) => {
  let s: HostState;
  beforeEach(() => {
    s = aState(name);
  });

  it.each([HOME_PATH, todo.route, weather.route])(
    'when navigateRequested(%j) arrives, then router.navigate(path) is the only command and the state is unchanged [NV-01]',
    (path) => {
      const t = transition(s, on.navigateRequested(path));
      expect(t.state).toBe(s);
      expect(t.commands).toEqual([{ type: 'router.navigate', path }]);
    },
  );

  it.each(['#/unknown', 'https://evil.example/', '', '#/todo/extra'])(
    'when navigateRequested(%j) arrives, then it is rejected with a warning and the state is unchanged [NV-02]',
    (path) => {
      const t = transition(s, on.navigateRequested(path));
      expect(t.state).toBe(s);
      expect(t.commands).toEqual([
        { type: 'log', level: 'warn', message: 'navigate request rejected: unknown path', fields: { path } },
      ]);
    },
  );
});
