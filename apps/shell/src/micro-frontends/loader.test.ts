import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEntry } from '@mf/contracts';
import { defineApp, ModuleLoader, RetryCounter, withRetryQuery } from './loader.ts';
import type { ElementRegistry } from './loader.ts';
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

describe('RetryCounter', () => {
  it('given a url, when next() is called repeatedly, then it returns 1, 2, 3 for that url and starts at 1 for another [HD-06]', () => {
    const retries = new RetryCounter();
    expect([retries.next('http://a/a.js'), retries.next('http://a/a.js'), retries.next('http://b/b.js'), retries.next('http://a/a.js')])
      .toEqual([1, 2, 1, 3]);
  });

  it('given a counter shared with a ModuleLoader, when another caller retries the same url after the loader, then the attempt numbers do not repeat [HD-06]', async () => {
    vi.useFakeTimers();
    const e = entry();
    const urls: string[] = [];
    const retries = new RetryCounter();
    const loader = new ModuleLoader(() => {}, {
      importer: async (url) => {
        urls.push(url);
        throw new Error('down');
      },
      retries,
    });
    await loader.load('a', e, 1, true);
    expect(retries.next(e.url)).toBe(2);
    expect(urls).toEqual([`${e.url}?retry=1`]);
    vi.useRealTimers();
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

/** A fake registry: `defined` tags resolve whenDefined immediately; others never resolve. */
function fakeRegistry(defined: string[] = []): ElementRegistry {
  const known = new Set(defined);
  return {
    get: (tag: string) => (known.has(tag) ? class extends HTMLElement {} : undefined),
    whenDefined: (tag: string) =>
      known.has(tag) ? Promise.resolve(class extends HTMLElement {}) : new Promise(() => {}),
  } as ElementRegistry;
}

describe('defineApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('given an already-defined tag, when defineApp runs, then it resolves { ok: true } without importing [HD-01]', async () => {
    const e = entry();
    const importer = vi.fn(async () => undefined);
    const result = await defineApp('a', e, { importer, registry: fakeRegistry([e.tag]) });
    expect(result).toEqual({ ok: true });
    expect(importer).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('given an importer that rejects, when defineApp runs, then it resolves { ok: false, "could not reach <id>", cause } [HD-02]', async () => {
    const e = entry();
    const importer = vi.fn(async () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });
    const result = await defineApp('weather', e, { importer, registry: fakeRegistry() });
    expect(result).toEqual({
      ok: false, message: 'could not reach weather', cause: 'Failed to fetch dynamically imported module',
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('given a module that never defines the tag, when the fake timer passes timeoutMs, then it resolves { ok: false, "timed out waiting for <tag>" } [HD-03]', async () => {
    const e = entry();
    let settled = false;
    const done = defineApp('slow', e, {
      importer: async () => undefined, registry: fakeRegistry(), timeoutMs: 3_000,
    }).then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await done).toEqual({ ok: false, message: `timed out waiting for ${e.tag}` });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('given attempt: 2, when defineApp runs, then the imported URL carries retry=2 [HD-04]', async () => {
    const e = entry();
    const registry = fakeRegistry();
    const importer = vi.fn(async () => undefined);
    const done = defineApp('a', e, { importer, registry, timeoutMs: 1_000, attempt: 2 });
    await vi.advanceTimersByTimeAsync(1_000);
    await done;
    expect(importer).toHaveBeenCalledWith(`${e.url}?retry=2`);
  });
});
