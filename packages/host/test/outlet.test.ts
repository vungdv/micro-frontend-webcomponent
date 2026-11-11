import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Outlet } from '../src/outlet';
import type { AppEntry, Notify } from '../src/types';

const todo: AppEntry = { name: 'todo', route: '#/todo', url: 'http://x/todo.js', tag: 'outlet-todo' };
const weather: AppEntry = { name: 'weather', route: '#/weather', url: 'http://x/w.js', tag: 'outlet-weather' };

describe('Outlet', () => {
  let el: HTMLElement;
  let notify: ReturnType<typeof vi.fn<Notify>>;
  let outlet: Outlet;

  beforeEach(() => {
    el = document.createElement('main');
    notify = vi.fn<Notify>();
    outlet = new Outlet({ element: el, notify });
  });

  it('showHome lists a link per app', () => {
    outlet.showHome([todo, weather]);
    const links = [...el.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent]);
    expect(links).toEqual([
      ['#/todo', 'Todo'],
      ['#/weather', 'Weather'],
    ]);
  });

  it('showLoading names the app and marks the panel busy', () => {
    outlet.showLoading(todo);
    expect(el.textContent).toContain('Loading Todo');
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it.each(['route', 'global'] as const)('showError(%s) renders the message and a Retry that notifies', (scope) => {
    outlet.showError(scope, 'Could not load todo: down', true);
    const panel = el.querySelector('[role="alert"]') as HTMLElement;
    expect(panel.dataset.scope).toBe(scope);
    expect(panel.textContent).toContain('Could not load todo: down');
    const button = el.querySelector('button')!;
    expect(button.textContent).toBe('Retry');
    button.click();
    expect(notify).toHaveBeenCalledWith({ type: 'retryRequested', scope });
  });

  it('showError without retry has no button', () => {
    outlet.showError('route', 'nope', false);
    expect(el.querySelector('button')).toBeNull();
  });

  it('renders error messages as text, not HTML', () => {
    outlet.showError('route', '<img src=x onerror=alert(1)>', true);
    expect(el.querySelector('img')).toBeNull();
  });

  it('showNotFound shows the path and a link home', () => {
    outlet.showNotFound('#/nope');
    expect(el.textContent).toContain('#/nope');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('#/');
  });

  it('mount creates the element and replaces the previous one', () => {
    outlet.mount(todo);
    const first = el.querySelector('outlet-todo');
    expect(first).not.toBeNull();
    outlet.mount(weather);
    expect(el.children).toHaveLength(1);
    expect(el.querySelector('outlet-weather')).not.toBeNull();
    expect(first!.isConnected).toBe(false);
  });

  it('any show* removes the mounted element (disconnecting it)', () => {
    outlet.mount(todo);
    const mounted = el.firstElementChild!;
    outlet.showLoading(weather);
    expect(mounted.isConnected).toBe(false);
    expect(el.children).toHaveLength(1);
    outlet.showError('route', 'x', true);
    expect(el.children).toHaveLength(1);
    expect(el.querySelector('.mf-panel--loading')).toBeNull();
  });
});
