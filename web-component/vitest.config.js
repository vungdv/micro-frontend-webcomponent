import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Simulated browser DOM (customElements, Shadow DOM, events) inside Node.
    environment: 'jsdom',
    // Undo every vi.spyOn / vi.fn mock after each test (same as calling vi.restoreAllMocks()).
    restoreMocks: true,
  },
});
