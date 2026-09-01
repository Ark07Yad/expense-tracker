import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    // The suite covers the pure engines — dates, aggregation, rules — which
    // need no DOM. Anything that does would be a component test, and those
    // are better served by driving the real app.
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
