import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModuleLoader } from '../src/module-loader';
import type { HostEvent } from '../src/types';
import { anApp } from './support/builders';
import { fakeRegistry, recordingNotify, scriptedImporter } from './support/fakes';

const todo = anApp('todo');
const TIMEOUT_MS = 500;

/** The error message of an appFailed notification (fails the test for any other event). */
function failureMessage(event: HostEvent | undefined): string {
  if (event?.type !== 'appFailed') throw new Error(`expected appFailed, got ${JSON.stringify(event)}`);
  return event.error.message;
}

describe('Given a module loader with a fake registry and a scripted importer', () => {
  let registry: ReturnType<typeof fakeRegistry>;
  let importer: ReturnType<typeof scriptedImporter>;
  let rec: ReturnType<typeof recordingNotify>;
  let loader: ModuleLoader;

  beforeEach(() => {
    registry = fakeRegistry();
    importer = scriptedImporter(registry);
    rec = recordingNotify();
    loader = new ModuleLoader({ notify: rec.notify, importer, registry, timeoutMs: TIMEOUT_MS });
  });

  describe('and the tag is already defined', () => {
    beforeEach(() => registry.define(todo.tag, class extends HTMLElement {}));

    describe('when load(todo, 4)', () => {
      let event: HostEvent;
      beforeEach(async () => {
        const next = rec.next();
        loader.load(todo, 4, false);
        event = await next;
      });

      it('then appLoaded is reported with activation id 4 [ML-01]', () => {
        expect(event).toEqual({ type: 'appLoaded', entry: todo, activationId: 4 });
      });

      it('then the importer is not called [ML-01]', () => {
        expect(importer.urls).toEqual([]);
      });
    });
  });

  describe('and the importer resolves and defines the tag', () => {
    beforeEach(() => importer.script(todo.url, { define: todo.tag }));

    describe('when load(todo, 2)', () => {
      let event: HostEvent;
      beforeEach(async () => {
        const next = rec.next();
        loader.load(todo, 2, false);
        event = await next;
      });

      it('then appLoaded is reported with the same activation id [ML-02]', () => {
        expect(event).toEqual({ type: 'appLoaded', entry: todo, activationId: 2 });
      });

      it('then the importer gets the entry URL unchanged [ML-02]', () => {
        expect(importer.urls).toEqual([todo.url]);
      });
    });
  });

  describe('and the importer rejects', () => {
    beforeEach(() => importer.script(todo.url, { reject: 'Failed to fetch dynamically imported module' }));

    describe('when load(todo, 3)', () => {
      let event: HostEvent;
      beforeEach(async () => {
        const next = rec.next();
        loader.load(todo, 3, false);
        event = await next;
      });

      it('then appFailed is reported for activation id 3 [ML-03]', () => {
        expect(event).toMatchObject({ type: 'appFailed', entry: todo, activationId: 3 });
      });

      it('then the failure carries the import error [ML-03]', () => {
        expect(failureMessage(event)).toBe('Failed to fetch dynamically imported module');
      });
    });
  });

  describe('and the importer rejects with a value that is not an Error', () => {
    beforeEach(() => {
      loader = new ModuleLoader({
        notify: rec.notify,
        importer: () => Promise.reject('remote said no'),
        registry,
        timeoutMs: TIMEOUT_MS,
      });
    });

    describe('when load(todo, 3)', () => {
      let event: HostEvent;
      beforeEach(async () => {
        const next = rec.next();
        loader.load(todo, 3, false);
        event = await next;
      });

      it('then appFailed carries an Error whose message is that value [ML-03]', () => {
        expect(event).toMatchObject({ type: 'appFailed', activationId: 3 });
        expect(failureMessage(event)).toBe('remote said no');
      });
    });
  });

  describe('and fake timers are installed', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    describe.each([
      ['the importer never settles', 'hang', 'ML-04'],
      ['the module loads but never defines its tag', 'noDefine', 'ML-07'],
    ] as const)('and %s', (_label, behaviour, id) => {
      beforeEach(() => importer.script(todo.url, behaviour));

      describe('when load(todo, 5) and the timeout elapses', () => {
        beforeEach(async () => {
          loader.load(todo, 5, false);
          await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
        });

        it(`then appFailed is reported with "timed out after ${TIMEOUT_MS} ms" [${id}]`, () => {
          expect(rec.events).toHaveLength(1);
          expect(rec.events[0]).toMatchObject({ type: 'appFailed', entry: todo, activationId: 5 });
          expect(failureMessage(rec.events[0])).toBe(`timed out after ${TIMEOUT_MS} ms waiting for <${todo.tag}>`);
        });
      });

      describe('when load(todo, 5) and the timeout has not yet elapsed', () => {
        beforeEach(async () => {
          loader.load(todo, 5, false);
          await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
        });

        it(`then nothing is reported yet [${id}]`, () => {
          expect(rec.events).toEqual([]);
        });
      });
    });

    describe('and a loader created without timeoutMs whose import never settles', () => {
      beforeEach(() => {
        importer.script(todo.url, 'hang');
        loader = new ModuleLoader({ notify: rec.notify, importer, registry });
      });

      describe('when load(todo, 6) and the default 10000 ms elapse', () => {
        beforeEach(async () => {
          loader.load(todo, 6, false);
          await vi.advanceTimersByTimeAsync(9_999);
        });

        it('then appFailed is reported with "timed out after 10000 ms" only once they have elapsed [ML-04]', async () => {
          expect(rec.events).toEqual([]);
          await vi.advanceTimersByTimeAsync(1);
          expect(failureMessage(rec.events[0])).toBe(`timed out after 10000 ms waiting for <${todo.tag}>`);
        });
      });
    });
  });

  describe('and the remote is up', () => {
    beforeEach(() => importer.script(todo.url, { define: todo.tag }));

    describe('when load(todo, 7, retry=true)', () => {
      beforeEach(async () => {
        const next = rec.next();
        loader.load(todo, 7, true);
        await next;
      });

      it('then the importer gets the URL with mf-retry=1 [ML-05]', () => {
        expect(importer.urls).toEqual([`${todo.url}?mf-retry=1`]);
      });

      it('then appLoaded is reported [ML-05]', () => {
        expect(rec.events).toEqual([{ type: 'appLoaded', entry: todo, activationId: 7 }]);
      });
    });
  });

  describe('and an earlier import of the URL failed', () => {
    beforeEach(async () => {
      importer.script(todo.url, { reject: 'down' });
      const next = rec.next();
      loader.load(todo, 1, false);
      await next;
      importer.script(todo.url, { define: todo.tag });
    });

    describe.each([
      ['without retry', false],
      ['with retry', true],
    ])('when load(todo, 2) again %s', (_label, retry) => {
      let event: HostEvent;
      beforeEach(async () => {
        const next = rec.next();
        loader.load(todo, 2, retry);
        event = await next;
      });

      it('then the importer gets the URL with an mf-retry=<k> query [ML-05]', () => {
        expect(importer.urls).toEqual([todo.url, `${todo.url}?mf-retry=1`]);
      });

      it('then appLoaded is reported for the new id [ML-05]', () => {
        expect(event).toEqual({ type: 'appLoaded', entry: todo, activationId: 2 });
      });
    });

    describe('when the import fails again and load is called a third time', () => {
      beforeEach(async () => {
        importer.script(todo.url, { reject: 'still down' });
        let next = rec.next();
        loader.load(todo, 2, false);
        await next;
        importer.script(todo.url, { define: todo.tag });
        next = rec.next();
        loader.load(todo, 3, false);
        await next;
      });

      it('then each attempt gets a new mf-retry=<k> [ML-05]', () => {
        expect(importer.urls).toEqual([todo.url, `${todo.url}?mf-retry=1`, `${todo.url}?mf-retry=2`]);
      });
    });
  });

  describe('and notify throws on appLoaded', () => {
    const notified: HostEvent[] = [];
    let saved: ReturnType<typeof process.listeners>;
    let rejection: Promise<unknown>;

    beforeEach(() => {
      notified.length = 0;
      importer.script(todo.url, { define: todo.tag });
      loader = new ModuleLoader({
        notify: (event) => {
          notified.push(event);
          if (event.type === 'appLoaded') throw new Error('listener blew up');
        },
        importer,
        registry,
        timeoutMs: TIMEOUT_MS,
      });
      // The throw escapes the loader's fire-and-forget promise as an unhandled rejection.
      // Capture it here (instead of vitest's handler) so the test can await and assert it.
      saved = process.listeners('unhandledRejection');
      process.removeAllListeners('unhandledRejection');
      rejection = new Promise((resolve) => process.once('unhandledRejection', resolve));
    });
    afterEach(() => {
      process.removeAllListeners('unhandledRejection');
      for (const listener of saved) process.on('unhandledRejection', listener);
    });

    describe('when load(todo, 9)', () => {
      let reason: unknown;
      beforeEach(async () => {
        loader.load(todo, 9, false);
        reason = await rejection;
      });

      it('then no appFailed follows for the same id [ML-06]', () => {
        expect(notified).toEqual([{ type: 'appLoaded', entry: todo, activationId: 9 }]);
      });

      it('then the only escaping error is the one notify threw [ML-06]', () => {
        expect(reason).toEqual(new Error('listener blew up'));
      });
    });
  });
});
