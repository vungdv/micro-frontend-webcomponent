import { requestNavigate } from '@mf/shared-contracts';

const TAG = 'todo-app';

/** M1 placeholder for the Todo micro-frontend. Defines only its root element. */
class TodoAppPlaceholder extends HTMLElement {
  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { display: block; font-family: var(--mf-font-family, system-ui, sans-serif); }
        section { padding: 1rem; border: 1px dashed #9aa5b1; border-radius: 6px; }
      </style>
      <section>
        <h2>Todo (placeholder)</h2>
        <p>&lt;todo-app&gt; served from its own dev server.</p>
        <button type="button">Go to Weather</button>
      </section>
    `;
    root.querySelector('button')!.addEventListener('click', () => requestNavigate('#/weather'));
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, TodoAppPlaceholder);
