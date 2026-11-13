import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MF_NAVIGATE, type HostConfig, type MfNavigateDetail } from '@mf/contracts';
import { createHost, type Host } from './create-host.ts';
import type { Logger } from './logger.ts';

/**
 * Integration: real mediator + real colleagues on the happy-dom document.
 * Only the edges are faked: fetch (manifest), import() (remotes), the logger sink, timers,
 * `location.hash` / `hashchange` (see fakeLocationWindow), and Web Storage (happy-dom's, cleared).
 */

let seq = 0;
const lifecycle: string[] = [];

/** Fresh tags per test, because the custom element registry is global and permanent. */
function makeConfig(): HostConfig {
  seq += 1;
  return {
    apps: {
      todo: {
        route: '#/todo', url: `http://localhost:5175/src/web-component.ts?t=${seq}`, tag: `int-todo-${seq}`,
        attributes: { 'weather-route': '#/weather' },
      },
      weather: {
        route: '#/weather', url: `http://localhost:5176/src/web-component.ts?t=${seq}`, tag: `int-weather-${seq}`,
        attributes: { units: 'metric' },
      },
    },
  };
}

/** A placeholder remote: renders into its shadow root and can ask the host to navigate. */
function defineRemote(tag: string): void {
  customElements.define(tag, class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }
    connectedCallback() {
      lifecycle.push(`${tag} connected units=${this.getAttribute('units')} weather-route=${this.getAttribute('weather-route')}`);
      const button = document.createElement('button');
      button.textContent = 'go';
      button.addEventListener('click', () => {
        const path = this.getAttribute('weather-route') ?? '#/';
        this.dispatchEvent(new CustomEvent<MfNavigateDetail>(MF_NAVIGATE, { detail: { path }, bubbles: true, composed: true }));
      });
      this.shadowRoot!.replaceChildren(button);
    }
    disconnectedCallback() {
      lifecycle.push(`${tag} disconnected`);
    }
  });
}

function fakeResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as Response;
}

/** Seeds the stored home layout (the real repository reads happy-dom's localStorage). */
function saveLayout(cells: (string | null)[][]): void {
  localStorage.setItem('home:layout', JSON.stringify({ version: 1, columns: cells[0]?.length ?? 0, rows: cells.length, cells }));
}

/** Settles the promise chains of fetch/import fakes (microtasks only, no timers). */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/**
 * Fakes the location edge of `window`: setting `location.hash` fires `hashchange` synchronously,
 * as a deterministic stand-in for the browser's queued task. Every other event (`mf:navigate`)
 * goes through the real window, so remotes still reach the host by bubbling out of the document.
 */
function fakeLocationWindow() {
  let hash = '';
  const hashListeners = new Set<EventListenerOrEventListenerObject>();
  const fire = () => {
    const event = new Event('hashchange');
    for (const l of hashListeners) typeof l === 'function' ? l(event) : l.handleEvent(event);
  };
  const win = {
    location: {
      get hash() {
        return hash;
      },
      set hash(value: string) {
        const next = value === '' || value.startsWith('#') ? value : `#${value}`;
        if (next === hash) return;
        hash = next;
        fire();
      },
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === 'hashchange') hashListeners.add(listener);
      else window.addEventListener(type, listener);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === 'hashchange') hashListeners.delete(listener);
      else window.removeEventListener(type, listener);
    },
  };
  return win as unknown as Window;
}

describe('host integration', () => {
  let config: HostConfig;
  let host: Host;
  let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
  let importer: ReturnType<typeof vi.fn<(url: string) => Promise<unknown>>>;
  let warn: ReturnType<typeof vi.fn<Logger['warn']>>;
  let down: Set<string>;
  let win: Window;

  /** The user changes the hash (clicks a link or edits the address bar). */
  const goTo = async (hash: string) => {
    win.location.hash = hash;
    await flush();
  };

  const outlet = () => document.getElementById('mf-outlet')!;
  const nav = () => document.getElementById('mf-nav')!;
  const mounted = (tag: string) => outlet().querySelector(tag);
  const currentLink = () => nav().querySelector('a[aria-current="page"]')?.getAttribute('href') ?? null;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    win = fakeLocationWindow();
    document.body.innerHTML = '<header><nav id="mf-nav"></nav></header><main id="mf-outlet"></main>';
    lifecycle.length = 0;
    config = makeConfig();
    down = new Set();
    fetchImpl = vi.fn<typeof fetch>(async () => fakeResponse(200, config));
    importer = vi.fn(async (url: string) => {
      const app = Object.values(config.apps).find((e) => url.startsWith(e.url));
      if (!app || down.has(app.tag)) throw new TypeError(`Failed to fetch dynamically imported module: ${url}`);
      if (!customElements.get(app.tag)) defineRemote(app.tag);
    });
    warn = vi.fn();
    host = createHost({
      window: win,
      nav: nav(),
      outlet: outlet(),
      fetch: fetchImpl,
      configUrl: 'host.config.json',
      importer,
      logger: { warn },
    });
  });

  afterEach(() => {
    host.dispose();
    vi.useRealTimers();
  });

  it('given a valid manifest and empty storage, when the host starts on an empty hash, then the header renders and .mf-home mounts <todo-app> instead of a link list (TR-70 updated) [TR-70] [HH-01]', async () => {
    host.start();
    await flush();
    expect(fetchImpl).toHaveBeenCalledWith('host.config.json', expect.anything());
    expect([...nav().querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['#/', '#/todo', '#/weather']);
    const home = outlet().querySelector('.mf-home');
    expect(home?.querySelector(config.apps.todo!.tag)?.getAttribute('weather-route')).toBe('#/weather');
    expect(home?.querySelector('a')).toBeNull();
    expect(host.mediator.state.phase).toEqual({ kind: 'home' });
  });

  it('given home with two mounted cells, when the user opens #/weather, then both cells disconnect and only the routed weather element is in the outlet [HH-02]', async () => {
    saveLayout([[`todo`, `weather`]]);
    host.start();
    await flush();
    const cells = [mounted(config.apps.todo!.tag)!, mounted(config.apps.weather!.tag)!];
    expect(cells.every((c) => c?.isConnected)).toBe(true);

    await goTo('#/weather');
    expect(cells.map((c) => c.isConnected)).toEqual([false, false]);
    expect(outlet().querySelector('.mf-home')).toBeNull();
    expect(outlet().querySelectorAll(config.apps.weather!.tag)).toHaveLength(1);
    expect(mounted(config.apps.todo!.tag)).toBeNull();
    expect(lifecycle).toContain(`${config.apps.todo!.tag} disconnected`);
  });

  it('given a todo cell on home, when it dispatches mf:navigate to #/weather, then the host navigates there [HH-03]', async () => {
    host.start();
    await flush();
    mounted(config.apps.todo!.tag)!.shadowRoot!.querySelector('button')!.click();
    await flush();
    expect(win.location.hash).toBe('#/weather');
    expect(mounted(config.apps.weather!.tag)).not.toBeNull();
  });

  it('given home in config mode with an unsaved draft, when the user navigates away and back, then view mode shows the saved layout [HH-04]', async () => {
    host.start();
    await flush();
    const button = (name: string) => [...outlet().querySelectorAll('button')].find((b) => b.textContent === name);
    button('Configure')!.click();
    const columns = outlet().querySelector<HTMLInputElement>('input[type="number"]')!;
    columns.value = '3';
    columns.dispatchEvent(new Event('input', { bubbles: true }));
    expect(outlet().querySelectorAll('select')).toHaveLength(3);

    await goTo('#/todo');
    await goTo('#/');
    expect(outlet().querySelectorAll('select')).toHaveLength(0);
    expect(button('Configure')).toBeDefined();
    expect(outlet().querySelectorAll('.mf-home [role="region"]')).toHaveLength(1);
    expect(outlet().querySelector(`.mf-home ${config.apps.todo!.tag}`)).not.toBeNull();
    expect(localStorage.getItem('home:layout')).toBeNull();
  });

  it('given the weather remote is down, when home has a weather cell, then only that cell shows the error and logs it [HH-01]', async () => {
    down.add(config.apps.weather!.tag);
    saveLayout([['todo', 'weather']]);
    host.start();
    await flush();
    expect(mounted(config.apps.todo!.tag)).not.toBeNull();
    expect(outlet().querySelector('[aria-label="weather"]')?.textContent).toContain('Could not load weather');
    expect(warn).toHaveBeenCalledWith('cell failed to load', expect.objectContaining({ appId: 'weather', row: 0, column: 1 }));
  });

  it('given the routed weather load was retried once, when a home weather cell is retried, then it uses retry=2, not the cached retry=1 [HH-06]', async () => {
    down.add(config.apps.weather!.tag);
    saveLayout([['weather']]);
    host.start();
    await flush();
    await goTo('#/weather');
    outlet().querySelector('button')!.click();
    await flush();
    expect(importer).toHaveBeenLastCalledWith(`${config.apps.weather!.url}&retry=1`);

    await goTo('#/');
    down.clear();
    outlet().querySelector<HTMLButtonElement>('[aria-label="weather"] button')!.click();
    await flush();
    expect(importer).toHaveBeenLastCalledWith(`${config.apps.weather!.url}&retry=2`);
    expect(mounted(config.apps.weather!.tag)).not.toBeNull();
  });

  it('given the host renders home, then document.head gains no <style> or <link> [HH-05]', async () => {
    const before = document.head.querySelectorAll('style, link').length;
    saveLayout([['todo', 'weather']]);
    host.start();
    await flush();
    expect(mounted(config.apps.weather!.tag)).not.toBeNull();
    expect(document.head.querySelectorAll('style, link')).toHaveLength(before);
  });

  it('given the host is on home, when the user opens todo then weather, then each is mounted with its attributes and the previous one is removed [TR-71]', async () => {
    host.start();
    await flush();
    // Home now mounts a todo cell (HH-01); this scenario is about the routed mounts after it.
    await goTo('#/todo');
    lifecycle.splice(0, lifecycle.indexOf(`${config.apps.todo!.tag} disconnected`) + 1);
    expect(importer).toHaveBeenCalledWith(config.apps.todo!.url);
    expect(mounted(config.apps.todo!.tag)).not.toBeNull();
    expect(currentLink()).toBe('#/todo');

    await goTo('#/weather');
    expect(mounted(config.apps.todo!.tag)).toBeNull();
    expect(mounted(config.apps.weather!.tag)).not.toBeNull();
    expect(currentLink()).toBe('#/weather');
    expect(lifecycle).toEqual([
      `${config.apps.todo!.tag} connected units=null weather-route=#/weather`,
      `${config.apps.todo!.tag} disconnected`,
      `${config.apps.weather!.tag} connected units=metric weather-route=null`,
    ]);
  });

  it('given todo was visited before, when the user returns to it, then it is mounted without a second import [TR-75]', async () => {
    host.start();
    await flush();
    await goTo('#/todo');
    await goTo('#/');
    await goTo('#/todo');
    expect(importer).toHaveBeenCalledTimes(1);
    expect(mounted(config.apps.todo!.tag)).not.toBeNull();
  });

  it('given the weather remote is down, when the user opens it, then only that route shows an error and the header and other routes keep working [TR-72]', async () => {
    down.add(config.apps.weather!.tag);
    host.start();
    await flush();

    await goTo('#/weather');
    const alert = outlet().querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('could not reach weather');
    expect(alert?.getAttribute('data-scope')).toBe('route');
    expect(nav().querySelectorAll('a')).toHaveLength(3);

    await goTo('#/todo');
    expect(mounted(config.apps.todo!.tag)).not.toBeNull();
    expect(outlet().querySelector('[role="alert"]')).toBeNull();
  });

  it('given the weather remote failed, when it comes back and the user clicks Retry, then it re-imports with a cache-buster and mounts [TR-72]', async () => {
    down.add(config.apps.weather!.tag);
    host.start();
    await flush();
    await goTo('#/weather');

    down.clear();
    outlet().querySelector('button')!.click();
    await flush();

    expect(importer).toHaveBeenLastCalledWith(`${config.apps.weather!.url}&retry=1`);
    expect(mounted(config.apps.weather!.tag)).not.toBeNull();
  });

  it('given a mounted app, when it dispatches mf:navigate to a declared route, then the host navigates there [TR-73]', async () => {
    host.start();
    await flush();
    await goTo('#/todo');

    mounted(config.apps.todo!.tag)!.shadowRoot!.querySelector('button')!.click();
    await flush();

    expect(win.location.hash).toBe('#/weather');
    expect(mounted(config.apps.weather!.tag)).not.toBeNull();
  });

  it('given a mounted app, when it dispatches mf:navigate to an undeclared route, then the host warns and stays [TR-73]', async () => {
    host.start();
    await flush();
    await goTo('#/todo');

    const el = mounted(config.apps.todo!.tag)!;
    el.setAttribute('weather-route', '#/elsewhere');
    el.shadowRoot!.querySelector('button')!.click();
    await flush();

    expect(win.location.hash).toBe('#/todo');
    expect(mounted(config.apps.todo!.tag)).toBe(el);
    expect(warn).toHaveBeenCalledWith('navigation to undeclared route ignored', { path: '#/elsewhere' });
  });

  it('given the host runs, when mf:navigate arrives without a string path, then it is ignored with a warning [TR-73]', async () => {
    host.start();
    await flush();
    window.dispatchEvent(new CustomEvent(MF_NAVIGATE, { detail: { path: 42 } }));
    expect(warn).toHaveBeenCalledWith('mf:navigate ignored: detail.path must be a string', { detail: { path: 42 } });
  });

  it('given the manifest cannot be loaded, when the user clicks Retry after it is fixed, then the host boots [TR-74]', async () => {
    fetchImpl.mockResolvedValueOnce(fakeResponse(500, {}));
    host.start();
    await flush();
    const alert = outlet().querySelector('[role="alert"]');
    expect(alert?.getAttribute('data-scope')).toBe('global');
    expect(alert?.textContent).toContain('HTTP 500');

    outlet().querySelector('button')!.click();
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(outlet().querySelector('.mf-home')).not.toBeNull();
  });

  it('given the host is on home, when the user opens an unknown route, then not-found is shown and the header still works [TR-76]', async () => {
    host.start();
    await flush();
    await goTo('#/nope');
    expect(outlet().textContent).toContain('#/nope');
    await goTo('#/todo');
    expect(mounted(config.apps.todo!.tag)).not.toBeNull();
  });
});
