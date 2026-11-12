import { describe, expect, it } from 'vitest';
import type { HostConfig } from '@mf/contracts';
import { Router, type RouterWindow } from './router.ts';
import type { HostEvent } from '../mediator/types.ts';

const apps: HostConfig['apps'] = {
  todo: { route: '#/todo', url: 'http://t/todo.js', tag: 'todo-app' },
  weather: { route: '#/weather', url: 'http://w/weather.js', tag: 'weather-dashboard' },
};

/** Fakes only the location edge; events go through a real EventTarget. */
function fakeWindow(hash = ''): RouterWindow & EventTarget {
  const target = new EventTarget() as RouterWindow & EventTarget;
  (target as { location: { hash: string } }).location = { hash };
  return target;
}

function setup(hash = '') {
  const win = fakeWindow(hash);
  const events: HostEvent[] = [];
  const router = new Router((e) => events.push(e), win);
  return { win, events, router };
}

describe('Router', () => {
  it.each(['', '#', '#/'])(
    'given the hash is %j, when start(), then it reports the home route [TR-40]',
    (hash) => {
      const { events, router } = setup(hash);
      router.start(apps);
      expect(events).toEqual([{ type: 'routeChanged', hash: '#/', appId: null }]);
    },
  );

  it('given the page opens on #/weather, when start(), then it reports the weather app first [TR-40]', () => {
    const { events, router } = setup('#/weather');
    router.start(apps);
    expect(events).toEqual([{ type: 'routeChanged', hash: '#/weather', appId: 'weather' }]);
  });

  it('given the router started, when the hash changes to a declared route, then it reports that app [TR-41]', () => {
    const { win, events, router } = setup();
    router.start(apps);
    win.location.hash = '#/todo';
    win.dispatchEvent(new Event('hashchange'));
    expect(events.at(-1)).toEqual({ type: 'routeChanged', hash: '#/todo', appId: 'todo' });
  });

  it('given the router started, when the hash changes to an unknown route, then it reports it with no app [TR-42]', () => {
    const { win, events, router } = setup();
    router.start(apps);
    win.location.hash = '#/nope';
    win.dispatchEvent(new Event('hashchange'));
    expect(events.at(-1)).toEqual({ type: 'routeChanged', hash: '#/nope', appId: null });
  });

  it('given the router is not started, when the hash changes, then nothing is reported [TR-41]', () => {
    const { win, events } = setup();
    win.dispatchEvent(new Event('hashchange'));
    expect(events).toEqual([]);
  });

  it('given start() is called twice, when the hash changes, then the route is reported once [TR-41]', () => {
    const { win, events, router } = setup();
    router.start(apps);
    router.start(apps);
    events.length = 0;
    win.location.hash = '#/todo';
    win.dispatchEvent(new Event('hashchange'));
    expect(events).toHaveLength(1);
  });

  it('given the router stopped, when the hash changes, then nothing is reported [TR-41]', () => {
    const { win, events, router } = setup();
    router.start(apps);
    router.stop();
    events.length = 0;
    win.dispatchEvent(new Event('hashchange'));
    expect(events).toEqual([]);
  });

  it('given a navigate command, then it sets location.hash [TR-43]', () => {
    const { win, router } = setup();
    router.start(apps);
    router.navigate('#/weather');
    expect(win.location.hash).toBe('#/weather');
  });
});
