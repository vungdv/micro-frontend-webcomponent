import type { LogLevel } from './types';

export type LogFields = Record<string, unknown>;

export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

function serialize(value: unknown): unknown {
  return value instanceof Error ? { name: value.name, message: value.message } : value;
}

/** Structured logger: one JSON object per line, with `level`, `component` and `msg` keys. */
export function createLogger(component: string, sink: Console = console): Logger {
  const write = (level: LogLevel, msg: string, fields: LogFields = {}): void => {
    const record: LogFields = { ts: new Date().toISOString(), level, component, msg };
    for (const [key, value] of Object.entries(fields)) record[key] = serialize(value);
    sink[level](JSON.stringify(record));
  };
  return {
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
  };
}
