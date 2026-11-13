import { TAGS } from '@mf/contracts';

const STYLES = ':host{display:block}:host([hidden]){display:none}';

/**
 * Simple name card micro-frontend.
 *
 * @tag user-card
 * @attr {string} name - Name to greet. Defaults to "guest".
 */
export class UserCardElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['name'];
  }

  readonly #root: ShadowRoot;

  constructor() {
    super();
    // Constructor only sets up the shadow root: no attribute reads, no children.
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.innerHTML = `<style>${STYLES}</style>
<div part="card">
  <h2>Hello, <span data-testid="name"></span></h2>
  <p>Welcome to my application!</p>
</div>`;
  }

  connectedCallback(): void {
    this.#render();
  }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue !== newValue && this.isConnected) this.#render();
  }

  #render(): void {
    // textContent, not innerHTML: the attribute value is never parsed as HTML.
    this.#root.querySelector('[data-testid="name"]')!.textContent =
      this.getAttribute('name')?.trim() || 'guest';
  }
}

if (!customElements.get(TAGS.userCard)) {
  customElements.define(TAGS.userCard, UserCardElement);
}
