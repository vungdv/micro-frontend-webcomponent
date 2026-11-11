import { beforeEach, describe, expect, it } from 'vitest';
import { createLogger, type Logger } from '../src/logger';
import type { LogLevel } from '../src/types';

/** A fake console that records the lines written to each method. */
function recordingConsole(): Console & { lines: Record<LogLevel, string[]> } {
  const lines: Record<LogLevel, string[]> = { info: [], warn: [], error: [] };
  const sink = {
    lines,
    info: (line: string) => void lines.info.push(line),
    warn: (line: string) => void lines.warn.push(line),
    error: (line: string) => void lines.error.push(line),
  };
  return sink as unknown as Console & { lines: Record<LogLevel, string[]> };
}

describe('Given a logger for component "host" writing to a console', () => {
  let sink: ReturnType<typeof recordingConsole>;
  let log: Logger;

  beforeEach(() => {
    sink = recordingConsole();
    log = createLogger('host', sink);
  });

  describe.each(['info', 'warn', 'error'] as const)('when %s is called with fields', (level) => {
    beforeEach(() => log[level]('app failed', { app: 'todo', attempt: 2 }));

    it(`then one JSON line is written on console.${level} only [LG-01]`, () => {
      const others = (['info', 'warn', 'error'] as const).filter((l) => l !== level);
      expect(sink.lines[level]).toHaveLength(1);
      for (const other of others) expect(sink.lines[other]).toEqual([]);
    });

    it('then the line has ts, level, component, msg and the fields [LG-01]', () => {
      const record = JSON.parse(sink.lines[level][0]!);
      expect(record).toEqual({
        ts: expect.any(String),
        level,
        component: 'host',
        msg: 'app failed',
        app: 'todo',
        attempt: 2,
      });
      expect(new Date(record.ts).toISOString()).toBe(record.ts);
    });
  });

  describe('when a call has no fields', () => {
    beforeEach(() => log.info('started'));

    it('then the line has only ts, level, component and msg [LG-01]', () => {
      expect(Object.keys(JSON.parse(sink.lines.info[0]!))).toEqual(['ts', 'level', 'component', 'msg']);
    });
  });

  describe('when a field is an Error', () => {
    beforeEach(() => log.warn('app failed', { error: new TypeError('down') }));

    it('then it is written as { name, message } [LG-01]', () => {
      expect(JSON.parse(sink.lines.warn[0]!).error).toEqual({ name: 'TypeError', message: 'down' });
    });
  });
});

describe('Given a logger created without a sink', () => {
  it('given the global console, when info is called, then the line goes to console.info [LG-01]', () => {
    const original = console.info;
    const lines: string[] = [];
    console.info = (line: string) => void lines.push(line);
    try {
      createLogger('host').info('hello');
    } finally {
      console.info = original;
    }
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 'info', component: 'host', msg: 'hello' });
  });
});
