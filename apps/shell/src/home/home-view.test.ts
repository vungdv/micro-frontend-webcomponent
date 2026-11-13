import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEntry, HostConfig } from '@mf/contracts';
import { HomeView } from './home-view.ts';
import { defaultLayout, type Layout } from './domain/layout.ts';
import type { LayoutRepository } from './services/layout-repository.ts';
import { defineApp, RetryCounter, type ElementRegistry } from '../micro-frontends/loader.ts';
import type { Logger } from '../app/logger.ts';

/**
 * View tests: real HomeView, real HomeCell, real defineApp. Only the edges are faked: import(),
 * the custom element registry, timers, the logger sink, and the repository at its seam.
 */

const apps: HostConfig['apps'] = {
  todo: { route: '#/todo', url: 'http://localhost:5175/src/web-component.ts', tag: 'todo-app', attributes: { 'weather-route': '#/weather' } },
  weather: { route: '#/weather', url: 'http://localhost:5176/src/web-component.ts', tag: 'weather-dashboard', attributes: { units: 'metric' } },
  timezone: { route: '#/timezone', url: 'http://localhost:5177/src/web-component.ts', tag: 'timezone-app' },
};
const appIds = Object.keys(apps);

/** A test remote standing in for todo: records the attributes it sees when it connects. */
const connected: string[] = [];
customElements.define('todo-app', class extends HTMLElement {
  connectedCallback() {
    connected.push(`${this.localName} weather-route=${this.getAttribute('weather-route')}`);
  }
});

/** Fake registry: tags become defined when the fake importer "evaluates" a module. */
function fakeRegistry() {
  const defined = new Set<string>();
  const waiting = new Map<string, (() => void)[]>();
  const registry: ElementRegistry = {
    get: (tag) => (defined.has(tag) ? (class extends HTMLElement {}) : undefined),
    whenDefined: (tag) =>
      new Promise((resolve) => {
        if (defined.has(tag)) resolve(class extends HTMLElement {});
        else waiting.set(tag, [...(waiting.get(tag) ?? []), () => resolve(class extends HTMLElement {})]);
      }),
  };
  const define = (tag: string) => {
    defined.add(tag);
    for (const resolve of waiting.get(tag) ?? []) resolve();
    waiting.delete(tag);
  };
  return { registry, define };
}

/** Fake repository at the seam: records saves, returns what was saved (or the default). */
function fakeRepository(saved: Layout | null = null) {
  const saves: Layout[] = [];
  const loads: number[] = [];
  const repository: LayoutRepository = {
    load: async (ids) => {
      loads.push(1);
      return saved ?? defaultLayout(ids);
    },
    save: async (layout) => {
      saves.push(layout);
      saved = layout;
    },
  };
  return { repository, saves, loads };
}

const layout = (columns: number, rows: number, cells: (string | null)[][]): Layout => ({ version: 1, columns, rows, cells });

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('HomeView', () => {
  let root: HTMLElement;
  let fake: ReturnType<typeof fakeRegistry>;
  let down: Set<string>;
  let importer: ReturnType<typeof vi.fn<(url: string) => Promise<unknown>>>;
  let warn: ReturnType<typeof vi.fn<Logger['warn']>>;
  let view: HomeView | undefined;
  let retries: RetryCounter;

  const entryForUrl = (url: string): [string, AppEntry] | undefined =>
    Object.entries(apps).find(([, e]) => url.startsWith(e.url));

  function show(repository: LayoutRepository): Promise<void> {
    view = new HomeView({
      root,
      apps,
      repository,
      define: (appId, entry, retry) => defineApp(appId, entry, {
        importer, registry: fake.registry, timeoutMs: 5_000, attempt: retry ? retries.next(entry.url) : 0,
      }),
      logger: { warn },
    });
    return view.show();
  }

  async function shown(saved: Layout | null = null) {
    const repo = fakeRepository(saved);
    await show(repo.repository);
    await flush();
    return repo;
  }

  const cells = () => [...root.querySelectorAll<HTMLElement>('[role="region"]')];
  const button = (name: string) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement | undefined;
  const input = (name: string) =>
    [...root.querySelectorAll('label')].find((l) => l.textContent?.startsWith(name))?.querySelector('input') as HTMLInputElement;
  const picker = (row: number, column: number) =>
    root.querySelector<HTMLSelectElement>(`select[aria-label="Row ${row}, column ${column}"]`);
  const pickers = () => [...root.querySelectorAll('select')];
  const type = (el: HTMLInputElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const choose = (el: HTMLSelectElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<section class="mf-home"></section>';
    root = document.querySelector('.mf-home')!;
    fake = fakeRegistry();
    down = new Set();
    importer = vi.fn(async (url: string) => {
      const found = entryForUrl(url);
      if (!found || down.has(found[0])) throw new TypeError(`Failed to fetch dynamically imported module: ${url}`);
      fake.define(found[1].tag);
    });
    warn = vi.fn();
    view = undefined;
    retries = new RetryCounter();
    connected.length = 0;
  });

  afterEach(() => {
    view?.dispose();
    vi.useRealTimers();
  });

  describe('view mode', () => {
    it('given no saved layout, when shown, then one cell mounts <todo-app weather-route="#/weather"> [HV-01]', async () => {
      await shown();
      expect(cells()).toHaveLength(1);
      expect(cells()[0]!.getAttribute('aria-label')).toBe('todo');
      const el = cells()[0]!.querySelector('todo-app');
      expect(el?.getAttribute('weather-route')).toBe('#/weather');
      expect(button('Configure')).toBeDefined();
    });

    it('given a pending cell load, then the cell shows a loading status naming the tag [HV-01]', async () => {
      importer.mockImplementation(() => new Promise(() => {}));
      await show(fakeRepository().repository);
      await flush();
      const status = cells()[0]!.querySelector('[role="status"]');
      expect(status?.textContent).toBe('Loading todo-app…');
      expect(cells()[0]!.querySelector('todo-app')).toBeNull();
    });

    it('given a saved 2×1 [[todo, weather]], when shown, then both elements mount with their manifest attributes side by side [HV-02]', async () => {
      await shown(layout(2, 1, [['todo', 'weather']]));
      expect(cells().map((c) => c.getAttribute('aria-label'))).toEqual(['todo', 'weather']);
      expect(cells()[0]!.querySelector('todo-app')?.getAttribute('weather-route')).toBe('#/weather');
      expect(cells()[1]!.querySelector('weather-dashboard')?.getAttribute('units')).toBe('metric');
      const grid = cells()[0]!.parentElement!;
      expect(grid.style.getPropertyValue('--mf-home-columns')).toBe('2');
    });

    it('given a cell element, then its manifest attributes are set before it is connected [HV-02]', async () => {
      await shown();
      expect(connected).toEqual(['todo-app weather-route=#/weather']);
    });

    it('given an empty cell, then it is a region labelled "Empty cell" with nothing mounted [HV-02]', async () => {
      await shown(layout(2, 1, [['todo', null]]));
      expect(cells()[1]!.getAttribute('aria-label')).toBe('Empty cell');
      expect(cells()[1]!.children).toHaveLength(0);
    });

    it('given a saved 0×3 layout, when shown, then the empty message is shown and nothing mounts [HV-03]', async () => {
      await shown(layout(0, 3, [[], [], []]));
      expect(root.textContent).toContain('No cells yet. Choose Configure to add some.');
      expect(cells()).toHaveLength(0);
      expect(importer).not.toHaveBeenCalled();
    });

    it('given the same app in two cells, then two separate element instances are mounted [HV-12]', async () => {
      await shown(layout(2, 1, [['todo', 'todo']]));
      const [a, b] = cells().map((c) => c.querySelector('todo-app'));
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a).not.toBe(b);
    });
  });

  describe('config mode', () => {
    it('given view mode, when Configure is clicked, then cell elements are disconnected and inputs and pickers show the layout [HV-04]', async () => {
      await shown(layout(3, 1, [['todo', 'weather', null]]));
      const els = [root.querySelector('todo-app')!, root.querySelector('weather-dashboard')!];
      expect(els.map((el) => el.isConnected)).toEqual([true, true]);
      button('Configure')!.click();
      expect(els.map((el) => el.isConnected)).toEqual([false, false]);
      expect(root.querySelector('todo-app, weather-dashboard')).toBeNull();
      expect(input('Columns').value).toBe('3');
      expect(input('Rows').value).toBe('1');
      expect(input('Columns').getAttribute('min')).toBe('0');
      expect(input('Columns').getAttribute('max')).toBe('10');
      expect(input('Columns').getAttribute('step')).toBe('1');
      expect([1, 2, 3].map((c) => picker(1, c)?.value)).toEqual(['todo', 'weather', '']);
      expect([...picker(1, 1)!.options].map((o) => o.textContent)).toEqual(['Empty', 'todo', 'weather', 'timezone']);
      expect(button('Save')).toBeDefined();
      expect(button('Cancel')).toBeDefined();
    });

    it('given config mode, when Columns is set to 3, then 3 pickers per row show at once, new ones Empty, and nothing is saved [HV-05]', async () => {
      const repo = await shown(layout(2, 2, [['todo', 'weather'], ['timezone', null]]));
      button('Configure')!.click();
      type(input('Columns'), '3');
      expect(pickers()).toHaveLength(6);
      expect([1, 2, 3].map((c) => picker(1, c)?.value)).toEqual(['todo', 'weather', '']);
      expect([1, 2, 3].map((c) => picker(2, c)?.value)).toEqual(['timezone', '', '']);
      expect(repo.saves).toEqual([]);
    });

    it.each([['11'], ['']])(
      'given config mode, when Rows is set to "%s", then the message shows, only Rows is aria-invalid, Save is disabled and the draft is unchanged [HV-06]',
      async (value) => {
        await shown(layout(2, 1, [['todo', 'weather']]));
        button('Configure')!.click();
        type(input('Rows'), value);
        expect(root.textContent).toContain('Enter a whole number from 0 to 10');
        expect(input('Rows').getAttribute('aria-invalid')).toBe('true');
        expect(input('Columns').hasAttribute('aria-invalid')).toBe(false);
        expect(button('Save')!.disabled).toBe(true);
        expect(pickers().map((p) => p.value)).toEqual(['todo', 'weather']);
      },
    );

    it('given an invalid Rows value, when it is corrected, then the message clears and Save is enabled again [HV-06]', async () => {
      await shown();
      button('Configure')!.click();
      type(input('Rows'), '2.5');
      type(input('Rows'), '2');
      expect(root.textContent).not.toContain('Enter a whole number from 0 to 10');
      expect(input('Rows').hasAttribute('aria-invalid')).toBe(false);
      expect(button('Save')!.disabled).toBe(false);
      expect(pickers()).toHaveLength(2);
    });

    it('given config mode, when a picker is set to timezone and Save is clicked, then the repository receives the layout and <timezone-app> mounts [HV-07]', async () => {
      const repo = await shown(layout(2, 1, [['todo', null]]));
      button('Configure')!.click();
      choose(picker(1, 2)!, 'timezone');
      button('Save')!.click();
      await flush();
      expect(repo.saves).toEqual([layout(2, 1, [['todo', 'timezone']])]);
      expect(button('Configure')).toBeDefined();
      expect(pickers()).toHaveLength(0);
      expect(cells()[1]!.getAttribute('aria-label')).toBe('timezone');
      expect(cells()[1]!.querySelector('timezone-app')).not.toBeNull();
    });

    it('given config mode with a shrink and changes, when Cancel is clicked, then view mode shows the last saved layout and nothing is saved [HV-08]', async () => {
      const repo = await shown(layout(2, 1, [['todo', 'weather']]));
      button('Configure')!.click();
      type(input('Columns'), '1');
      choose(picker(1, 1)!, 'timezone');
      button('Cancel')!.click();
      await flush();
      expect(repo.saves).toEqual([]);
      expect(cells().map((c) => c.getAttribute('aria-label'))).toEqual(['todo', 'weather']);
      expect(root.querySelector('todo-app')).not.toBeNull();
      expect(root.querySelector('weather-dashboard')).not.toBeNull();
    });

    it('given config mode at 0×0, when Saved, then view mode shows the empty message [HV-03]', async () => {
      await shown();
      button('Configure')!.click();
      type(input('Columns'), '0');
      type(input('Rows'), '0');
      expect(pickers()).toHaveLength(0);
      button('Save')!.click();
      await flush();
      expect(root.textContent).toContain('No cells yet. Choose Configure to add some.');
    });
  });

  describe('saving', () => {
    it('given repository.save rejects, when Save is clicked, then a warning is logged, config mode stays and Save is enabled again [HV-14]', async () => {
      const repository: LayoutRepository = {
        load: async (ids) => defaultLayout(ids),
        save: async () => {
          throw new Error('backend down');
        },
      };
      await show(repository);
      await flush();
      button('Configure')!.click();
      type(input('Columns'), '2');
      button('Save')!.click();
      await flush();
      expect(warn).toHaveBeenCalledWith('could not save home layout', { error: 'Error: backend down' });
      expect(pickers()).toHaveLength(2);
      expect(button('Save')!.disabled).toBe(false);
      expect(button('Cancel')!.disabled).toBe(false);
    });

    it('given a Save is pending, when a size is typed, then Save and Cancel stay disabled until it settles [HV-15]', async () => {
      let release!: () => void;
      const saves: Layout[] = [];
      const repository: LayoutRepository = {
        load: async (ids) => defaultLayout(ids),
        save: (l) => {
          saves.push(l);
          return new Promise((resolve) => (release = resolve));
        },
      };
      await show(repository);
      await flush();
      button('Configure')!.click();
      button('Save')!.click();
      expect(button('Cancel')!.disabled).toBe(true);
      type(input('Columns'), '2');
      expect(button('Save')!.disabled).toBe(true);
      expect(button('Cancel')!.disabled).toBe(true);
      release();
      await flush();
      expect(saves).toEqual([defaultLayout(appIds)]);
      expect(button('Configure')).toBeDefined();
      expect(cells()).toHaveLength(1);
    });
  });

  describe('cell failures', () => {
    it('given weather fails to import, then todo mounts, weather shows the error with Retry, and a warning is logged [HV-09]', async () => {
      down.add('weather');
      await shown(layout(2, 1, [['todo', 'weather']]));
      expect(cells()[0]!.querySelector('todo-app')).not.toBeNull();
      expect(cells()[1]!.textContent).toContain('Could not load weather');
      expect(cells()[1]!.querySelector('button')?.textContent).toBe('Retry');
      expect(warn).toHaveBeenCalledWith('cell failed to load', {
        appId: 'weather', row: 0, column: 1,
        error: 'could not reach weather',
        cause: `Failed to fetch dynamically imported module: ${apps.weather!.url}`,
      });
    });

    it('given a failed cell, when Retry is clicked and the import succeeds, then it mounts via a retry=1 url and other cells stay [HV-10]', async () => {
      down.add('weather');
      await shown(layout(2, 1, [['todo', 'weather']]));
      const todo = cells()[0]!.querySelector('todo-app')!;
      down.clear();
      cells()[1]!.querySelector('button')!.click();
      await flush();
      expect(importer).toHaveBeenLastCalledWith(`${apps.weather!.url}?retry=1`);
      expect(cells()[1]!.querySelector('weather-dashboard')).not.toBeNull();
      expect(cells()[0]!.querySelector('todo-app')).toBe(todo);
      expect(importer.mock.calls.filter(([url]) => url.startsWith(apps.todo!.url))).toHaveLength(1);
    });

    it('given a cell failed twice, when Retry is clicked again, then the next attempt is retry=2 [HV-10]', async () => {
      down.add('weather');
      await shown(layout(1, 1, [['weather']]));
      cells()[0]!.querySelector('button')!.click();
      await flush();
      down.clear();
      cells()[0]!.querySelector('button')!.click();
      await flush();
      expect(importer).toHaveBeenLastCalledWith(`${apps.weather!.url}?retry=2`);
      expect(cells()[0]!.querySelector('weather-dashboard')).not.toBeNull();
    });

    it('given a cell already retried once, when the view is re-created and Retry is clicked, then the next retry number is used, not a cached one [HV-13]', async () => {
      down.add('weather');
      const saved = layout(1, 1, [['weather']]);
      await shown(saved);
      cells()[0]!.querySelector('button')!.click();
      await flush();
      expect(importer).toHaveBeenLastCalledWith(`${apps.weather!.url}?retry=1`);
      view!.dispose();

      await shown(saved);
      down.clear();
      cells()[0]!.querySelector('button')!.click();
      await flush();
      expect(importer).toHaveBeenLastCalledWith(`${apps.weather!.url}?retry=2`);
      expect(cells()[0]!.querySelector('weather-dashboard')).not.toBeNull();
    });

    it('given a slow remote, when the load timeout passes, then only that cell shows the error [HV-09]', async () => {
      importer.mockImplementation(async (url) => {
        const found = entryForUrl(url)!;
        if (found[0] === 'weather') return new Promise(() => {});
        fake.define(found[1].tag);
      });
      await shown(layout(2, 1, [['todo', 'weather']]));
      await vi.advanceTimersByTimeAsync(5_000);
      expect(cells()[0]!.querySelector('todo-app')).not.toBeNull();
      expect(cells()[1]!.textContent).toContain('Could not load weather');
      expect(warn).toHaveBeenCalledWith('cell failed to load', expect.objectContaining({
        appId: 'weather', row: 0, column: 1, error: 'timed out waiting for weather-dashboard',
      }));
    });
  });

  describe('disposal', () => {
    it('given a pending cell load, when the view is disposed and the load then resolves, then nothing mounts and the root is empty [HV-11]', async () => {
      let finish!: () => void;
      importer.mockImplementation(() => new Promise<void>((resolve) => {
        finish = () => {
          fake.define('todo-app');
          resolve();
        };
      }));
      await shown();
      const cell = cells()[0]!;
      view!.dispose();
      finish();
      await flush();
      expect(root.childNodes).toHaveLength(0);
      expect(cell.childNodes).toHaveLength(0);
      expect(document.querySelector('todo-app')).toBeNull();
    });

    it('given show() is pending on the repository, when disposed before it resolves, then nothing renders [HV-11]', async () => {
      let release!: (l: Layout) => void;
      const repository: LayoutRepository = {
        load: () => new Promise((resolve) => (release = resolve)),
        save: async () => {},
      };
      const done = show(repository);
      view!.dispose();
      release(defaultLayout(appIds));
      await done;
      await flush();
      expect(root.childNodes).toHaveLength(0);
      expect(importer).not.toHaveBeenCalled();
    });

    it('given a Save is pending, when disposed before it resolves, then nothing renders [HV-11]', async () => {
      let release!: () => void;
      const repository: LayoutRepository = {
        load: async (ids) => defaultLayout(ids),
        save: () => new Promise((resolve) => (release = resolve)),
      };
      await show(repository);
      await flush();
      button('Configure')!.click();
      button('Save')!.click();
      view!.dispose();
      release();
      await flush();
      expect(root.childNodes).toHaveLength(0);
    });
  });
});
