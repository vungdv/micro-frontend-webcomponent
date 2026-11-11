/**
 * Integration contract between the host and the micro-frontends.
 * Apps depend on this package only; they never import host code.
 */

/** Event an app dispatches on `window` to ask the host to change route. */
export const MF_NAVIGATE = 'mf:navigate';

export interface NavigateDetail {
  /** Hash route, for example `#/weather` or `#/`. */
  path: string;
}

declare global {
  interface WindowEventMap {
    [MF_NAVIGATE]: CustomEvent<NavigateDetail>;
  }
}

/**
 * Ask the host to navigate. The host decides whether to act on it.
 * Dispatched on `window` with `bubbles: true, composed: true`, as the contract requires.
 */
export function requestNavigate(path: string, target: EventTarget = window): void {
  target.dispatchEvent(
    new CustomEvent<NavigateDetail>(MF_NAVIGATE, { detail: { path }, bubbles: true, composed: true }),
  );
}
