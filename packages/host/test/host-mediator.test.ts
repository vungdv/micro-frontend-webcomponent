import { describe, expect, it, vi } from 'vitest';
import { HostMediator, type Colleagues } from '../src/host-mediator';
import type { Logger } from '../src/logger';
import type { AppEntry, HostConfig, HostEvent } from '../src/types';

const todo: AppEntry = { name: 'todo', route: '#/todo', url: 'http://x/todo.js', tag: 'todo-app' };
const weather: AppEntry = { name: 'weather', route: '#/weather', url: 'http://x/w.js', tag: 'weather-dashboard' };
const config: HostConfig = { apps: [todo, weather] };

/** Fake colleagues that record every command call, in order, into one journal. */
function fakes() {
  const calls: string[] = [];
  const rec =
    (name: string, impl?: (...args: never[]) => void) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.map((a) => (typeof a === 'object' && a && 'name' in a ? (a as AppEntry).name : JSON.stringify(a))).join(', ')})`);
      impl?.(...(args as never[]));
    };
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let mediator!: HostMediator;
  const colleagues: Colleagues = {
    config: { load: rec('config.load') },
    // Like the real Router: start() reports the initial hash synchronously.
    router: {
      start: rec('router.start', () => mediator.notify({ type: 'routeChanged', path: '#/', entry: null })),
      navigate: rec('router.navigate'),
    },
    loader: { load: rec('loader.load') },
    outlet: {
      showHome: rec('outlet.showHome'),
      showLoading: rec('outlet.showLoading'),
      showError: rec('outlet.showError'),
      showNotFound: rec('outlet.showNotFound'),
      mount: rec('outlet.mount'),
    },
    header: { render: rec('header.render'), setActive: rec('header.setActive') },
  };
  mediator = new HostMediator(colleagues, log);
  return { mediator, calls, log, colleagues };
}

describe('HostMediator', () => {
  it('boot sequence: config.load → header.render → router.start → setActive(null) → showHome', () => {
    const { mediator, calls } = fakes();
    mediator.start();
    mediator.notify({ type: 'configLoaded', config });
    expect(calls).toEqual([
      'config.load()',
      'header.render([{"name":"todo","route":"#/todo","url":"http://x/todo.js","tag":"todo-app"},{"name":"weather","route":"#/weather","url":"http://x/w.js","tag":"weather-dashboard"}])',
      'router.start([{"name":"todo","route":"#/todo","url":"http://x/todo.js","tag":"todo-app"},{"name":"weather","route":"#/weather","url":"http://x/w.js","tag":"weather-dashboard"}])',
      'header.setActive(null)',
      'outlet.showHome([{"name":"todo","route":"#/todo","url":"http://x/todo.js","tag":"todo-app"},{"name":"weather","route":"#/weather","url":"http://x/w.js","tag":"weather-dashboard"}])',
    ]);
    expect(mediator.current?.name).toBe('home');
  });

  it('open an app, switch apps, fail, retry: commands in the documented order', () => {
    const { mediator, calls } = fakes();
    mediator.start();
    mediator.notify({ type: 'configLoaded', config });
    calls.length = 0;

    mediator.notify({ type: 'routeChanged', path: '#/todo', entry: todo });
    mediator.notify({ type: 'appLoaded', entry: todo, activationId: 1 });
    mediator.notify({ type: 'routeChanged', path: '#/weather', entry: weather });
    mediator.notify({ type: 'appFailed', entry: weather, activationId: 2, error: new Error('down') });
    mediator.notify({ type: 'retryRequested', scope: 'route' });

    expect(calls).toEqual([
      'header.setActive(todo)',
      'outlet.showLoading(todo)',
      'loader.load(todo, 1, false)',
      'outlet.mount(todo)',
      'header.setActive(weather)',
      'outlet.showLoading(weather)',
      'loader.load(weather, 2, false)',
      'outlet.showError("route", "Could not load weather: down", true)',
      'outlet.showLoading(weather)',
      'loader.load(weather, 3, true)',
    ]);
    expect(mediator.current).toMatchObject({ name: 'loadingApp', activationId: 3 });
  });

  it('config failure → global error; global retry reloads config', () => {
    const { mediator, calls } = fakes();
    mediator.start();
    mediator.notify({ type: 'configFailed', error: new Error('HTTP 500') });
    mediator.notify({ type: 'retryRequested', scope: 'global' });
    expect(calls).toEqual([
      'config.load()',
      'outlet.showError("global", "Could not load the host configuration: HTTP 500", true)',
      'config.load()',
    ]);
  });

  it('navigateRequested to a declared route calls router.navigate; unknown is only logged', () => {
    const { mediator, calls, log } = fakes();
    mediator.start();
    mediator.notify({ type: 'configLoaded', config });
    calls.length = 0;
    mediator.notify({ type: 'navigateRequested', path: '#/weather' });
    mediator.notify({ type: 'navigateRequested', path: '#/evil' });
    expect(calls).toEqual(['router.navigate("#/weather")']);
    expect(log.warn).toHaveBeenCalledWith('navigate request rejected: unknown path', { path: '#/evil' });
    expect(mediator.current?.name).toBe('home');
  });

  it('stale results are ignored and logged as warnings', () => {
    const { mediator, calls, log } = fakes();
    mediator.start();
    mediator.notify({ type: 'configLoaded', config });
    mediator.notify({ type: 'routeChanged', path: '#/todo', entry: todo });
    mediator.notify({ type: 'routeChanged', path: '#/weather', entry: weather });
    calls.length = 0;
    mediator.notify({ type: 'appLoaded', entry: todo, activationId: 1 });
    expect(calls).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith('stale load result ignored', expect.objectContaining({ activationId: 1 }));
  });

  it('ignores notifications before start', () => {
    const { mediator, calls, log } = fakes();
    mediator.notify({ type: 'configLoaded', config });
    expect(calls).toEqual([]);
    expect(log.warn).toHaveBeenCalled();
  });

  it('a throwing colleague is logged and does not stop later commands', () => {
    const { mediator, calls, log, colleagues } = fakes();
    mediator.start();
    mediator.notify({ type: 'configLoaded', config });
    calls.length = 0;
    colleagues.outlet.showLoading = () => {
      throw new Error('boom');
    };
    mediator.notify({ type: 'routeChanged', path: '#/todo', entry: todo });
    expect(log.error).toHaveBeenCalledWith('command failed', expect.objectContaining({ command: 'outlet.showLoading' }));
    expect(calls).toEqual(['header.setActive(todo)', 'loader.load(todo, 1, false)']);
  });

  it('an event that throws during processing is logged and does not leave the queue stuck', () => {
    const { mediator, calls, log } = fakes();
    mediator.start();
    mediator.notify({ type: 'configLoaded', config });
    mediator.notify({ type: 'routeChanged', path: '#/todo', entry: todo });
    calls.length = 0;
    // Malformed notification: transition reads event.entry.name and throws.
    mediator.notify({ type: 'appLoaded', activationId: 99 } as unknown as HostEvent);
    expect(log.error).toHaveBeenCalledWith('event processing failed', expect.objectContaining({ event: 'appLoaded' }));
    // The mediator keeps working afterwards.
    mediator.notify({ type: 'appLoaded', entry: todo, activationId: 1 });
    expect(calls).toEqual(['outlet.mount(todo)']);
    expect(mediator.current?.name).toBe('appActive');
  });

  it('a throwing event queued behind another one does not drop the events after it', () => {
    const { mediator, calls, colleagues } = fakes();
    mediator.start();
    // router.start synchronously queues routeChanged("#/"); queue a malformed event and a valid one behind it.
    const originalStart = colleagues.router.start;
    colleagues.router.start = (apps) => {
      originalStart(apps);
      mediator.notify({ type: 'appFailed', activationId: 99 } as unknown as HostEvent);
      mediator.notify({ type: 'navigateRequested', path: '#/weather' });
    };
    mediator.notify({ type: 'configLoaded', config });
    expect(calls.slice(-3)).toEqual(['header.setActive(null)', expect.stringMatching(/^outlet\.showHome/), 'router.navigate("#/weather")']);
  });
});
