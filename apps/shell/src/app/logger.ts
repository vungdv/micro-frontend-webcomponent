export interface Logger {
  warn(message: string, data: Record<string, unknown>): void;
}

/** Structured (machine-readable) warnings on the console, tagged with the emitting component. */
export function createConsoleLogger(sink: Pick<Console, 'warn'> = console, component = 'mf-host'): Logger {
  return {
    warn(message, data) {
      sink.warn({ ...data, level: 'warn', component, message, time: new Date().toISOString() });
    },
  };
}
