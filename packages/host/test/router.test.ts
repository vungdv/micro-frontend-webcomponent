import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Router, normalize } from '../src/router';
import { anApp } from './support/builders';
import { recordingNotify } from './support/fakes';

const todo = anApp('todo');
const weather = anApp('weather');
const apps = [todo, weather];

/** Resolves on the next `hashchange` (happy-dom dispatches it asynchronously). */
function nextHashChange(): Promise<void> {
  return new Promise((resolve) => window.addEventListener('hashchange', () => resolve(), { once: true }));
}

/**
 * Sets the hash and, if the URL changed, waits until its `hashchange` has been dispatched,
 * so no event leaks into a later step or test.
 */
async function changeHash(hash: string): Promise<void> {
  const before = window.location.href;
  const changed = nextHashChange();
  window.location.hash = hash;
  if (window.location.href !== before) await changed;
}

describe('Given a router on the page', () => {
  let rec: ReturnType<typeof recordingNotify>;
  let router: Router;

  beforeEach(async () => {
    await changeHash('');
    rec = recordingNotify();
    router = new Router({ notify: rec.notify });
  });
  afterEach(() => router.stop());

  describe('and the hash is #/todo', () => {
    beforeEach(() => changeHash('#/todo'));

    describe('when router.start(apps)', () => {
      beforeEach(() => router.start(apps));

      it('then routeChanged("#/todo", todo) is reported right away [RT-01]', () => {
        expect(rec.events).toEqual([{ type: 'routeChanged', path: '#/todo', entry: todo }]);
      });
    });
  });

  describe.each([
    ['empty', ''],
    ['#', '#'],
  ])('and the hash is %s', (_label, hash) => {
    beforeEach(() => changeHash(hash));

    describe('when router.start(apps) reports the route', () => {
      beforeEach(() => router.start(apps));

      it('then the path is #/ with no entry [RT-03]', () => {
        expect(rec.events).toEqual([{ type: 'routeChanged', path: '#/', entry: null }]);
      });
    });
  });

  describe('and the router has started', () => {
    beforeEach(() => {
      router.start(apps);
      rec.events.length = 0;
    });

    describe('when the hash changes to a declared route', () => {
      beforeEach(() => changeHash('#/todo'));

      it('then exactly one routeChanged with that entry is reported [RT-02]', () => {
        expect(rec.events).toEqual([{ type: 'routeChanged', path: '#/todo', entry: todo }]);
      });
    });

    describe('when the hash changes twice', () => {
      beforeEach(async () => {
        await changeHash('#/todo');
        await changeHash('#/weather');
      });

      it('then one routeChanged is reported per change [RT-02]', () => {
        expect(rec.events).toEqual([
          { type: 'routeChanged', path: '#/todo', entry: todo },
          { type: 'routeChanged', path: '#/weather', entry: weather },
        ]);
      });
    });

    describe('when the hash changes to an undeclared route', () => {
      beforeEach(() => changeHash('#/nope'));

      it('then routeChanged is reported with a null entry [RT-02]', () => {
        expect(rec.events).toEqual([{ type: 'routeChanged', path: '#/nope', entry: null }]);
      });
    });

    describe('when router.start(apps) is called again and the hash changes', () => {
      beforeEach(async () => {
        router.start(apps);
        rec.events.length = 0;
        await changeHash('#/weather');
      });

      it('then the change is still reported exactly once [RT-02]', () => {
        expect(rec.events).toEqual([{ type: 'routeChanged', path: '#/weather', entry: weather }]);
      });
    });

    describe('when router.navigate("#/weather")', () => {
      let changed: Promise<void>;
      beforeEach(() => {
        changed = nextHashChange();
        router.navigate('#/weather');
      });

      it('then location.hash is set [RT-04]', () => {
        expect(window.location.hash).toBe('#/weather');
      });

      it('then the change is reported as routeChanged [RT-04]', async () => {
        await changed;
        expect(rec.events).toEqual([{ type: 'routeChanged', path: '#/weather', entry: weather }]);
      });
    });

    describe('and the router has been stopped', () => {
      beforeEach(() => router.stop());

      describe('when the hash changes', () => {
        beforeEach(() => changeHash('#/todo'));

        it('then no routeChanged is reported [RT-05]', () => {
          expect(rec.events).toEqual([]);
        });
      });
    });
  });
});

describe('Given the exported normalize', () => {
  it.each([
    ['', '#/'],
    ['#', '#/'],
    ['#/', '#/'],
    ['#/todo', '#/todo'],
  ])('when normalize(%j), then it returns %j [RT-03]', (hash, expected) => {
    expect(normalize(hash)).toBe(expected);
  });
});
