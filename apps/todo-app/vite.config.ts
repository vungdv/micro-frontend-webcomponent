import { defineConfig } from 'vite';

// Remote micro-frontend: library mode, web-component.ts -> one self-contained ES module.
// The dev server also serves the standalone harness (index.html) at /.
export default defineConfig({
  server: {
    port: 5175,
    strictPort: true,
    cors: true,
  },
  preview: {
    port: 5175,
    strictPort: true,
    cors: true,
  },
  build: {
    lib: {
      entry: 'src/web-component.ts',
      formats: ['es'],
      fileName: () => 'todo-app.js',
    },
  },
});
