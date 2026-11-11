import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModuleLoader, type Importer } from '../src/module-loader';
import type { AppEntry, HostEvent } from '../src/types';

let seq = 0;
function entry(): AppEntry {
  seq += 1;
  return { name: `app${seq}`, route: `#/app${seq}`, url: `http://remote.example/app${seq}.js`, tag: `test-app-${seq}` };
}

function define(tag: string): void {
  customElements.define(tag, class extends HTMLElement {});
}

/** Starts one load and resolves with the notification it reports. */
function run(importer: Importer, e: AppEntry, id: number, { retry = false, timeoutMs = 1000 } = {}): Promise<HostEvent> {
  return new Promise((resolve) => {
    new ModuleLoader({ notify: resolve, importer, timeoutMs }).load(e, id, retry);
  });
}

afterEach(() => vi.useRealTimers());

describe('ModuleLoader', () => {
  it('skips import when the tag is already defined', async () => {
    const e = entry();
    define(e.tag);
    const importer = vi.fn(async () => ({}));
    const event = await run(importer, e, 4);
    expect(importer).not.toHaveBeenCalled();
    expect(event).toEqual({ type: 'appLoaded', entry: e, activationId: 4 });
  });

  it('imports the url, waits for the element, reports appLoaded with the activation id', async () => {
    const e = entry();
    const importer = vi.fn(async () => define(e.tag));
    const event = await run(importer, e, 2);
    expect(importer).toHaveBeenCalledWith(e.url);
    expect(event).toEqual({ type: 'appLoaded', entry: e, activationId: 2 });
  });

  it('reports appFailed when the import rejects', async () => {
    const e = entry();
    const event = await run(async () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')), e, 3);
    expect(event).toMatchObject({ type: 'appFailed', entry: e, activationId: 3 });
    expect(event.type === 'appFailed' && event.error.message).toMatch(/Failed to fetch/);
  });

  it('reports appFailed on timeout when the import hangs', async () => {
    vi.useFakeTimers();
    const e = entry();
    const pending = run(() => new Promise(() => {}), e, 5, { timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);
    const event = await pending;
    expect(event).toMatchObject({ type: 'appFailed', activationId: 5 });
    expect(event.type === 'appFailed' && event.error.message).toMatch(/timed out after 500 ms/);
  });

  it('reports appFailed on timeout when the module loads but never defines the tag', async () => {
    vi.useFakeTimers();
    const e = entry();
    const pending = run(async () => ({}), e, 6, { timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);
    const event = await pending;
    expect(event.type === 'appFailed' && event.error.message).toMatch(new RegExp(`<${e.tag}>`));
  });

  it('on retry, imports a cache-busted URL', async () => {
    const e = entry();
    const importer = vi.fn(async () => define(e.tag));
    const event = await run(importer, e, 7, { retry: true });
    expect(event.type).toBe('appLoaded');
    const url = new URL((importer.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin + url.pathname).toBe(e.url);
    expect(url.searchParams.get('mf-retry')).toBe('1');
  });

  it('busts the URL on a later attempt after a failure, even without retry', async () => {
    const e = entry();
    let up = false;
    const importer = vi.fn(async (url: string) => {
      if (!up) throw new TypeError('down');
      define(e.tag);
      return url;
    });
    const waiters: Array<(event: HostEvent) => void> = [];
    const loader = new ModuleLoader({ notify: (event) => waiters.shift()?.(event), importer, timeoutMs: 1000 });
    const loadOnce = (id: number) =>
      new Promise<HostEvent>((resolve) => {
        waiters.push(resolve);
        loader.load(e, id, false);
      });
    expect((await loadOnce(1)).type).toBe('appFailed');
    up = true;
    expect(await loadOnce(2)).toEqual({ type: 'appLoaded', entry: e, activationId: 2 });
    const urls = importer.mock.calls.map(([u]) => u);
    expect(urls[0]).toBe(e.url);
    expect(new URL(urls[1]!).searchParams.get('mf-retry')).toBe('1');
  });

  it('a throwing notify(appLoaded) never also reports appFailed for the same id', async () => {
    const e = entry();
    const notify = vi.fn((event: HostEvent) => {
      if (event.type === 'appLoaded') throw new Error('listener blew up');
    });
    const loader = new ModuleLoader({ notify, importer: async () => define(e.tag), timeoutMs: 1000 });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      loader.load(e, 9, false);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      process.off('unhandledRejection', unhandled);
    }
    expect(notify.mock.calls.map(([ev]) => ev.type)).toEqual(['appLoaded']);
  });
});
