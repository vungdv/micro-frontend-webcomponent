import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAGS } from '@mf/contracts';
import manifest from '../custom-elements.json';
import pkg from '../package.json';

const STORAGE_KEY = 'timezone:settings';
const CSS_PROPERTIES = [
  '--mf-font-family',
  '--mf-color-primary',
  '--mf-color-error',
  '--mf-color-text',
  '--mf-color-border',
];

/**
 * Vue's own runtime markers on the global object (see the M2 todo contract test TD-25): `__VUE__`, the
 * `__VUE_*_SETTERS__` registries, and the development-build HMR and devtools hooks. They are framework
 * internals, not app state, so TZ-12 tolerates exactly these and nothing else.
 */
const VUE_RUNTIME_GLOBALS = new Set([
  '__VUE__',
  '__VUE_INSTANCE_SETTERS__',
  '__VUE_SSR_SETTERS__',
  '__VUE_HMR_RUNTIME__',
  '__VUE_DEVTOOLS_HOOK_REPLAY__',
]);

let windowKeysBeforeImport: Set<string>;
let nextTick: () => Promise<void>;

const declaration = manifest.modules.flatMap((m) => m.declarations).find((d) => d.tagName === TAGS.timezone);

interface StoredSettings {
  version: number;
  zones: string[];
  ranges: { id: string; start: string; end: string }[];
}

/**
 * Waits for the repository's awaited `load()` and Vue's scheduled re-render: a few awaited `nextTick()`
 * promises (microtasks only, never a timer).
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await nextTick();
}

async function mount(): Promise<HTMLElement> {
  const el = document.createElement(TAGS.timezone);
  document.body.append(el);
  await flush();
  return el;
}

function shadow(el: HTMLElement): ShadowRoot {
  if (!el.shadowRoot) throw new Error('no shadow root');
  return el.shadowRoot;
}

function text(node: Element | null | undefined): string {
  return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function button(scope: ParentNode, label: string): HTMLButtonElement | null {
  return [...scope.querySelectorAll('button')].find((b) => text(b) === label) ?? null;
}

function input(el: HTMLElement, selector: string): HTMLInputElement {
  const found = shadow(el).querySelector<HTMLInputElement>(selector);
  if (!found) throw new Error(`no input ${selector}`);
  return found;
}

function type(field: HTMLInputElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Zone column headers, home first: `{ id (title), label, offset }`. */
function columns(el: HTMLElement): { id: string; label: string; offset: string }[] {
  return [...shadow(el).querySelectorAll('th[scope="col"].tz-zone')].map((th) => ({
    id: th.getAttribute('title') ?? '',
    label: text(th.querySelector('.tz-zone__label')),
    offset: text(th.querySelector('.tz-zone__offset')),
  }));
}

function rows(el: HTMLElement): HTMLTableRowElement[] {
  return [...shadow(el).querySelectorAll<HTMLTableRowElement>('tbody tr.tz-row')];
}

/** Text of the range in row `row`, column `col` (0 = home). */
function cell(el: HTMLElement, row: number, col: number): string {
  return text(rows(el)[row]?.querySelectorAll('td')[col]?.querySelector('.tz-cell__range'));
}

function duration(el: HTMLElement, row: number): string {
  return text(rows(el)[row]?.querySelectorAll('td')[0]?.querySelector('.tz-cell__duration'));
}

function stored(): StoredSettings | null {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as StoredSettings | null;
}

function seed(settings: { zones?: string[]; ranges?: { id: string; start: string; end: string }[] }): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, zones: [], ranges: [], ...settings }));
}

async function addZone(el: HTMLElement, zone: string): Promise<void> {
  type(input(el, '.tz-zone-picker input'), zone);
  button(shadow(el).querySelector('.tz-zone-picker') as Element, 'Add')?.click();
  await flush();
}

async function addRange(el: HTMLElement, start: string, end: string): Promise<void> {
  type(input(el, '.tz-range-form input[name="start"]'), start);
  type(input(el, '.tz-range-form input[name="end"]'), end);
  button(shadow(el).querySelector('.tz-range-form') as Element, 'Add')?.click();
  await flush();
}

beforeAll(async () => {
  // Baseline before anything loads Vue, so TZ-12 sees every global the remote adds.
  windowKeysBeforeImport = new Set(Object.getOwnPropertyNames(window));
  await import('./web-component.ts');
  ({ nextTick } = await import('vue'));
});

beforeEach(() => {
  // Fake timers make the clock deterministic and let TZ-11 count pending timers; promises stay real.
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime('2026-11-12T03:00:00Z');
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks(); // first: a test may stub the localStorage getter
  document.body.replaceChildren();
  localStorage.clear();
  vi.useRealTimers();
});

describe('<timezone-app> contract', () => {
  it('given the module is imported twice, then timezone-app is defined once and a created element has an open shadow root with :host { display: block } [TZ-01]', async () => {
    const first = customElements.get(TAGS.timezone);
    expect(first).toBeDefined();
    vi.resetModules();
    await expect(import('./web-component.ts')).resolves.toBeDefined();
    expect(customElements.get(TAGS.timezone)).toBe(first);

    const el = document.createElement(TAGS.timezone);
    expect(el.shadowRoot?.mode).toBe('open');
    document.body.append(el);
    const css = el.shadowRoot?.querySelector('style')?.textContent ?? '';
    expect(css).toMatch(/^:host\s*\{\s*display:\s*block;?\s*\}/);
  });

  it('given a mounted element, when it is removed, then its shadow root is empty and no listeners or timers remain [TZ-11]', async () => {
    seed({ zones: ['America/New_York'], ranges: [{ id: 'r1', start: '09:00', end: '17:00' }] });
    const targets = [window, document, document.body];
    const added = targets.map((t) => vi.spyOn(t, 'addEventListener'));
    const removed = targets.map((t) => vi.spyOn(t, 'removeEventListener'));
    const el = await mount();
    await addZone(el, 'Asia/Kolkata');
    el.remove();
    await flush();
    expect(shadow(el).childNodes).toHaveLength(0);
    added.forEach((spy, i) => expect(spy.mock.calls.length).toBe(removed[i]?.mock.calls.length));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('given rendering, then document.head gains no style or link and window gains no own properties beyond the Vue markers [TZ-12]', async () => {
    const headBefore = document.head.querySelectorAll('style, link').length;
    const el = await mount();
    await addZone(el, 'America/New_York');
    await addRange(el, '09:00', '03:00');
    el.remove();
    expect(document.head.querySelectorAll('style, link')).toHaveLength(headBefore);
    const added = Object.getOwnPropertyNames(window).filter(
      (name) => !windowKeysBeforeImport.has(name) && !VUE_RUNTIME_GLOBALS.has(name),
    );
    expect(added).toEqual([]);
  });

  it('given custom-elements.json, then it documents the timezone-app tag and its CSS custom properties, and package.json customElements resolves to it [TZ-13]', () => {
    const jsonFiles = import.meta.glob<{ default: unknown }>('../*.json', { eager: true });
    expect(pkg.customElements).toBe('custom-elements.json');
    expect(jsonFiles[`../${pkg.customElements}`]?.default).toEqual(manifest);
    expect(declaration?.tagName).toBe(TAGS.timezone);
    expect(declaration?.cssProperties?.map((p) => p.name)).toEqual(CSS_PROPERTIES);
  });
});

describe('<timezone-app> conversions', () => {
  it('given empty storage, when appended, then the home column reads Ho Chi Minh (you) / UTC+07:00, the reference date is 2026-11-12 and the empty state is shown [TZ-02]', async () => {
    const el = await mount();
    expect(columns(el)).toEqual([{ id: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh (you)', offset: 'UTC+07:00' }]);
    expect(input(el, 'input[type="date"]').value).toBe('2026-11-12');
    expect(text(shadow(el).querySelector('.tz-empty'))).toBe('Add a time range to get started');
    expect(rows(el)).toHaveLength(0);
    const home = shadow(el).querySelector('th.tz-zone');
    expect(home && button(home, 'Remove')).toBeNull();
  });

  it('given America/New_York is added, then a New York / UTC-05:00 column appears and timezone:settings lists it [TZ-03]', async () => {
    const el = await mount();
    await addZone(el, 'America/New_York');
    expect(columns(el)[1]).toEqual({ id: 'America/New_York', label: 'New York', offset: 'UTC-05:00' });
    expect(stored()?.zones).toEqual(['America/New_York']);
    expect(input(el, '.tz-zone-picker input').value).toBe('');
  });

  it('given Mars/Olympus is submitted, then Unknown time zone is shown and storage is unchanged [TZ-04]', async () => {
    const el = await mount();
    await addZone(el, 'Mars/Olympus');
    expect(text(shadow(el).querySelector('.tz-zone-picker [role="alert"]'))).toBe('Unknown time zone');
    expect(columns(el)).toHaveLength(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('given the home zone is submitted, then Already added is shown and storage is unchanged [TZ-04]', async () => {
    seed({ zones: ['Europe/London'] });
    const before = localStorage.getItem(STORAGE_KEY);
    const el = await mount();
    await addZone(el, 'asia/ho_chi_minh');
    expect(text(shadow(el).querySelector('.tz-zone-picker [role="alert"]'))).toBe('Already added');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('given New York added, when range 09:00–03:00 is added, then the home cell reads 9:00 AM – 3:00 AM (+1d) with 18h and New York reads 9:00 PM (-1d) – 3:00 PM [TZ-05]', async () => {
    const el = await mount();
    await addZone(el, 'America/New_York');
    await addRange(el, '09:00', '03:00');
    expect(rows(el)).toHaveLength(1);
    expect(cell(el, 0, 0)).toBe('9:00 AM – 3:00 AM (+1d)');
    expect(duration(el, 0)).toBe('18h');
    expect(cell(el, 0, 1)).toBe('9:00 PM (-1d) – 3:00 PM');
    expect(rows(el)[0]?.querySelector('th[scope="row"]')).not.toBeNull();
    expect(stored()?.ranges).toEqual([{ id: expect.any(String), start: '09:00', end: '03:00' }]);
  });

  it('given an end before the start, when typed, then the "ends next day" hint is shown before submit [TZ-14]', async () => {
    const el = await mount();
    type(input(el, '.tz-range-form input[name="start"]'), '22:00');
    type(input(el, '.tz-range-form input[name="end"]'), '00:00');
    await flush();
    expect(text(shadow(el).querySelector('.tz-range-form__hint'))).toBe('ends next day');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('given start = end, when submitted, then Start and end must differ is shown and no row is added [TZ-06]', async () => {
    const el = await mount();
    await addRange(el, '10:00', '10:00');
    expect(text(shadow(el).querySelector('.tz-range-form [role="alert"]'))).toBe('Start and end must differ');
    expect(rows(el)).toHaveLength(0);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('given the range form, then Start and End are prefilled 09:00–17:00; when End is incomplete and submitted, then only End is marked invalid; after a valid add the values are kept [TZ-16]', async () => {
    const el = await mount();
    const start = input(el, '.tz-range-form input[name="start"]');
    const end = input(el, '.tz-range-form input[name="end"]');
    expect([start.value, end.value]).toEqual(['09:00', '17:00']);

    type(end, ''); // a partially typed time input reports ""
    button(shadow(el).querySelector('.tz-range-form') as Element, 'Add')?.click();
    await flush();
    expect(text(shadow(el).querySelector('.tz-range-form [role="alert"]'))).toBe('Enter a valid time');
    expect(start.getAttribute('aria-invalid')).toBeNull();
    expect(end.getAttribute('aria-invalid')).toBe('true');
    expect(rows(el)).toHaveLength(0);

    await addRange(el, '09:00', '17:00');
    expect(rows(el)).toHaveLength(1);
    expect([start.value, end.value]).toEqual(['09:00', '17:00']);
  });

  it('given ranges but no added zones, when rendered, then only the home column and the Add a time zone to compare hint show [TZ-15]', async () => {
    seed({ ranges: [{ id: 'r1', start: '09:00', end: '17:00' }] });
    const el = await mount();
    expect(columns(el)).toHaveLength(1);
    expect(rows(el)).toHaveLength(1);
    expect(text(shadow(el).querySelector('.tz-empty'))).toBe('Add a time zone to compare');
  });

  it('given a zone and a range, when each Remove is clicked, then the column and the row disappear and storage is updated [TZ-07]', async () => {
    seed({
      zones: ['America/New_York', 'Asia/Kolkata'],
      ranges: [
        { id: 'r1', start: '09:00', end: '17:00' },
        { id: 'r2', start: '22:00', end: '00:00' },
      ],
    });
    const el = await mount();
    const newYork = shadow(el).querySelector('th[title="America/New_York"]');
    button(newYork as Element, 'Remove')?.click();
    await flush();
    expect(columns(el).map((c) => c.id)).toEqual(['Asia/Ho_Chi_Minh', 'Asia/Kolkata']);
    expect(stored()?.zones).toEqual(['Asia/Kolkata']);

    button(rows(el)[0]?.querySelector('th[scope="row"]') as Element, 'Remove')?.click();
    await flush();
    expect(rows(el)).toHaveLength(1);
    expect(cell(el, 0, 1)).toBe('8:30 PM – 10:30 PM');
    expect(stored()?.ranges).toEqual([{ id: 'r2', start: '22:00', end: '00:00' }]);
  });

  it('given Europe/London and 07:00–10:00, when the reference date is 2026-03-29, then the cell reads 12:00 AM – 4:00 AM and storage is unchanged; when Today is clicked, then 12:00 AM – 3:00 AM [TZ-08]', async () => {
    seed({ zones: ['Europe/London'], ranges: [{ id: 'r1', start: '07:00', end: '10:00' }] });
    const before = localStorage.getItem(STORAGE_KEY);
    const el = await mount();
    expect(cell(el, 0, 1)).toBe('12:00 AM – 3:00 AM');

    type(input(el, 'input[type="date"]'), '2026-03-29');
    await flush();
    expect(cell(el, 0, 1)).toBe('12:00 AM – 4:00 AM');
    expect(columns(el)[1]?.offset).toBe('UTC+01:00');
    expect(duration(el, 0)).toBe('3h');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);

    button(shadow(el), 'Today')?.click();
    await flush();
    expect(input(el, 'input[type="date"]').value).toBe('2026-11-12');
    expect(cell(el, 0, 1)).toBe('12:00 AM – 3:00 AM');
    expect(columns(el)[1]?.offset).toBe('UTC+00:00');
  });

  it('given settings in storage, when appended, then they render; when removed and a new element is appended, then they render again [TZ-09]', async () => {
    seed({ zones: ['America/New_York'], ranges: [{ id: 'r1', start: '09:00', end: '03:00' }] });
    const first = await mount();
    expect(columns(first).map((c) => c.id)).toEqual(['Asia/Ho_Chi_Minh', 'America/New_York']);
    expect(cell(first, 0, 1)).toBe('9:00 PM (-1d) – 3:00 PM');
    await addZone(first, 'Asia/Kathmandu');
    first.remove();

    const second = await mount();
    expect(columns(second).map((c) => c.id)).toEqual(['Asia/Ho_Chi_Minh', 'America/New_York', 'Asia/Kathmandu']);
    expect(cell(second, 0, 2)).toBe('7:45 AM – 1:45 AM (+1d)');
  });

  it('given the home zone is a stored zone (the user travelled into it), when appended, then it is kept in storage and shown once [TZ-09]', async () => {
    seed({ zones: ['America/New_York', 'Asia/Ho_Chi_Minh'], ranges: [{ id: 'r1', start: '09:00', end: '17:00' }] });
    const el = await mount();
    expect(columns(el).map((c) => c.id)).toEqual(['Asia/Ho_Chi_Minh', 'America/New_York']);
    expect(rows(el)[0]?.querySelectorAll('td')).toHaveLength(2);
    await addRange(el, '20:00', '21:00');
    expect(stored()?.zones).toEqual(['America/New_York', 'Asia/Ho_Chi_Minh']);
  });

  it('given reading localStorage throws (SecurityError), when appended, then defaults render and nothing throws [TZ-10]', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent): void => void errors.push(event.error);
    window.addEventListener('error', onError);
    const el = await mount();
    await addZone(el, 'America/New_York');
    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
    expect(columns(el).map((c) => c.id)).toEqual(['Asia/Ho_Chi_Minh', 'America/New_York']);
    expect(text(shadow(el).querySelector('.tz-empty'))).toBe('Add a time range to get started');
    expect(warn).toHaveBeenCalled();
  });

  it('given an invalid date is typed, when the input fires, then the input shows the current reference date again [TZ-08]', async () => {
    const el = await mount();
    const date = input(el, 'input[type="date"]');
    type(date, '2026-03-29');
    await flush();
    type(date, '');
    await flush();
    expect(date.value).toBe('2026-03-29');
  });

  it('given corrupt timezone:settings, when appended, then defaults render and nothing throws [TZ-10]', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, '{not json');
    const el = await mount();
    expect(columns(el)).toHaveLength(1);
    expect(text(shadow(el).querySelector('.tz-empty'))).toBe('Add a time range to get started');
    expect(warn).toHaveBeenCalled();
  });
});
