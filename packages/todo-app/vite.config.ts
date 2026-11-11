import { defineConfig } from 'vite';

// Dev: the host imports http://localhost:5175/src/todo-app.ts (see packages/host/public/host.config.json).
// Build: a single ES module dist/todo-app.js, deployed under remotes/ in M5.
export default defineConfig({
  server: { port: 5175, strictPort: true, cors: { origin: '*' } },
  preview: { port: 5175, strictPort: true, cors: { origin: '*' } },
  build: {
    lib: { entry: 'src/todo-app.ts', formats: ['es'], fileName: () => 'todo-app.js' },
  },
});
