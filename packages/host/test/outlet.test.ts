import { beforeEach, describe, expect, it } from 'vitest';
import { Outlet } from '../src/outlet';
import type { AppEntry } from '../src/types';
import { anApp } from './support/builders';
import { recordingNotify } from './support/fakes';

const todo = anApp('todo');
const weather = anApp('weather');

/** `[href, text]` of every link inside the outlet. */
const links = (el: HTMLElement): Array<[string | null, string | null]> =>
  [...el.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent]);

/** Elements in the outlet whose tag is one of the apps' tags. */
const appElements = (el: HTMLElement, ...apps: AppEntry[]): Element[] =>
  [...el.querySelectorAll(apps.map((a) => a.tag).join(','))];

describe('Given an outlet', () => {
  let el: HTMLElement;
  let rec: ReturnType<typeof recordingNotify>;
  let outlet: Outlet;

  beforeEach(() => {
    el = document.createElement('main');
    rec = recordingNotify();
    outlet = new Outlet({ element: el, notify: rec.notify });
  });

  describe('and an app is mounted', () => {
    let mounted: Element;
    beforeEach(() => {
      outlet.mount(todo);
      mounted = el.firstElementChild!;
    });

    it('then the outlet holds that app element only [OU-01]', () => {
      expect(mounted.localName).toBe(todo.tag);
      expect(el.children).toHaveLength(1);
    });

    describe.each<[string, (o: Outlet) => void]>([
      ['showLoading', (o) => o.showLoading(weather)],
      ['showHome', (o) => o.showHome([todo, weather])],
      ['showError', (o) => o.showError('route', 'down', true)],
      ['showNotFound', (o) => o.showNotFound('#/nope')],
    ])('when %s', (_name, act) => {
      beforeEach(() => act(outlet));

      it('then the previous element is removed and no app element remains [OU-01]', () => {
        expect(mounted.isConnected).toBe(false);
        expect(appElements(el, todo, weather)).toEqual([]);
        expect(el.children).toHaveLength(1);
      });
    });

    describe('when mount(other)', () => {
      beforeEach(() => outlet.mount(weather));

      it('then the previous element is removed and only the other app is in the outlet [OU-01]', () => {
        expect(mounted.isConnected).toBe(false);
        expect(appElements(el, todo, weather).map((e) => e.localName)).toEqual([weather.tag]);
      });
    });
  });

  describe.each(['route', 'global'] as const)('and a %s error panel with Retry is shown', (scope) => {
    beforeEach(() => outlet.showError(scope, 'Could not load todo: down', true));

    it('then the panel is an alert for that scope with the message and a Retry button [OU-02]', () => {
      const panel = el.querySelector<HTMLElement>('[role="alert"]')!;
      expect(panel.dataset.scope).toBe(scope);
      expect(panel.textContent).toContain('Could not load todo: down');
      expect(el.querySelector('button')?.textContent).toBe('Retry');
    });

    describe('when the user clicks Retry', () => {
      beforeEach(() => el.querySelector('button')!.click());

      it(`then retryRequested(${scope}) is sent [OU-02]`, () => {
        expect(rec.events).toEqual([{ type: 'retryRequested', scope }]);
      });
    });
  });

  describe('when showHome(apps)', () => {
    beforeEach(() => outlet.showHome([todo, weather]));

    it('then there is one link per app [OU-03]', () => {
      expect(links(el)).toEqual([
        ['#/todo', 'Todo'],
        ['#/weather', 'Weather'],
      ]);
    });
  });

  describe('when showLoading(todo)', () => {
    beforeEach(() => outlet.showLoading(todo));

    it('then a busy panel names the app [OU-04]', () => {
      const panel = el.querySelector('[aria-busy="true"]');
      expect(panel?.textContent).toContain('Loading Todo');
    });
  });

  describe('when showError(scope, message, retryable=false) with HTML in the message', () => {
    const message = '<img src=x onerror=alert(1)>';
    beforeEach(() => outlet.showError('route', message, false));

    it('then the message is rendered as text, never HTML [OU-05]', () => {
      expect(el.querySelector('img')).toBeNull();
      expect(el.querySelector('[role="alert"]')?.textContent).toContain(message);
    });

    it('then there is no Retry button [OU-05]', () => {
      expect(el.querySelector('button')).toBeNull();
    });
  });

  describe('when showNotFound("#/nope")', () => {
    beforeEach(() => outlet.showNotFound('#/nope'));

    it('then the path and a link home are shown [OU-06]', () => {
      expect(el.textContent).toContain('#/nope');
      expect(links(el)).toEqual([['#/', 'Go home']]);
    });
  });
});
