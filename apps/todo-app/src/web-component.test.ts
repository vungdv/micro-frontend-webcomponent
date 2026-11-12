import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MF_NAVIGATE, TAGS, type MfNavigateDetail } from '@mf/contracts';
import manifest from '../custom-elements.json';
import pkg from '../package.json';

const STORAGE_KEY = 'todos:list';

/**
 * Vue's own runtime markers on the global object, written by every bundled Vue copy: `__VUE__` (devtools
 * detection) and the `__VUE_*_SETTERS__` registries (shared by Vue copies by design); `__VUE_HMR_RUNTIME__`
 * and `__VUE_DEVTOOLS_HOOK_REPLAY__` exist only in Vue's development build, which the tests run against.
 * They are framework internals, not app state, so TD-25 tolerates exactly these and nothing else.
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

const declaration = manifest.modules
  .flatMap((m) => m.declarations)
  .find((d) => d.tagName === TAGS.todo);

function mount(attributes: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(TAGS.todo);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  document.body.append(el);
  return el;
}

function link(el: HTMLElement): HTMLAnchorElement | null {
  return el.shadowRoot?.querySelector('a') ?? null;
}

function recordNavigations(): { events: CustomEvent<MfNavigateDetail>[]; stop: () => void } {
  const events: CustomEvent<MfNavigateDetail>[] = [];
  const listener = (e: Event): void => {
    events.push(e as CustomEvent<MfNavigateDetail>);
  };
  window.addEventListener(MF_NAVIGATE, listener);
  return { events, stop: () => window.removeEventListener(MF_NAVIGATE, listener) };
}

/** Waits for Vue's scheduled re-render (an awaited promise, no timers). */
const flush = (): Promise<void> => nextTick();

function shadow(el: HTMLElement): ShadowRoot {
  if (!el.shadowRoot) throw new Error('no shadow root');
  return el.shadowRoot;
}

function items(el: HTMLElement): HTMLLIElement[] {
  return [...shadow(el).querySelectorAll('li')];
}

function titles(el: HTMLElement): string[] {
  return items(el).map((li) => li.querySelector('.todo-item__title')?.textContent ?? '');
}

function button(scope: ParentNode, text: string): HTMLButtonElement | null {
  return [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) ?? null;
}

function counter(el: HTMLElement): string | null {
  return shadow(el).querySelector('.todo__count')?.textContent?.trim() ?? null;
}

function stored(): unknown {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
}

function seed(todos: { id: string; title: string; done: boolean }[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function submitTitle(el: HTMLElement, title: string): Promise<void> {
  const input = shadow(el).querySelector<HTMLInputElement>('form input');
  if (!input) throw new Error('no title input');
  type(input, title);
  button(shadow(el), 'Add')?.click();
  await flush();
}

async function key(target: Element, keyName: string): Promise<void> {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true }));
  await flush();
}

beforeAll(async () => {
  // Baseline before anything loads Vue, so TD-25 sees every global the remote adds.
  windowKeysBeforeImport = new Set(Object.getOwnPropertyNames(window));
  await import('./web-component.ts');
  ({ nextTick } = await import('vue'));
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('<todo-app> contract', () => {
  it('given the module is imported, when the tag is looked up, then <todo-app> is defined [TD-01]', () => {
    expect(customElements.get(TAGS.todo)).toBeDefined();
  });

  it('given the module is imported twice, when it re-evaluates, then the guarded define does not throw and keeps the first class [TD-02]', async () => {
    const first = customElements.get(TAGS.todo);
    vi.resetModules();
    await expect(import('./web-component.ts')).resolves.toBeDefined();
    expect(customElements.get(TAGS.todo)).toBe(first);
  });

  it('given a weather-route attribute, when the element is appended, then an open shadow root shows the link to that route [TD-03]', () => {
    const el = mount({ 'weather-route': '#/weather' });
    expect(el.shadowRoot).not.toBeNull();
    const a = link(el);
    expect(a?.textContent).toBe('Nothing to do. Check the weather?');
    expect(a?.getAttribute('href')).toBe('#/weather');
  });

  it('given shadow styles, when rendered, then they start with :host display rules [TD-04]', () => {
    const el = mount();
    const css = el.shadowRoot?.querySelector('style')?.textContent ?? '';
    expect(css.startsWith(':host{display:block}:host([hidden]){display:none}')).toBe(true);
  });

  it('given no weather-route attribute, when the element is appended, then no link is rendered [TD-05]', () => {
    const el = mount();
    expect(link(el)).toBeNull();
  });

  it('given a mounted link, when it is clicked, then mf:navigate reaches a window listener with bubbles, composed and the route as path [TD-06]', () => {
    const el = mount({ 'weather-route': '#/weather' });
    const nav = recordNavigations();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    link(el)?.dispatchEvent(click);
    nav.stop();
    expect(nav.events).toHaveLength(1);
    const [event] = nav.events;
    expect(event?.detail).toEqual({ path: '#/weather' });
    expect(event?.bubbles).toBe(true);
    expect(event?.composed).toBe(true);
    expect(event?.target).toBe(el);
    expect(click.defaultPrevented).toBe(true);
  });

  it('given a mounted element, when weather-route changes, then the link is re-rendered with the new route [TD-07]', async () => {
    const el = mount({ 'weather-route': '#/weather' });
    el.setAttribute('weather-route', '#/forecast');
    await flush();
    expect(link(el)?.getAttribute('href')).toBe('#/forecast');
  });

  it('given a mounted link, when weather-route is removed, then the link is removed [TD-08]', async () => {
    const el = mount({ 'weather-route': '#/weather' });
    el.removeAttribute('weather-route');
    await flush();
    expect(link(el)).toBeNull();
  });

  it('given the weatherRoute property, when it is set, then it reflects to the weather-route attribute [TD-09]', async () => {
    const el = mount() as HTMLElement & { weatherRoute: string | null };
    el.weatherRoute = '#/weather';
    await flush();
    expect(el.getAttribute('weather-route')).toBe('#/weather');
    expect(link(el)?.getAttribute('href')).toBe('#/weather');
  });

  it('given a mounted element, when it is removed, then clicking its detached link dispatches no mf:navigate [TD-10]', () => {
    const el = mount({ 'weather-route': '#/weather' });
    const a = link(el);
    el.remove();
    // Listen on the element itself: a detached element's events never reach window anyway.
    const onNavigate = vi.fn();
    el.addEventListener(MF_NAVIGATE, onNavigate);
    a?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('given an element moved within the document, when connectedCallback runs again, then a click dispatches exactly one event [TD-11]', () => {
    const el = mount({ 'weather-route': '#/weather' });
    const other = document.createElement('div');
    document.body.append(other);
    other.append(el); // move: disconnected + connected
    (el as HTMLElement & { connectedCallback(): void }).connectedCallback(); // extra call must be a no-op for listeners
    const nav = recordNavigations();
    link(el)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    nav.stop();
    expect(nav.events).toHaveLength(1);
  });

  it('given the contract tests, when custom-elements.json is read, then the tag, weather-route attribute and mf:navigate event are documented [TD-12]', () => {
    expect(declaration).toBeDefined();
    expect(declaration?.attributes?.map((a) => a.name)).toContain('weather-route');
    expect(declaration?.events?.map((e) => e.name)).toContain(MF_NAVIGATE);
  });

  it('given custom-elements.json, then package.json customElements resolves to it and it documents the tag, weather-route and mf:navigate [TD-26]', () => {
    const jsonFiles = import.meta.glob<{ default: unknown }>('../*.json', { eager: true });
    expect(pkg.customElements).toBe('custom-elements.json');
    expect(jsonFiles[`../${pkg.customElements}`]?.default).toEqual(manifest);
    expect(declaration?.tagName).toBe(TAGS.todo);
    expect(declaration?.attributes?.map((a) => a.name)).toEqual(['weather-route']);
    expect(declaration?.events?.map((e) => e.name)).toEqual([MF_NAVIGATE]);
  });
});

describe('<todo-app> todo list', () => {
  it('given an empty list, when a title is submitted, then one item is rendered, the counter reads 1 item left and todos:list holds it [TD-13]', async () => {
    const el = mount();
    await submitTitle(el, '  Buy milk  ');
    expect(titles(el)).toEqual(['Buy milk']);
    expect(counter(el)).toBe('1 item left');
    expect(stored()).toEqual([{ id: expect.any(String), title: 'Buy milk', done: false }]);
    expect(shadow(el).querySelector<HTMLInputElement>('form input')?.value).toBe('');
    expect(shadow(el).querySelector<HTMLInputElement>('form input')?.getAttribute('maxlength')).toBe('200');
  });

  it('given a whitespace-only title, when submitted, then no item is added and "Title is required" is shown [TD-14]', async () => {
    const el = mount();
    await submitTitle(el, '   ');
    expect(items(el)).toHaveLength(0);
    expect(shadow(el).textContent).toContain('Title is required');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('given a title over 200 characters, when submitted, then no item is added and "Max 200 characters" is shown [TD-14]', async () => {
    const el = mount();
    await submitTitle(el, 'x'.repeat(201));
    expect(items(el)).toHaveLength(0);
    expect(shadow(el).textContent).toContain('Max 200 characters');
  });

  it('given an item, when its checkbox is toggled, then the counter reads 0 items left, the item is marked done and storage is updated [TD-15]', async () => {
    seed([{ id: '1', title: 'Buy milk', done: false }]);
    const el = mount();
    shadow(el).querySelector<HTMLInputElement>('li input[type="checkbox"]')?.click();
    await flush();
    expect(counter(el)).toBe('0 items left');
    expect(shadow(el).querySelector<HTMLInputElement>('li input[type="checkbox"]')?.checked).toBe(true);
    expect(items(el)[0]?.classList.contains('todo-item--done')).toBe(true);
    expect(stored()).toEqual([{ id: '1', title: 'Buy milk', done: true }]);
  });

  it('given an item, when edited inline and Enter is pressed, then the new trimmed title is rendered and stored [TD-16]', async () => {
    seed([{ id: '1', title: 'Buy milk', done: false }]);
    const el = mount();
    shadow(el).querySelector('.todo-item__title')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    const edit = shadow(el).querySelector<HTMLInputElement>('li input.todo-item__edit');
    expect(edit?.value).toBe('Buy milk');
    if (!edit) throw new Error('no edit input');
    type(edit, '  Buy oat milk  ');
    await key(edit, 'Enter');
    expect(shadow(el).querySelector('li input.todo-item__edit')).toBeNull();
    expect(titles(el)).toEqual(['Buy oat milk']);
    expect(stored()).toEqual([{ id: '1', title: 'Buy oat milk', done: false }]);
  });

  it('given an item in edit mode, when Enter is pressed during IME composition, then the edit stays open and nothing is stored [TD-16]', async () => {
    seed([{ id: '1', title: 'Buy milk', done: false }]);
    const el = mount();
    button(items(el)[0] as HTMLLIElement, 'Edit')?.click();
    await flush();
    const edit = shadow(el).querySelector<HTMLInputElement>('li input.todo-item__edit');
    if (!edit) throw new Error('no edit input');
    type(edit, 'Buy oat milk');
    edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
    await flush();
    expect(shadow(el).querySelector('li input.todo-item__edit')).not.toBeNull();
    expect(stored()).toEqual([{ id: '1', title: 'Buy milk', done: false }]);
  });

  it('given an item in edit mode, when Escape is pressed, then the old title is kept [TD-17]', async () => {
    seed([{ id: '1', title: 'Buy milk', done: false }]);
    const el = mount();
    button(items(el)[0] as HTMLLIElement, 'Edit')?.click();
    await flush();
    const edit = shadow(el).querySelector<HTMLInputElement>('li input.todo-item__edit');
    if (!edit) throw new Error('no edit input');
    type(edit, 'Something else');
    await key(edit, 'Escape');
    expect(shadow(el).querySelector('li input.todo-item__edit')).toBeNull();
    expect(titles(el)).toEqual(['Buy milk']);
    expect(stored()).toEqual([{ id: '1', title: 'Buy milk', done: false }]);
  });

  it('given an item in edit mode, when an empty title is committed on blur, then the old title is kept [TD-17]', async () => {
    seed([{ id: '1', title: 'Buy milk', done: false }]);
    const el = mount();
    button(items(el)[0] as HTMLLIElement, 'Edit')?.click();
    await flush();
    const edit = shadow(el).querySelector<HTMLInputElement>('li input.todo-item__edit');
    if (!edit) throw new Error('no edit input');
    type(edit, '   ');
    edit.dispatchEvent(new FocusEvent('blur'));
    await flush();
    expect(shadow(el).querySelector('li input.todo-item__edit')).toBeNull();
    expect(titles(el)).toEqual(['Buy milk']);
    expect(stored()).toEqual([{ id: '1', title: 'Buy milk', done: false }]);
  });

  it('given an item, when Delete is clicked, then it is removed from the DOM and storage [TD-18]', async () => {
    seed([
      { id: '1', title: 'Keep', done: false },
      { id: '2', title: 'Drop', done: false },
    ]);
    const el = mount();
    const row = items(el)[1] as HTMLLIElement;
    expect(button(row, 'Edit')?.getAttribute('aria-label')).toBe('Edit Drop');
    expect(button(row, 'Delete')?.getAttribute('aria-label')).toBe('Delete Drop');
    button(row, 'Delete')?.click();
    await flush();
    expect(titles(el)).toEqual(['Keep']);
    expect(stored()).toEqual([{ id: '1', title: 'Keep', done: false }]);
  });

  it('given one active and one done item, when the Active / Done / All filters are clicked, then only matching items show and the active filter is pressed [TD-19]', async () => {
    seed([
      { id: '1', title: 'Active one', done: false },
      { id: '2', title: 'Done one', done: true },
    ]);
    const el = mount();
    const root = shadow(el);
    const pressed = (): string[] =>
      [...root.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent?.trim() ?? '');

    expect(pressed()).toEqual(['All']);
    button(root, 'Active')?.click();
    await flush();
    expect(titles(el)).toEqual(['Active one']);
    expect(pressed()).toEqual(['Active']);

    button(root, 'Done')?.click();
    await flush();
    expect(titles(el)).toEqual(['Done one']);
    expect(pressed()).toEqual(['Done']);
    expect(button(root, 'Active')?.getAttribute('aria-pressed')).toBe('false');

    button(root, 'All')?.click();
    await flush();
    expect(titles(el)).toEqual(['Active one', 'Done one']);
    expect(pressed()).toEqual(['All']);
  });

  it('given done items, when "Clear completed" is clicked, then only active items remain [TD-20]', async () => {
    seed([
      { id: '1', title: 'Active', done: false },
      { id: '2', title: 'Done A', done: true },
      { id: '3', title: 'Done B', done: true },
    ]);
    const el = mount();
    button(shadow(el), 'Clear completed')?.click();
    await flush();
    expect(titles(el)).toEqual(['Active']);
    expect(stored()).toEqual([{ id: '1', title: 'Active', done: false }]);
    expect(button(shadow(el), 'Clear completed')).toBeNull();
  });

  it('given no done items, when rendered, then the "Clear completed" button is not rendered [TD-20]', () => {
    seed([{ id: '1', title: 'Active', done: false }]);
    const el = mount();
    expect(button(shadow(el), 'Clear completed')).toBeNull();
  });

  it('given todos in todos:list, when the element is appended, then they are rendered [TD-21]', () => {
    seed([
      { id: '1', title: 'One', done: false },
      { id: '2', title: 'Two', done: true },
    ]);
    const el = mount();
    expect(titles(el)).toEqual(['One', 'Two']);
    expect(counter(el)).toBe('1 item left');
  });

  it('given a mounted element with todos, when it is removed and a new <todo-app> is appended, then the same todos are rendered [TD-22]', async () => {
    const first = mount();
    await submitTitle(first, 'First');
    await submitTitle(first, 'Second');
    first.remove();
    const second = mount();
    expect(titles(second)).toEqual(['First', 'Second']);
  });

  it('given a non-empty list and weather-route set, when the last todo is deleted, then the weather link appears [TD-23]', async () => {
    seed([{ id: '1', title: 'Only', done: false }]);
    const el = mount({ 'weather-route': '#/weather' });
    expect(link(el)).toBeNull();
    button(items(el)[0] as HTMLLIElement, 'Delete')?.click();
    await flush();
    expect(link(el)?.textContent).toBe('Nothing to do. Check the weather?');
    expect(link(el)?.getAttribute('href')).toBe('#/weather');
  });

  it('given a filtered view that is empty but a non-empty list, when rendered, then the empty state is not shown [TD-23]', async () => {
    seed([{ id: '1', title: 'Active', done: false }]);
    const el = mount({ 'weather-route': '#/weather' });
    button(shadow(el), 'Done')?.click();
    await flush();
    expect(items(el)).toHaveLength(0);
    expect(link(el)).toBeNull();
  });

  it('given no weather-route and an empty list, when rendered, then a neutral "No todos yet" message is shown [TD-23]', () => {
    const el = mount();
    expect(shadow(el).textContent).toContain('No todos yet');
    expect(link(el)).toBeNull();
  });

  it('given a mounted element, when it is removed, then its shadow root has no Vue content left and later attribute changes do not throw [TD-24]', async () => {
    seed([{ id: '1', title: 'One', done: false }]);
    const el = mount({ 'weather-route': '#/weather' });
    el.remove();
    expect(shadow(el).childNodes).toHaveLength(0);
    expect(() => el.setAttribute('weather-route', '#/elsewhere')).not.toThrow();
    expect(() => el.removeAttribute('weather-route')).not.toThrow();
    await flush();
    expect(shadow(el).childNodes).toHaveLength(0);
  });

  it('given rendering, then document.head gains no style or link nodes and window gains no new own properties [TD-25]', async () => {
    const headBefore = document.head.querySelectorAll('style, link').length;
    const el = mount({ 'weather-route': '#/weather' });
    await submitTitle(el, 'One');
    button(shadow(el), 'Done')?.click();
    await flush();
    el.remove();
    expect(document.head.querySelectorAll('style, link')).toHaveLength(headBefore);
    const added = Object.getOwnPropertyNames(window).filter(
      (name) => !windowKeysBeforeImport.has(name) && !VUE_RUNTIME_GLOBALS.has(name),
    );
    expect(added).toEqual([]);
  });
});
