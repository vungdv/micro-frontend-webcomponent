import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5178, strictPort: true, cors: true },
  preview: { port: 5178, strictPort: true, cors: true },
  build: {
    lib: { entry: 'src/web-component.ts', formats: ['es'], fileName: () => 'user-card-app.js' },
  },
});
