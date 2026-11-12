import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // Process styles.css so `?inline` returns the real CSS (TD-04 asserts its first rules).
    css: { include: [/\.css(\?|$)/] },
  },
});
