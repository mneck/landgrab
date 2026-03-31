import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { defaultExclude } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/games': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:8000',
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    /** Long batch runner; use `npm run test:playtest-batch` or `npm run playtest` (see playtesting/cli.test.ts env vars). */
    exclude: [...defaultExclude, '**/playtesting/cli.test.ts'],
  },
});
