import { defineConfig } from 'vite';

// Dev: the host imports http://localhost:5176/src/weather-app.ts (see packages/host/public/host.config.json).
// Build: a single ES module dist/weather-app.js, deployed under remotes/ in M5.
export default defineConfig({
  server: { port: 5176, strictPort: true, cors: { origin: '*' } },
  preview: { port: 5176, strictPort: true, cors: { origin: '*' } },
  build: {
    lib: { entry: 'src/weather-app.ts', formats: ['es'], fileName: () => 'weather-app.js' },
  },
});
