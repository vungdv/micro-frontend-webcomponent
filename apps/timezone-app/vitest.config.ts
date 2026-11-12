import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // Fixed home zone so conversions are deterministic (spec §5: Asia/Ho_Chi_Minh, UTC+07:00, no DST).
    env: { TZ: 'Asia/Ho_Chi_Minh' },
    // Process styles.css so `?inline` returns the real CSS.
    css: { include: [/\.css(\?|$)/] },
  },
});
