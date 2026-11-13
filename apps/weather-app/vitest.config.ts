import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Tests resolve Lit like the shipped bundle does: its browser production build.
 * - Vite resolves `development|production` to `development` outside production, and Lit's
 *   development build adds dev-mode `console.warn`s and a `litIssuedWarnings` global (WE-09, WE-29).
 * - Vitest runs tests with server conditions (`node`), and Lit's node build pulls in an SSR DOM
 *   shim that sets a `litServerRoot` global; happy-dom stands in for a browser, so add `browser`.
 * Vitest sets each environment's conditions in its own config hooks, so `resolve.conditions`
 * cannot express this: the plugin rewrites them once every config hook has run.
 */
function litBrowserProductionBuild(): Plugin {
  return {
    name: 'weather:lit-browser-production-build',
    enforce: 'post',
    configEnvironment(_name, config) {
      const conditions = (config.resolve?.conditions ?? []).map((c) =>
        c === 'development|production' || c === 'development' ? 'production' : c,
      );
      config.resolve = { ...config.resolve, conditions: ['browser', ...conditions.filter((c) => c !== 'browser')] };
    },
  };
}

export default defineConfig({
  plugins: [litBrowserProductionBuild()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // Process styles.css so `?inline` returns the real CSS (WE-06 and WE-30 read it).
    css: { include: [/\.css(\?|$)/] },
  },
});
