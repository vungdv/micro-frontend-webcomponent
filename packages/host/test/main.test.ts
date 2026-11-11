/**
 * Composition level (docs/milestones/m1-host-shell.md §3.1): `wire()` in happy-dom with real
 * colleagues, the real `mf:navigate` contract, and network-level fakes only (`fetch`, `importer`).
 *
 * `wire()` uses the real `customElements` registry and window `hashchange`, and cannot be unwired,
 * so the host is wired once for the file and each `describe` below is a deliberate, ordered step of
 * one user journey (`beforeAll`), carrying state from the step before.
 * Tags are unique to this file (`e2e-*`) because definitions outlive a test.
 */
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { MF_NAVIGATE, requestNavigate } from '@mf/shared-contracts';
import { wire } from '../src/main';
import { aManifest, anApp } from './support/builders';
import { json, recordingFetch, scriptedImporter } from './support/fakes';

const todo = anApp('todo', { tag: 'e2e-todo' });
const weather = anApp('weather', { tag: 'e2e-weather' });
/** A third remote, used for the failure scenarios so that Todo and Weather stay healthy. */
const news = anApp('news', { tag: 'e2e-news' });

const fetchFake = recordingFetch(json(aManifest(todo, weather, news)));
const importer = scriptedImporter(customElements, {
  [todo.url]: { define: todo.tag },
  [weather.url]: { define: weather.tag },
  [news.url]: { reject: 'could not reach news' },
});

/** Lets fetch, imports and hashchange settle (no real waits beyond zero-delay tasks). */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const outlet = (): HTMLElement => document.getElementById('mf-outlet')!;
const navLinks = (): HTMLAnchorElement[] => [...document.querySelectorAll<HTMLAnchorElement>('#mf-header nav a')];
const activeHref = (): string | null | undefined =>
  document.querySelector('#mf-header [aria-current="page"]')?.getAttribute('href');
const appElements = (): string[] =>
  [...outlet().children].map((el) => el.localName).filter((tag) => tag.startsWith('e2e-'));
const importsOf = (url: string): string[] => importer.urls.filter((u) => u.startsWith(url));

/** The user clicks the header link of an app (a plain `<a href>`: the browser changes the hash). */
const clickNav = async (route: string): Promise<void> => {
  navLinks().find((a) => a.getAttribute('href') === route)!.click();
  await settle();
};

let warn: MockInstance<typeof console.warn>;
let info: MockInstance<typeof console.info>;
type LogLine = Record<string, unknown>;
const parse = (spy: MockInstance<(...args: unknown[]) => void>): LogLine[] =>
  spy.mock.calls.map(([line]) => JSON.parse(String(line)) as LogLine);

/** Runs one user step and returns the JSON log lines it wrote to `console.warn` / `console.info`. */
const step = async (action: () => void | Promise<void>): Promise<{ warnings: LogLine[]; infos: LogLine[] }> => {
  warn.mockClear();
  info.mockClear();
  await action();
  await settle();
  return { warnings: parse(warn), infos: parse(info) };
};

describe('Given the host is wired with three fake remotes (Todo, Weather, and News which is down)', () => {
  beforeAll(async () => {
    info = vi.spyOn(console, 'info').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchFake);
    window.location.hash = '';
    document.body.innerHTML = '<header id="mf-header"></header><main id="mf-outlet"></main>';
    wire({ importer, timeoutMs: 1000 }).start();
    await settle();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  describe('when the host starts', () => {
    it('then the manifest is fetched once from host.config.json next to the document [E2E-03]', () => {
      expect(fetchFake.urls).toEqual([new URL('host.config.json', document.baseURI).href]);
    });

    it('then the header shows one link per app [E2E-03]', () => {
      expect(navLinks().map((a) => a.getAttribute('href'))).toEqual(['#/todo', '#/weather', '#/news']);
    });

    it('then the outlet shows the home view [E2E-03]', () => {
      expect(outlet().querySelector('.mf-panel--home')).not.toBeNull();
    });
  });

  describe('when the user clicks Todo, then Weather, then Todo again', () => {
    const mounted: string[][] = [];
    beforeAll(async () => {
      for (const route of [todo.route, weather.route, todo.route]) {
        await clickNav(route);
        mounted.push(appElements());
      }
    });

    it('then each visit shows exactly that one app in the outlet [E2E-01]', () => {
      expect(mounted).toEqual([[todo.tag], [weather.tag], [todo.tag]]);
    });

    it('then the outlet holds a single element [E2E-01]', () => {
      expect(outlet().children).toHaveLength(1);
    });

    it('then each remote is imported once, and the revisit reuses the defined element [E2E-01]', () => {
      expect(importsOf(todo.url)).toEqual([todo.url]);
      expect(importsOf(weather.url)).toEqual([weather.url]);
    });

    it('then both elements are defined in the registry [E2E-01]', () => {
      expect(customElements.get(todo.tag)).toBeDefined();
      expect(customElements.get(weather.tag)).toBeDefined();
    });
  });

  describe('when the Todo app dispatches mf:navigate to a declared route (#/weather)', () => {
    beforeAll(async () => {
      requestNavigate(weather.route);
      await settle();
    });

    it('then the hash changes to that route [E2E-04] [NV-01]', () => {
      expect(window.location.hash).toBe(weather.route);
    });

    it('then that app is mounted [E2E-04]', () => {
      expect(appElements()).toEqual([weather.tag]);
    });

    it('then its header link is highlighted [E2E-04]', () => {
      expect(activeHref()).toBe(weather.route);
    });
  });

  describe('when an app dispatches mf:navigate to an unknown path', () => {
    let logged: Awaited<ReturnType<typeof step>>;
    beforeAll(async () => {
      logged = await step(() => requestNavigate('#/elsewhere'));
    });

    it('then the request is rejected with a warning [NV-02]', () => {
      expect(logged.warnings).toEqual([
        expect.objectContaining({
          level: 'warn',
          component: 'host',
          msg: 'navigate request rejected: unknown path',
          path: '#/elsewhere',
        }),
      ]);
    });

    it('then the route and the mounted app are unchanged [NV-02]', () => {
      expect(window.location.hash).toBe(weather.route);
      expect(appElements()).toEqual([weather.tag]);
    });
  });

  describe.each([
    ['a non-string detail.path', { path: 42 }],
    ['no detail', null],
  ])('when an app dispatches mf:navigate with %s', (_label, detail) => {
    let logged: Awaited<ReturnType<typeof step>>;
    beforeAll(async () => {
      logged = await step(() => {
        window.dispatchEvent(new CustomEvent(MF_NAVIGATE, { detail, bubbles: true, composed: true }));
      });
    });

    it('then the only warning is "malformed mf:navigate ignored" with the detail [NV-04]', () => {
      expect(logged.warnings).toEqual([
        expect.objectContaining({ level: 'warn', component: 'host', msg: 'malformed mf:navigate ignored', detail }),
      ]);
    });

    it('then no notification reaches the mediator: no state change, route and app unchanged [NV-04]', () => {
      expect(logged.infos).toEqual([]);
      expect(window.location.hash).toBe(weather.route);
      expect(appElements()).toEqual([weather.tag]);
    });
  });

  describe('when the user opens News while its remote is down', () => {
    beforeAll(async () => {
      await clickNav(news.route);
    });

    it('then the outlet shows a route error panel naming the app, with Retry [E2E-02]', () => {
      const panel = outlet().querySelector<HTMLElement>('[role="alert"]');
      expect(panel?.dataset.scope).toBe('route');
      expect(panel?.textContent).toContain('Could not load news: could not reach news');
      expect(panel?.querySelector('button')?.textContent).toBe('Retry');
    });

    it('then no app element is in the outlet [E2E-02]', () => {
      expect(appElements()).toEqual([]);
    });

    it('then the header keeps its links and highlights News [E2E-02]', () => {
      expect(navLinks()).toHaveLength(3);
      expect(activeHref()).toBe(news.route);
    });
  });

  describe('when the user then opens Todo', () => {
    beforeAll(async () => {
      await clickNav(todo.route);
    });

    it('then Todo mounts [E2E-02]', () => {
      expect(appElements()).toEqual([todo.tag]);
    });

    it('then the header still works and highlights Todo [E2E-02]', () => {
      expect(navLinks()).toHaveLength(3);
      expect(activeHref()).toBe(todo.route);
    });
  });

  describe('when the user goes back to News, which is still down', () => {
    beforeAll(async () => {
      await clickNav(news.route);
    });

    it('then the route error panel is shown again [E2E-06]', () => {
      expect(outlet().querySelector('[data-scope="route"]')).not.toBeNull();
    });

    it('then the second import bypasses the cached failure with mf-retry [E2E-06]', () => {
      expect(importsOf(news.url)).toEqual([news.url, `${news.url}?mf-retry=1`]);
    });
  });

  describe('when the News remote is back and the user clicks Retry', () => {
    beforeAll(async () => {
      importer.script(news.url, { define: news.tag });
      outlet().querySelector('button')!.click();
      await settle();
    });

    it('then the module is imported again with a new mf-retry [E2E-06]', () => {
      expect(importsOf(news.url).at(-1)).toBe(`${news.url}?mf-retry=2`);
    });

    it('then News mounts as the only element in the outlet [E2E-06]', () => {
      expect(appElements()).toEqual([news.tag]);
      expect(outlet().children).toHaveLength(1);
    });
  });

  describe('when the hash names no app', () => {
    beforeAll(async () => {
      window.location.hash = '#/missing';
      await settle();
    });

    it('then the not-found view is shown [E2E-05]', () => {
      expect(outlet().querySelector('.mf-panel--not-found')?.textContent).toContain('#/missing');
    });

    it('then no app element remains and the header stays [E2E-05]', () => {
      expect(appElements()).toEqual([]);
      expect(navLinks()).toHaveLength(3);
      expect(activeHref()).toBeUndefined();
    });
  });
});
