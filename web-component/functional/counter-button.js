// defineComponent comes from define-component.js, loaded first in index.html.

// Pure function: state in, HTML out.
const view = (count) => `<button>${count}</button>`;

function CounterButton({ root }) {
  console.log('connected');

  // State lives in a closure instead of on `this`.
  let count = 10;

  const render = () => {
    root.innerHTML = view(count);
  };

  // One listener on the shadow root survives re-renders (event delegation).
  const onClick = (e) => {
    if (e.target.closest('button')) {
      count++;
      render();
    }
  };

  render();
  root.addEventListener('click', onClick);

  // Cleanup, runs on disconnect.
  return () => {
    console.log('disconnected');
    root.removeEventListener('click', onClick);
  };
}

defineComponent('counter-button', CounterButton);
