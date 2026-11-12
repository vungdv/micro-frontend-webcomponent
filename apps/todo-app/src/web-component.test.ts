import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MF_NAVIGATE, TAGS, type MfNavigateDetail } from '@mf/contracts';
import manifest from '../custom-elements.json';

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

beforeAll(async () => {
  await import('./web-component.ts');
});

afterEach(() => {
  document.body.replaceChildren();
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

  it('given a mounted element, when weather-route changes, then the link is re-rendered with the new route [TD-07]', () => {
    const el = mount({ 'weather-route': '#/weather' });
    el.setAttribute('weather-route', '#/forecast');
    expect(link(el)?.getAttribute('href')).toBe('#/forecast');
  });

  it('given a mounted link, when weather-route is removed, then the link is removed [TD-08]', () => {
    const el = mount({ 'weather-route': '#/weather' });
    el.removeAttribute('weather-route');
    expect(link(el)).toBeNull();
  });

  it('given the weatherRoute property, when it is set, then it reflects to the weather-route attribute [TD-09]', () => {
    const el = mount() as HTMLElement & { weatherRoute: string | null };
    el.weatherRoute = '#/weather';
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
});
