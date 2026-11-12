const STYLES = ':host{display:block}:host([hidden]){display:none}';

/**
 * Placeholder empty-state page (M1). M2 replaces it with the Vue todo list.
 * Renders the "check the weather" link only when a weather route is given.
 */
export function renderEmptyPage(root: ShadowRoot, weatherRoute: string | null): void {
  root.innerHTML = `<style>${STYLES}</style>
<section part="todo">
  <h2>Todo placeholder</h2>
</section>`;
  if (weatherRoute === null) return;
  const link = document.createElement('a');
  link.href = weatherRoute;
  link.dataset.navigate = '';
  link.textContent = 'Nothing to do. Check the weather?';
  root.querySelector('section')?.append(link);
}
