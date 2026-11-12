import { beforeEach, describe, expect, it } from 'vitest';
import type { HostConfig } from '@mf/contracts';
import { Header } from './header.ts';

const apps: HostConfig['apps'] = {
  todo: { route: '#/todo', url: 'http://t/todo.js', tag: 'todo-app' },
  weather: { route: '#/weather', url: 'http://w/weather.js', tag: 'weather-dashboard' },
};

describe('Header', () => {
  let nav: HTMLElement;
  let header: Header;

  beforeEach(() => {
    document.body.innerHTML = '<nav id="mf-nav"></nav>';
    nav = document.getElementById('mf-nav')!;
    header = new Header(nav);
  });

  const links = () => [...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
  const current = () => [...nav.querySelectorAll('a[aria-current="page"]')].map((a) => a.getAttribute('href'));

  it('given the manifest apps, when render(), then it shows a home link and one plain hash link per app [TR-45]', () => {
    header.render(apps);
    expect(links()).toEqual([
      ['Home', '#/'],
      ['Todo', '#/todo'],
      ['Weather', '#/weather'],
    ]);
  });

  it('given render() is called again, then links are replaced, not duplicated [TR-45]', () => {
    header.render(apps);
    header.render({ todo: apps.todo! });
    expect(links()).toEqual([
      ['Home', '#/'],
      ['Todo', '#/todo'],
    ]);
  });

  it('given rendered links, when setActive(weather), then only that link has aria-current="page" [TR-46]', () => {
    header.render(apps);
    header.setActive('todo');
    header.setActive('weather');
    expect(current()).toEqual(['#/weather']);
  });

  it('given an active link, when setActive(null), then no app link is current [TR-46]', () => {
    header.render(apps);
    header.setActive('todo');
    header.setActive(null);
    expect(current()).toEqual([]);
  });
});
