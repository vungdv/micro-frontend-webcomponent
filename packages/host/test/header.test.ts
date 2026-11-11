import { describe, expect, it } from 'vitest';
import { Header } from '../src/header';
import type { AppEntry } from '../src/types';

const todo: AppEntry = { name: 'todo', route: '#/todo', url: 'http://x/todo.js', tag: 'todo-app' };
const weather: AppEntry = { name: 'weather', route: '#/weather', url: 'http://x/w.js', tag: 'weather-dashboard' };

function setup() {
  const el = document.createElement('header');
  const header = new Header({ element: el });
  header.render([todo, weather]);
  const current = () => [...el.querySelectorAll('[aria-current="page"]')].map((a) => a.getAttribute('href'));
  return { el, header, current };
}

describe('Header', () => {
  it('renders a home link and plain hash links per app from the manifest', () => {
    const { el } = setup();
    const links = [...el.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent]);
    expect(links).toEqual([
      ['#/', 'Micro-frontend'],
      ['#/todo', 'Todo'],
      ['#/weather', 'Weather'],
    ]);
  });

  it('re-rendering replaces previous content', () => {
    const { el, header } = setup();
    header.render([todo]);
    expect(el.querySelectorAll('nav a')).toHaveLength(1);
  });

  it('setActive marks only the active app with aria-current', () => {
    const { header, current } = setup();
    header.setActive(todo);
    expect(current()).toEqual(['#/todo']);
    header.setActive(weather);
    expect(current()).toEqual(['#/weather']);
  });

  it('setActive(null) clears the highlight', () => {
    const { header, current } = setup();
    header.setActive(todo);
    header.setActive(null);
    expect(current()).toEqual([]);
  });
});
