import type { AppEntry, HostConfig } from '@mf/contracts';

export type Apps = HostConfig['apps'];
export type ErrorScope = 'global' | 'route';

/** Facts reported to the mediator by colleagues (and by create-host.ts for `mf:navigate`). */
export type HostEvent =
  | { type: 'start' }
  | { type: 'configLoaded'; config: HostConfig }
  | { type: 'configFailed'; message: string }
  | { type: 'routeChanged'; hash: string; appId: string | null }
  | { type: 'appLoaded'; appId: string; activationId: number }
  | { type: 'appFailed'; appId: string; activationId: number; message: string; /** Underlying error, for logs only. */ cause?: string }
  | { type: 'retryRequested'; scope: ErrorScope }
  | { type: 'navigateRequested'; path: string };

/** Callback every colleague receives to report what happened. */
export type Notify = (event: HostEvent) => void;

/** Instructions the mediator sends to colleagues. */
export type HostCommand =
  | { type: 'config.load' }
  | { type: 'header.render'; apps: Apps }
  | { type: 'header.setActive'; appId: string | null }
  | { type: 'router.start'; apps: Apps }
  | { type: 'router.navigate'; path: string }
  | { type: 'loader.load'; appId: string; entry: AppEntry; activationId: number; retry: boolean }
  | { type: 'outlet.showHome'; apps: Apps }
  | { type: 'outlet.showLoading'; entry: AppEntry }
  | { type: 'outlet.showNotFound'; hash: string }
  | { type: 'outlet.showError'; scope: ErrorScope; message: string; retryable: boolean }
  | { type: 'outlet.mount'; entry: AppEntry }
  | { type: 'log.warn'; message: string; data: Record<string, unknown> };

/** What the user currently sees. */
export type Phase =
  | { kind: 'booting' }
  | { kind: 'fatalError' }
  | { kind: 'home' }
  | { kind: 'notFound'; hash: string }
  | { kind: 'loadingApp'; appId: string; activationId: number }
  | { kind: 'appActive'; appId: string; activationId: number }
  | { kind: 'appError'; appId: string; activationId: number };

export interface HostState {
  phase: Phase;
  /** null until configLoaded. */
  config: HostConfig | null;
  /** Last activation id handed out; each entry into loadingApp increments it. */
  lastActivationId: number;
}

export interface Transition {
  state: HostState;
  commands: HostCommand[];
}
