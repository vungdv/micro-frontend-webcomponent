import { describe, expect, it, vi } from 'vitest';
import type { HostConfig } from '@mf/contracts';
import { HostMediator, type Colleagues } from './host-mediator.ts';

const config: HostConfig = {
  apps: { todo: { route: '#/todo', url: 'http://t/todo.js', tag: 'todo-app' } },
};

function fakeColleagues(): Colleagues {
  return {
    config: { load: vi.fn() },
    header: { render: vi.fn(), setActive: vi.fn() },
    router: { start: vi.fn(), navigate: vi.fn() },
    loader: { load: vi.fn() },
    outlet: {
      showHome: vi.fn(), showLoading: vi.fn(), showNotFound: vi.fn(), showError: vi.fn(), mount: vi.fn(),
    },
    log: { warn: vi.fn() },
  };
}

describe('HostMediator', () => {
  it('given a new mediator, when start(), then it asks the config loader to load [TR-60]', () => {
    const c = fakeColleagues();
    new HostMediator(c).start();
    expect(c.config.load).toHaveBeenCalledOnce();
  });

  it('given the config loaded, when an app route is reported, then commands reach the right colleagues [TR-60]', () => {
    const c = fakeColleagues();
    const m = new HostMediator(c);
    m.start();
    m.notify({ type: 'configLoaded', config });
    expect(c.header.render).toHaveBeenCalledWith(config.apps);
    expect(c.router.start).toHaveBeenCalledWith(config.apps);

    m.notify({ type: 'routeChanged', hash: '#/todo', appId: 'todo' });
    expect(c.header.setActive).toHaveBeenCalledWith('todo');
    expect(c.outlet.showLoading).toHaveBeenCalledWith(config.apps.todo);
    expect(c.loader.load).toHaveBeenCalledWith('todo', config.apps.todo, 1, false);
    expect(m.state.phase).toEqual({ kind: 'loadingApp', appId: 'todo', activationId: 1 });
  });

  it('given a colleague reports synchronously while a command runs, then the report is handled after the current commands [TR-60]', () => {
    const c = fakeColleagues();
    const order: string[] = [];
    const m = new HostMediator(c);
    c.header.render = vi.fn(() => order.push('header.render'));
    c.router.start = vi.fn(() => {
      order.push('router.start');
      m.notify({ type: 'routeChanged', hash: '#/', appId: null });
    });
    c.header.setActive = vi.fn(() => order.push('header.setActive'));
    c.outlet.showHome = vi.fn(() => order.push('outlet.showHome'));

    m.start();
    m.notify({ type: 'configLoaded', config });

    expect(order).toEqual(['header.render', 'router.start', 'header.setActive', 'outlet.showHome']);
    expect(m.state.phase).toEqual({ kind: 'home' });
  });

  it('given an ignored event, then the warning goes to the log colleague [TR-60]', () => {
    const c = fakeColleagues();
    const m = new HostMediator(c);
    m.notify({ type: 'routeChanged', hash: '#/todo', appId: 'todo' });
    expect(c.log.warn).toHaveBeenCalledWith('routeChanged ignored before config loaded', { hash: '#/todo' });
  });

  it('given a colleague throws while running a command, then the error is logged and later events still work [TR-60]', () => {
    const c = fakeColleagues();
    c.config.load = vi.fn(() => {
      throw new Error('boom');
    });
    const m = new HostMediator(c);
    m.start();
    expect(c.log.warn).toHaveBeenCalledWith('command failed', expect.objectContaining({ command: 'config.load' }));
    m.notify({ type: 'configLoaded', config });
    expect(c.router.start).toHaveBeenCalled();
  });
});
