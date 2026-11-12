import type { Units } from '../domain/units.ts';

const STYLES = ':host{display:block}:host([hidden]){display:none}';

/** Placeholder dashboard page (M1). M3 replaces it with the Lit dashboard. */
export function renderDashboardPage(root: ShadowRoot, units: Units): void {
  root.innerHTML = `<style>${STYLES}</style>
<section part="dashboard">
  <h2>Weather placeholder</h2>
  <p>Units: <output data-testid="units">${units}</output></p>
</section>`;
}
