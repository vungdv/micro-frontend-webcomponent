// A tiny helper that turns a plain function into a custom element.
// The browser requires a class, so we hide it here once and never write one again.
//
// setup({ host, root }) runs when the element is added to the page.
// It may return a cleanup function, which runs when the element is removed.
function defineComponent(name, setup) {
  customElements.define(
    name,
    class extends HTMLElement {
      connectedCallback() {
        const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        this.cleanup = setup({ host: this, root });
      }

      disconnectedCallback() {
        this.cleanup?.();
      }
    }
  );
}
