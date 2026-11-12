import { beforeEach, describe, expect, it } from 'vitest';
import type { AppEntry, HostConfig } from '@mf/contracts';
import { Outlet } from './outlet.ts';
import type { HostEvent } from '../mediator/types.ts';

/** Test remotes that record what they saw on connect and that they were disconnected. */
const log: string[] = [];
class Probe extends HTMLElement {
  connectedCallback() {
    const attrs = this.getAttributeNames().map((n) => `${n}=${this.getAttribute(n)}`).join(',');
    log.push(`${this.localName} connected [${attrs}]`);
  }
  disconnectedCallback() {
    log.push(`${this.localName} disconnected`);
  }
}
customElements.define('outlet-probe-a', class extends Probe {});
customElements.define('outlet-probe-b', class extends Probe {});

const a: AppEntry = {
  route: '#/a', url: 'http://a/a.js', tag: 'outlet-probe-a',
  attributes: { 'weather-route': '#/weather', units: 'metric' },
};
const b: AppEntry = { route: '#/b', url: 'http://b/b.js', tag: 'outlet-probe-b' };
const apps: HostConfig['apps'] = { a, b };

describe('Outlet', () => {
  let root: HTMLElement;
  let events: HostEvent[];
  let outlet: Outlet;

  beforeEach(() => {
    document.body.innerHTML = '<main id="mf-outlet"></main>';
    log.length = 0;
    root = document.getElementById('mf-outlet')!;
    events = [];
    outlet = new Outlet(root, (e) => events.push(e));
  });

  it('given an entry with attributes, when mount(), then attributes are set before the element connects [TR-50]', () => {
    outlet.mount(a);
    expect(log).toEqual(['outlet-probe-a connected [weather-route=#/weather,units=metric]']);
    expect(root.children).toHaveLength(1);
    expect(root.firstElementChild?.localName).toBe('outlet-probe-a');
  });

  it('given an entry without attributes, when mount(), then the element is mounted with none [TR-50]', () => {
    outlet.mount(b);
    expect(log).toEqual(['outlet-probe-b connected []']);
  });

  it('given app A is mounted, when app B is mounted, then A is removed and disconnected first [TR-51]', () => {
    outlet.mount(a);
    outlet.mount(b);
    expect(log.slice(1)).toEqual(['outlet-probe-a disconnected', 'outlet-probe-b connected []']);
    expect([...root.children].map((c) => c.localName)).toEqual(['outlet-probe-b']);
  });

  it.each([
    ['showLoading', (o: Outlet) => o.showLoading(b)],
    ['showHome', (o: Outlet) => o.showHome(apps)],
    ['showNotFound', (o: Outlet) => o.showNotFound('#/x')],
    ['showError', (o: Outlet) => o.showError('route', 'x', true)],
  ])('given an app is mounted, when %s(), then the app element is removed [TR-52]', (_name, show) => {
    outlet.mount(a);
    show(outlet);
    expect(log.at(-1)).toBe('outlet-probe-a disconnected');
    expect(root.querySelector('outlet-probe-a')).toBeNull();
  });

  it('given showLoading(entry), then it shows a busy status naming the app [TR-52]', () => {
    outlet.showLoading(b);
    const status = root.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-busy')).toBe('true');
    expect(status?.textContent).toContain('outlet-probe-b');
  });

  it('given showHome(apps), then it lists a plain link per app [TR-54]', () => {
    outlet.showHome(apps);
    const hrefs = [...root.querySelectorAll('a')].map((x) => x.getAttribute('href'));
    expect(hrefs).toEqual(['#/a', '#/b']);
  });

  it('given showNotFound(hash), then it names the unknown route and links home [TR-54]', () => {
    outlet.showNotFound('#/nope');
    expect(root.textContent).toContain('#/nope');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('#/');
  });

  it.each(['route', 'global'] as const)(
    'given a retryable %s error, when the user clicks Retry, then it reports retryRequested with that scope [TR-53]',
    (scope) => {
      outlet.showError(scope, 'could not reach weather', true);
      const alert = root.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('could not reach weather');
      root.querySelector('button')!.click();
      expect(events).toEqual([{ type: 'retryRequested', scope }]);
    },
  );

  it('given a non-retryable error, then no Retry button is shown [TR-53]', () => {
    outlet.showError('route', 'nope', false);
    expect(root.querySelector('button')).toBeNull();
  });

  it('given an error message containing markup, then it is shown as text [TR-53]', () => {
    outlet.showError('global', '<img src=x onerror=alert(1)>', true);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
