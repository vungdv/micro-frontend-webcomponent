import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TAGS } from '@mf/contracts';
import manifest from '../custom-elements.json';

const declaration = manifest.modules
  .flatMap((m) => m.declarations)
  .find((d) => d.tagName === TAGS.weather);

function mount(attributes: Record<string, string> = {}): HTMLElement & { units: string } {
  const el = document.createElement(TAGS.weather) as HTMLElement & { units: string };
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  document.body.append(el);
  return el;
}

function shownUnits(el: HTMLElement): string | undefined {
  return el.shadowRoot?.querySelector('[data-testid="units"]')?.textContent ?? undefined;
}

beforeAll(async () => {
  await import('./web-component.ts');
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('<weather-dashboard> contract', () => {
  it('given the module is imported twice, when it re-evaluates, then the guarded define does not throw and keeps the first class [WE-04]', async () => {
    const first = customElements.get(TAGS.weather);
    expect(first).toBeDefined();
    vi.resetModules();
    await expect(import('./web-component.ts')).resolves.toBeDefined();
    expect(customElements.get(TAGS.weather)).toBe(first);
  });

  it('given units="imperial", when the element is appended, then an open shadow root shows the placeholder and imperial [WE-05]', () => {
    const el = mount({ units: 'imperial' });
    expect(el.shadowRoot?.textContent).toContain('Weather placeholder');
    expect(shownUnits(el)).toBe('imperial');
    expect(el.units).toBe('imperial');
  });

  it('given shadow styles, when rendered, then they start with :host display rules [WE-06]', () => {
    const el = mount();
    const css = el.shadowRoot?.querySelector('style')?.textContent ?? '';
    expect(css.startsWith(':host{display:block}:host([hidden]){display:none}')).toBe(true);
  });

  it('given no units attribute, when the element is appended, then it renders metric [WE-07]', () => {
    const el = mount();
    expect(shownUnits(el)).toBe('metric');
    expect(el.units).toBe('metric');
  });

  it('given a mounted element, when units changes to imperial, then it re-renders with imperial [WE-08]', () => {
    const el = mount({ units: 'metric' });
    el.setAttribute('units', 'imperial');
    expect(shownUnits(el)).toBe('imperial');
  });

  it('given an unknown units value, when it is set, then it falls back to metric with a console.warn [WE-09]', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = mount({ units: 'kelvin' });
    expect(shownUnits(el)).toBe('metric');
    expect(el.units).toBe('metric');
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('kelvin');
  });

  it('given the units property, when it is set, then it reflects to the units attribute and re-renders [WE-10]', () => {
    const el = mount();
    el.units = 'imperial';
    expect(el.getAttribute('units')).toBe('imperial');
    expect(shownUnits(el)).toBe('imperial');
  });

  it('given a mounted element, when it is removed and re-appended, then it renders again without errors [WE-11]', () => {
    const el = mount({ units: 'imperial' });
    el.remove();
    document.body.append(el);
    expect(shownUnits(el)).toBe('imperial');
  });

  it('given the contract tests, when custom-elements.json is read, then the tag and units attribute are documented [WE-12]', () => {
    expect(declaration).toBeDefined();
    expect(declaration?.attributes?.map((a) => a.name)).toContain('units');
  });
});
