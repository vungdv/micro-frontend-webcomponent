import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// The component is a plain script (not a module), so we run it the same way
// the browser does: as global code. Indirect eval `(0, eval)` runs in global scope.
const loadScript = (path) =>
  (0, eval)(readFileSync(new URL(path, import.meta.url), 'utf8'));

describe('<counter-button> (OOP)', () => {
  beforeAll(() => {
    loadScript('./counter-button.js');
  });

  beforeEach(() => {
    document.body.innerHTML = ''; // remove elements from earlier tests first
    vi.restoreAllMocks(); // undo any mocks from earlier tests
    vi.spyOn(console, 'log').mockImplementation(() => {}); // silence + record lifecycle logs
  });

  // Helper: put a fresh element on the page and return it with its button.
  const mount = () => {
    const el = document.createElement('counter-button');
    document.body.appendChild(el);
    return { el, button: () => el.shadowRoot.querySelector('button') };
  };

  it('is registered as a custom element', () => {
    expect(customElements.get('counter-button')).toBeDefined();
  });

  it('renders a button starting at 10 inside an open shadow root', () => {
    const { el, button } = mount();
    expect(el.shadowRoot).not.toBeNull();
    expect(button().textContent).toBe('10');
  });

  it('increments by one on each click', () => {
    const { button } = mount();
    button().click();
    expect(button().textContent).toBe('11');
    button().click();
    button().click();
    expect(button().textContent).toBe('13');
  });

  it('keeps each instance independent', () => {
    const a = mount();
    const b = mount();
    a.button().click();
    expect(a.button().textContent).toBe('11');
    expect(b.button().textContent).toBe('10');
  });

  it('runs lifecycle callbacks in order', () => {
    const { el } = mount();
    el.remove();
    expect(console.log.mock.calls.map((c) => c[0])).toEqual([
      'constructed',
      'connected',
      'disconnected',
    ]);
  });
});
