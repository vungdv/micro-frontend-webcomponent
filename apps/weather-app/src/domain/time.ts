/** Formats an epoch-ms instant as 24-hour `HH:MM` in `timeZone` (default: the runtime's zone). */
export function formatTime(epochMs: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).formatToParts(epochMs);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}
