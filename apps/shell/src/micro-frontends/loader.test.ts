import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEntry } from '@mf/contracts';
import { ModuleLoader, withRetryQuery } from './loader.ts';
import type { HostEvent } from '../app/mediator/types.ts';

let seq = 0;
/** Each test gets fresh tags because the custom element registry is global and permanent. */
function entry(): AppEntry {
  seq += 1;
  return { route: `#/l${seq}`, url: `http://remote/l${seq}.js`, tag: `loader-test-${seq}` };
}

function define(tag: string): void {
  customElements.define(tag, class extends HTMLElement {});
}

function setup(importer: (url: string) => Promise<unknown>, timeoutMs = 10_000) {
  const events: HostEvent[] = [];
  const loader = new ModuleLoader((e) => events.push(e), { importer, timeoutMs });
  return { events, loader };
}

describe('ModuleLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('given the module defines the tag, when load(), then it imports the url and reports appLoaded [TR-21]', async () => {
    const e = entry();
    const importer = vi.fn(async () => define(e.tag));
    const { events, loader } = setup(importer);
    await loader.load('a', e, 1, false);
    expect(importer).toHaveBeenCalledWith(e.url);
    expect(events).toEqual([{ type: 'appLoaded', appId: 'a', activationId: 1 }]);
  });

  it('given the tag is already defined, when load(), then it skips the import [TR-20]', async () => {
    const e = entry();
    define(e.tag);
    const importer = vi.fn(async () => undefined);
    const { events, loader } = setup(importer);
    await loader.load('a', e, 2, false);
    expect(importer).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: 'appLoaded', appId: 'a', activationId: 2 }]);
  });

  it('given the remote is down, when load(), then it reports appFailed "could not reach <id>" with the import error as cause [TR-22]', async () => {
    const e = entry();
    const { events, loader } = setup(async () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });
    await loader.load('weather', e, 3, false);
    expect(events).toEqual([{
      type: 'appFailed', appId: 'weather', activationId: 3,
      message: 'could not reach weather', cause: 'Failed to fetch dynamically imported module',
    }]);
  });

  it('given the remote is down, when load() reports appFailed, then no timer is left behind [TR-22]', async () => {
    const { loader } = setup(async () => {
      throw new TypeError('down');
    });
    await loader.load('weather', entry(), 3, false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('given the remote is slow, when the load timeout passes, then it reports appFailed "timed out waiting for <tag>" [TR-23]', async () => {
    const e = entry();
    const { events, loader } = setup(() => new Promise(() => {}), 5_000);
    const done = loader.load('slow', e, 4, false);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(events).toEqual([
      { type: 'appFailed', appId: 'slow', activationId: 4, message: `timed out waiting for ${e.tag}` },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('given the module defines a different tag, when the load timeout passes, then it reports appFailed [TR-24]', async () => {
    const e = entry();
    const { events, loader } = setup(async () => define(`${e.tag}-wrong`));
    const done = loader.load('wrong', e, 5, false);
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(events).toEqual([
      { type: 'appFailed', appId: 'wrong', activationId: 5, message: `timed out waiting for ${e.tag}` },
    ]);
  });

  it('given a load succeeded, then no timeout fires later [TR-21]', async () => {
    const e = entry();
    const { events, loader } = setup(async () => define(e.tag));
    await loader.load('a', e, 1, false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('given a failed load, when retried, then it re-imports with an increasing ?retry=<n> cache-buster [TR-25]', async () => {
    const e = entry();
    const urls: string[] = [];
    const { events, loader } = setup(async (url) => {
      urls.push(url);
      if (urls.length < 3) throw new Error('down');
      define(e.tag);
    });
    await loader.load('a', e, 1, false);
    await loader.load('a', e, 2, true);
    await loader.load('a', e, 3, true);
    expect(urls).toEqual([e.url, `${e.url}?retry=1`, `${e.url}?retry=2`]);
    expect(events.map((ev) => ev.type)).toEqual(['appFailed', 'appFailed', 'appLoaded']);
  });
});

describe('withRetryQuery', () => {
  it.each([
    ['./remotes/todo/todo-app.js', 1, './remotes/todo/todo-app.js?retry=1'],
    ['http://localhost:5175/src/web-component.ts?v=abc', 2, 'http://localhost:5175/src/web-component.ts?v=abc&retry=2'],
    ['http://x/a.js#frag', 3, 'http://x/a.js?retry=3#frag'],
    ['http://x/a.js?', 1, 'http://x/a.js?retry=1'],
    ['https://x.test/repo/remotes/todo/todo-app.js', 1, 'https://x.test/repo/remotes/todo/todo-app.js?retry=1'],
  ])('given %s and attempt %i, then it returns %s [TR-25]', (url, n, expected) => {
    expect(withRetryQuery(url, n)).toBe(expected);
  });
});
