import { defineConfig } from 'vite';

// Host shell: a normal Vite app (index.html entry). Remotes are loaded at runtime via import(url).
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    cors: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
});
