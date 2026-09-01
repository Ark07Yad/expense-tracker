import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Test files are transformed outside the React plugin's usual path, where the
  // default is the classic runtime — which needs React in scope and fails with
  // "React is not defined". The app's own files are unaffected either way.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  server: { port: 5181 },
  build: {
    rollupOptions: {
      output: {
        /*
         * Recharts and React get their own chunks.
         *
         * They are the two things in here that essentially never change, and
         * keeping them out of the app chunk means a normal deploy invalidates
         * a few tens of kilobytes rather than the whole download.
         */
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'charts';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    /*
     * Two kinds of test in one suite.
     *
     * The engines are pure and run in node — no DOM, and fast enough that the
     * whole set finishes in under half a second. Component tests need jsdom,
     * and opt in per file with a `@vitest-environment jsdom` docblock rather
     * than paying for a document in every unit test.
     */
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test/setup.js'],
    restoreMocks: true,
    environmentOptions: {
      // jsdom only provides localStorage for a real origin. Left at the
      // default the document has an opaque one, `localStorage` is undefined,
      // and every component test fails on hydration rather than on anything
      // it meant to check.
      jsdom: { url: 'http://localhost:5181' },
    },
  },
});
