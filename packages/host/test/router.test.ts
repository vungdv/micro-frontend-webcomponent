import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router, normalize } from '../src/router';
import type { AppEntry, HostEvent } from '../src/types';

const todo: AppEntry = { name: 'todo', route: '#/todo', url: 'http://x/todo.js', tag: 'todo-app' };
const weather: AppEntry = { name: 'weather', route: '#/weather', url: 'http://x/w.js', tag: 'weather-dashboard' };

function hashChanged(): Promise<void> {
  return new Promise((resolve) => window.addEventListener('hashchange', () => resolve(), { once: true }));
}

describe('Router', () => {
  let events: HostEvent[];
  let router: Router;

  beforeEach(() => {
    window.location.hash = '';
    events = [];
    router = new Router({ notify: (e) => events.push(e) });
  });
  afterEach(() => router.stop());

  it('reports the initial hash immediately on start (empty hash = home)', () => {
    router.start([todo, weather]);
    expect(events).toEqual([{ type: 'routeChanged', path: '#/', entry: null }]);
  });

  it('reports an initial app route with its entry', () => {
    window.location.hash = '#/weather';
    router.start([todo, weather]);
    expect(events).toEqual([{ type: 'routeChanged', path: '#/weather', entry: weather }]);
  });

  it('reports hashchange events', async () => {
    router.start([todo, weather]);
    const changed = hashChanged();
    window.location.hash = '#/todo';
    await changed;
    expect(events.at(-1)).toEqual({ type: 'routeChanged', path: '#/todo', entry: todo });
  });

  it('reports unknown routes with a null entry', async () => {
    router.start([todo, weather]);
    const changed = hashChanged();
    window.location.hash = '#/nope';
    await changed;
    expect(events.at(-1)).toEqual({ type: 'routeChanged', path: '#/nope', entry: null });
  });

  it('navigate(path) sets location.hash, which is then reported', async () => {
    router.start([todo, weather]);
    const changed = hashChanged();
    router.navigate('#/weather');
    expect(window.location.hash).toBe('#/weather');
    await changed;
    expect(events.at(-1)).toEqual({ type: 'routeChanged', path: '#/weather', entry: weather });
  });

  it('stops reporting after stop()', () => {
    const notify = vi.fn();
    const r = new Router({ notify });
    r.start([todo]);
    r.stop();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('normalizes empty hash variants to #/', () => {
    expect(normalize('')).toBe('#/');
    expect(normalize('#')).toBe('#/');
    expect(normalize('#/')).toBe('#/');
    expect(normalize('#/todo')).toBe('#/todo');
  });
});
