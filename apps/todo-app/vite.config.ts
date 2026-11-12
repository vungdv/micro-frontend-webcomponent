import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Remote micro-frontend: library mode, web-component.ts -> one self-contained ES module with Vue bundled in.
// The dev server also serves the standalone harness (index.html) at /.
export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  // Library mode does not replace process.env.NODE_ENV, which Vue's ESM build reads. Only the
  // production mode ships Vue's production build; any other --mode gets the development build.
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
  },
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
}));
