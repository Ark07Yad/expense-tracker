import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5181 },
  test: {
    // The suite covers the pure engines — dates, aggregation, rules — which
    // need no DOM. Anything that does would be a component test, and those
    // are better served by driving the real app.
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
