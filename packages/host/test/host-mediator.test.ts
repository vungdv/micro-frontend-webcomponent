/**
 * Orchestration level (docs/milestones/m1-host-shell.md §3.1): `HostMediator` with recording
 * colleagues and a recording logger. Expected journals follow the §2.5 collaboration sequences.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { HostMediator } from '../src/host-mediator';
import type { HostEvent, Notify } from '../src/types';
import { aConfig, anApp, on } from './support/builders';
import { recordingColleagues, recordingLogger } from './support/fakes';

const todo = anApp('todo');
const weather = anApp('weather');
const config = aConfig(todo, weather);

type Behaviour = Partial<Record<string, (...args: unknown[]) => void>>;

/**
 * A mediator over recording colleagues. By default the fake router behaves like the real one:
 * `start` reports the current hash ("#/") and `navigate` reports the new route, both synchronously.
 * `extra` adds or overrides behaviours; it receives the mediator's `notify`.
 */
function aMediator(extra: (notify: Notify) => Behaviour = () => ({})) {
  let mediator: HostMediator | undefined;
  const notify: Notify = (event) => mediator!.notify(event);
  const colleagues = recordingColleagues({
    'router.start': () => notify(on.routeChanged('#/')),
    'router.navigate': (path) =>
      notify(on.routeChanged(String(path), config.apps.find((app) => app.route === path) ?? null)),
    ...extra(notify),
  });
  const log = recordingLogger();
  mediator = new HostMediator(colleagues, log);
  return { mediator, journal: colleagues.journal, log };
}

/** Starts the mediator, loads the config and clears the journal and log: the host is on home. */
function bootToHome(host: ReturnType<typeof aMediator>): void {
  host.mediator.start();
  host.mediator.notify(on.configLoaded(config));
  host.journal.length = 0;
  host.log.records.length = 0;
}

describe('Given a mediator with recording colleagues whose router reports "#/" on start', () => {
  let host: ReturnType<typeof aMediator>;
  beforeEach(() => {
    host = aMediator();
  });

  describe('when it starts and the manifest loads (boot and first route)', () => {
    beforeEach(() => {
      host.mediator.start();
      host.mediator.notify(on.configLoaded(config));
    });

    it('then the colleagues receive config.load, header.render, router.start, setActive(null), showHome in that order [MD-05]', () => {
      expect(host.journal).toEqual([
        'config.load()',
        'header.render([todo,weather])',
        'router.start([todo,weather])',
        'header.setActive(null)',
        'outlet.showHome([todo,weather])',
      ]);
    });

    it('then the host is on home [MD-05]', () => {
      expect(host.mediator.current?.name).toBe('home');
    });
  });

  describe('when the manifest fails and the user clicks the global Retry', () => {
    beforeEach(() => {
      host.mediator.start();
      host.mediator.notify(on.configFailed('HTTP 500'));
      host.mediator.notify(on.retryRequested('global'));
    });

    it('then a global retryable error is shown and the manifest is loaded again [BT-03] [BT-04]', () => {
      expect(host.journal).toEqual([
        'config.load()',
        'outlet.showError("global", "Could not load the host configuration: HTTP 500", true)',
        'config.load()',
      ]);
    });

    it('then the failure is logged as an error [BT-03]', () => {
      expect(host.log.at('error')).toEqual([{ level: 'error', msg: 'config failed', fields: { error: 'HTTP 500' } }]);
    });
  });
});

describe('Given the host has booted to home', () => {
  let host: ReturnType<typeof aMediator>;
  beforeEach(() => {
    host = aMediator();
    bootToHome(host);
  });

  describe('when the user opens Todo, it loads, then the user leaves for Weather', () => {
    beforeEach(() => {
      host.mediator.notify(on.routeChanged('#/todo', todo));
      host.mediator.notify(on.appLoaded(todo, 1));
      host.mediator.notify(on.routeChanged('#/weather', weather));
    });

    it('then Todo is loaded with activation 1 and mounted, then Weather starts loading with activation 2 [MD-05]', () => {
      expect(host.journal).toEqual([
        'header.setActive(todo)',
        'outlet.showLoading(todo)',
        'loader.load(todo, 1, false)',
        'outlet.mount(todo)',
        'header.setActive(weather)',
        'outlet.showLoading(weather)',
        'loader.load(weather, 2, false)',
      ]);
    });
  });

  describe('when an app asks to navigate to a declared route', () => {
    beforeEach(() => {
      host.mediator.notify(on.navigateRequested('#/weather'));
    });

    it('then the router is asked to navigate and the change continues as a normal route change [MD-05] [NV-01]', () => {
      expect(host.journal).toEqual([
        'router.navigate("#/weather")',
        'header.setActive(weather)',
        'outlet.showLoading(weather)',
        'loader.load(weather, 1, false)',
      ]);
    });
  });

  describe('when an app asks to navigate to an unknown path', () => {
    beforeEach(() => {
      host.mediator.notify(on.navigateRequested('#/evil'));
    });

    it('then no colleague receives a command [MD-05] [NV-02]', () => {
      expect(host.journal).toEqual([]);
    });

    it('then "navigate request rejected" is logged as a warning [NV-02]', () => {
      expect(host.log.at('warn')).toEqual([
        { level: 'warn', msg: 'navigate request rejected: unknown path', fields: { path: '#/evil' } },
      ]);
    });

    it('then the host stays on home [NV-02]', () => {
      expect(host.mediator.current?.name).toBe('home');
    });
  });

  describe('when the mediator is started again', () => {
    beforeEach(() => {
      host.mediator.start();
    });

    it('then "mediator already started" is logged as a warning [BT-06]', () => {
      expect(host.log.at('warn')).toEqual([{ level: 'warn', msg: 'mediator already started', fields: undefined }]);
    });

    it('then no colleague receives a command [BT-06]', () => {
      expect(host.journal).toEqual([]);
    });

    it('then the host stays on home [BT-06]', () => {
      expect(host.mediator.current?.name).toBe('home');
    });
  });
});

describe('Given the user switched from Todo to Weather and Weather is loading with activation 2', () => {
  let host: ReturnType<typeof aMediator>;
  beforeEach(() => {
    host = aMediator();
    bootToHome(host);
    host.mediator.notify(on.routeChanged('#/todo', todo));
    host.mediator.notify(on.appLoaded(todo, 1));
    host.mediator.notify(on.routeChanged('#/weather', weather));
    host.journal.length = 0;
    host.log.records.length = 0;
  });

  describe('when the Weather remote fails', () => {
    beforeEach(() => {
      host.mediator.notify(on.appFailed(weather, 2, 'could not reach weather'));
    });

    it('then the outlet shows a retryable route error naming the app [MD-05]', () => {
      expect(host.journal).toEqual(['outlet.showError("route", "Could not load weather: could not reach weather", true)']);
    });

    it('then the failure is logged as an error [MD-05]', () => {
      expect(host.log.at('error')).toEqual([
        {
          level: 'error',
          msg: 'app failed',
          fields: { app: 'weather', activationId: 2, error: 'could not reach weather' },
        },
      ]);
    });
  });

  describe('when the Weather remote fails and the user clicks Retry', () => {
    beforeEach(() => {
      host.mediator.notify(on.appFailed(weather, 2, 'could not reach weather'));
      host.mediator.notify(on.retryRequested('route'));
    });

    it('then the error is shown, then Weather loads again with activation 3 and retry=true, without updating the header [MD-05]', () => {
      expect(host.journal).toEqual([
        'outlet.showError("route", "Could not load weather: could not reach weather", true)',
        'outlet.showLoading(weather)',
        'loader.load(weather, 3, true)',
      ]);
    });

    it('then the host is loading Weather with activation 3 [MD-05]', () => {
      expect(host.mediator.current).toMatchObject({ name: 'loadingApp', activationId: 3 });
    });
  });

  describe('when the stale Todo result for activation 1 arrives', () => {
    beforeEach(() => {
      host.mediator.notify(on.appLoaded(todo, 1));
    });

    it('then nothing is mounted [TR-09]', () => {
      expect(host.journal).toEqual([]);
    });

    it('then a stale warning names activation 1 [TR-09]', () => {
      expect(host.log.at('warn')).toEqual([
        expect.objectContaining({ msg: 'stale load result ignored', fields: expect.objectContaining({ activationId: 1 }) }),
      ]);
    });
  });
});

describe('Given the mediator has not started', () => {
  let host: ReturnType<typeof aMediator>;
  beforeEach(() => {
    host = aMediator();
  });

  describe('when a notification arrives', () => {
    beforeEach(() => {
      host.mediator.notify(on.configLoaded(config));
    });

    it('then no colleague receives a command [MD-03]', () => {
      expect(host.journal).toEqual([]);
    });

    it('then "event before start ignored" is logged as a warning [MD-03]', () => {
      expect(host.log.at('warn')).toEqual([
        { level: 'warn', msg: 'event before start ignored', fields: { event: 'configLoaded' } },
      ]);
    });
  });
});

describe('Given the outlet throws on showLoading', () => {
  let host: ReturnType<typeof aMediator>;
  beforeEach(() => {
    host = aMediator(() => ({
      'outlet.showLoading': () => {
        throw new Error('boom');
      },
    }));
    bootToHome(host);
  });

  describe('when the user opens Todo', () => {
    beforeEach(() => {
      host.mediator.notify(on.routeChanged('#/todo', todo));
    });

    it('then "command failed" is logged with the command and the error [MD-01]', () => {
      expect(host.log.at('error')).toEqual([
        { level: 'error', msg: 'command failed', fields: { command: 'outlet.showLoading', error: new Error('boom') } },
      ]);
    });

    it('then the commands after it still run [MD-01]', () => {
      expect(host.journal).toEqual(['header.setActive(todo)', 'outlet.showLoading(todo)', 'loader.load(todo, 1, false)']);
    });
  });
});

describe('Given header.render synchronously reports a route change', () => {
  let host: ReturnType<typeof aMediator>;
  beforeEach(() => {
    host = aMediator((notify) => ({
      'header.render': () => notify(on.routeChanged('#/todo', todo)),
      'router.start': () => {},
    }));
    host.mediator.start();
  });

  describe('when the manifest loads', () => {
    beforeEach(() => {
      host.mediator.notify(on.configLoaded(config));
    });

    it('then router.start (the rest of configLoaded) runs before the commands of the nested route change [MD-02]', () => {
      expect(host.journal).toEqual([
        'config.load()',
        'header.render([todo,weather])',
        'router.start([todo,weather])',
        'header.setActive(todo)',
        'outlet.showLoading(todo)',
        'loader.load(todo, 1, false)',
      ]);
    });
  });
});

describe('Given Todo is loading with activation 1', () => {
  let host: ReturnType<typeof aMediator>;
  beforeEach(() => {
    host = aMediator();
    bootToHome(host);
    host.mediator.notify(on.routeChanged('#/todo', todo));
    host.journal.length = 0;
  });

  describe('when a malformed appLoaded (no entry) arrives, then the real one', () => {
    beforeEach(() => {
      host.mediator.notify({ type: 'appLoaded', activationId: 99 } as unknown as HostEvent);
      host.mediator.notify(on.appLoaded(todo, 1));
    });

    it('then "event processing failed" is logged for the malformed event [MD-04]', () => {
      expect(host.log.at('error')).toEqual([
        { level: 'error', msg: 'event processing failed', fields: { event: 'appLoaded', error: expect.any(TypeError) } },
      ]);
    });

    it('then the next event is still processed and Todo is mounted [MD-04]', () => {
      expect(host.journal).toEqual(['outlet.mount(todo)']);
    });
  });
});

describe('Given router.start queues a malformed event and a navigation request behind the first route', () => {
  let host: ReturnType<typeof aMediator>;
  beforeEach(() => {
    host = aMediator((notify) => ({
      'router.start': () => {
        notify(on.routeChanged('#/'));
        notify({ type: 'appFailed', activationId: 99 } as unknown as HostEvent);
        notify(on.navigateRequested('#/weather'));
      },
      'router.navigate': () => {},
    }));
    host.mediator.start();
  });

  describe('when the manifest loads', () => {
    beforeEach(() => {
      host.mediator.notify(on.configLoaded(config));
    });

    it('then "event processing failed" is logged for the malformed event [MD-04]', () => {
      expect(host.log.at('error')).toEqual([
        expect.objectContaining({ msg: 'event processing failed', fields: expect.objectContaining({ event: 'appFailed' }) }),
      ]);
    });

    it('then the events queued before and after it are still processed [MD-04]', () => {
      expect(host.journal.slice(3)).toEqual([
        'header.setActive(null)',
        'outlet.showHome([todo,weather])',
        'router.navigate("#/weather")',
      ]);
    });
  });
});
