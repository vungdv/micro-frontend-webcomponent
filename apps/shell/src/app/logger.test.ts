import { describe, expect, it, vi } from 'vitest';
import { createConsoleLogger } from './logger.ts';

describe('createConsoleLogger', () => {
  it('given a warning with data, when warn(), then it emits one structured record with level, component and message [TR-61]', () => {
    const sink = { warn: vi.fn() };
    createConsoleLogger(sink).warn('stale appLoaded ignored', { appId: 'todo', activationId: 1 });
    expect(sink.warn).toHaveBeenCalledWith({
      level: 'warn',
      component: 'mf-host',
      message: 'stale appLoaded ignored',
      appId: 'todo',
      activationId: 1,
      time: expect.any(String),
    });
  });

  it('given data with reserved keys, when warn(), then level, component, message and time cannot be overwritten [TR-62]', () => {
    const sink = { warn: vi.fn() };
    createConsoleLogger(sink).warn('real message', {
      level: 'debug', component: 'evil', message: 'fake', time: 'never', appId: 'todo',
    });
    expect(sink.warn).toHaveBeenCalledWith({
      level: 'warn',
      component: 'mf-host',
      message: 'real message',
      appId: 'todo',
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });
});
