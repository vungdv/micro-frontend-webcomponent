import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { requestNavigate } from '@mf/shared-contracts';
import { wire } from '../src/main';

/**
 * End-to-end wiring test: real colleagues + mediator, the real mf:navigate contract,
 * and an injected importer standing in for the remote dev servers.
 */
const TODO_URL = 'http://localhost:5175/src/todo-app.ts';
const WEATHER_URL = 'http://localhost:5176/src/weather-app.ts';
const manifest = {
  apps: {
    todo: { route: '#/todo', url: TODO_URL, tag: 'wired-todo' },
    weather: { route: '#/weather', url: WEATHER_URL, tag: 'wired-weather' },
  },
};

let todoUp = false;
const importedUrls: string[] = [];
const importer = async (url: string): Promise<void> => {
  importedUrls.push(url);
  if (url.startsWith(WEATHER_URL)) {
    customElements.define('wired-weather', class extends HTMLElement {});
  } else if (todoUp) {
    customElements.define('wired-todo', class extends HTMLElement {});
  } else {
    throw new TypeError('Failed to fetch dynamically imported module');
  }
};

const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(manifest)));
let fetchedUrls: string[] = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const outlet = () => document.getElementById('mf-outlet')!;
const navLinks = () => document.querySelectorAll('#mf-header nav a');
const go = async (hash: string) => {
  window.location.hash = hash;
  await settle();
};

describe('host wiring (main.ts)', () => {
  beforeAll(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '';
    document.body.innerHTML = '<header id="mf-header"></header><main id="mf-outlet"></main>';
    wire({ importer, timeoutMs: 1000 }).start();
    await settle();
    fetchedUrls = fetchMock.mock.calls.map(([input]) => String(input));
  });
  afterAll(() => vi.unstubAllGlobals());

  it('boots from the manifest into the home view with header links', () => {
    expect(fetchedUrls).toEqual([expect.stringMatching(/\/host\.config\.json$/)]);
    expect([...navLinks()].map((a) => a.getAttribute('href'))).toEqual(['#/todo', '#/weather']);
    expect(outlet().querySelector('.mf-panel--home')).not.toBeNull();
  });

  it('mf:navigate to a declared route mounts that app and highlights it', async () => {
    requestNavigate('#/weather');
    await settle();
    expect(window.location.hash).toBe('#/weather');
    expect(outlet().querySelector('wired-weather')).not.toBeNull();
    expect(document.querySelector('#mf-header [aria-current="page"]')?.getAttribute('href')).toBe('#/weather');
  });

  it('mf:navigate to an unknown path is rejected with a warning and nothing changes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    requestNavigate('#/elsewhere');
    await settle();
    expect(window.location.hash).toBe('#/weather');
    expect(outlet().querySelector('wired-weather')).not.toBeNull();
    const record = JSON.parse(String(warn.mock.calls.at(-1)?.[0]));
    expect(record).toMatchObject({ level: 'warn', component: 'host', msg: 'navigate request rejected: unknown path', path: '#/elsewhere' });
  });

  it('goal 5: a down remote fails only its route; other routes work; Retry mounts it once it is back', async () => {
    // Remote is down: route-scoped error panel, header intact.
    await go('#/todo');
    const panel = outlet().querySelector<HTMLElement>('[role="alert"]');
    expect(panel?.dataset.scope).toBe('route');
    expect(panel?.textContent).toContain('Could not load todo');
    expect(outlet().querySelector('wired-weather')).toBeNull();
    expect(navLinks()).toHaveLength(2);
    expect(document.querySelector('#mf-header [aria-current="page"]')?.getAttribute('href')).toBe('#/todo');

    // Another route still mounts.
    await go('#/weather');
    expect(outlet().querySelector('wired-weather')).not.toBeNull();

    // Back to the failed route: still down, and the later attempt bypasses the cached failure.
    await go('#/todo');
    expect(outlet().querySelector('[data-scope="route"]')).not.toBeNull();
    expect(importedUrls.filter((u) => u.startsWith(TODO_URL))).toEqual([TODO_URL, `${TODO_URL}?mf-retry=1`]);

    // Remote comes back: Retry mounts the app.
    todoUp = true;
    outlet().querySelector('button')!.click();
    await settle();
    expect(outlet().querySelector('wired-todo')).not.toBeNull();
    expect(outlet().children).toHaveLength(1);
    expect(importedUrls.at(-1)).toBe(`${TODO_URL}?mf-retry=2`);
  });

  it('an unknown hash shows not-found while the header stays', async () => {
    await go('#/missing');
    expect(outlet().querySelector('.mf-panel--not-found')).not.toBeNull();
    expect(navLinks()).toHaveLength(2);
  });
});
