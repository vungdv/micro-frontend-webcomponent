import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/logger';

describe('createLogger', () => {
  it('writes one JSON record per call with level, component, msg and fields', () => {
    const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Console;
    createLogger('host', sink).warn('app failed', { app: 'todo', error: new Error('down') });
    const record = JSON.parse((sink.warn as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string);
    expect(record).toMatchObject({
      level: 'warn',
      component: 'host',
      msg: 'app failed',
      app: 'todo',
      error: { name: 'Error', message: 'down' },
    });
    expect(typeof record.ts).toBe('string');
  });
});
