import { beforeEach, describe, expect, it } from 'vitest';
import { Header } from '../src/header';
import { anApp } from './support/builders';

const todo = anApp('todo');
const weather = anApp('weather');

describe('Given a header element', () => {
  let el: HTMLElement;
  let header: Header;

  /** `[href, text]` of every link in the header. */
  const links = () => [...el.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent]);
  /** hrefs of the links marked as the current page. */
  const current = () => [...el.querySelectorAll('[aria-current="page"]')].map((a) => a.getAttribute('href'));

  beforeEach(() => {
    el = document.createElement('header');
    header = new Header({ element: el });
  });

  describe('when header.render(apps)', () => {
    beforeEach(() => header.render([todo, weather]));

    it('then there is a home link and one plain <a href="<route>"> per app [HD-01]', () => {
      expect(links()).toEqual([
        ['#/', 'Micro-frontend'],
        ['#/todo', 'Todo'],
        ['#/weather', 'Weather'],
      ]);
    });
  });

  describe('and earlier content', () => {
    beforeEach(() => {
      el.append(document.createElement('p'));
      header.render([todo, weather]);
    });

    describe('when header.render(apps) again with fewer apps', () => {
      beforeEach(() => header.render([todo]));

      it('then the earlier content is replaced [HD-01]', () => {
        expect(el.querySelector('p')).toBeNull();
        expect(links()).toEqual([
          ['#/', 'Micro-frontend'],
          ['#/todo', 'Todo'],
        ]);
      });
    });
  });

  describe('and the header is rendered', () => {
    beforeEach(() => header.render([todo, weather]));

    describe('when setActive(todo)', () => {
      beforeEach(() => header.setActive(todo));

      it('then only the todo link has aria-current="page" [HD-02]', () => {
        expect(current()).toEqual(['#/todo']);
      });
    });

    describe('when setActive(todo) then setActive(weather)', () => {
      beforeEach(() => {
        header.setActive(todo);
        header.setActive(weather);
      });

      it('then only the weather link has aria-current="page" [HD-02]', () => {
        expect(current()).toEqual(['#/weather']);
      });
    });

    describe('when setActive(todo) then setActive(null)', () => {
      beforeEach(() => {
        header.setActive(todo);
        header.setActive(null);
      });

      it('then no link has aria-current [HD-02]', () => {
        expect(current()).toEqual([]);
      });
    });
  });
});
