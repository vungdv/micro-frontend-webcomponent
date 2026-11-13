/**
 * @mf/contracts — the integration contract between the host and micro-frontends.
 * Types and constants only; never runtime behaviour.
 */

/** Event a micro-frontend dispatches (bubbles, composed) to ask the host to navigate. */
export const MF_NAVIGATE = 'mf:navigate' as const;

export interface MfNavigateDetail {
  path: string;
}

/** Custom element tag names of the known micro-frontends. */
export const TAGS = { todo: 'todo-app', weather: 'weather-dashboard', timezone: 'timezone-app', userCard: 'user-card' } as const;

/** One entry of the host manifest (host.config.json). */
export interface AppEntry {
  route: string;
  url: string;
  tag: string;
  attributes?: Record<string, string>;
}

/** Host manifest: app id → entry. */
export interface HostConfig {
  apps: Record<string, AppEntry>;
}

declare global {
  interface HTMLElementEventMap {
    'mf:navigate': CustomEvent<MfNavigateDetail>;
  }
}
