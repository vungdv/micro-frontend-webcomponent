class CounterButton extends HTMLElement {
  constructor() {
    super();
    console.log('constructed');
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    console.log('connected');
    this.shadowRoot.innerHTML = `
      <button>10</button>
    `;
    this.button = this.shadowRoot.querySelector('button');
    this.button.addEventListener('click', () => {
      let count = parseInt(this.button.textContent);
      count++;
      this.button.textContent = count;
    });
  }

  disconnectedCallback() {
    console.log('disconnected');
  }
}

customElements.define('counter-button', CounterButton);