import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
    /** Exclude heavy batch via `npm test` script (`--exclude playtesting/cli.test.ts`), not here, so `npm run playtest` can target that file. */
  },
});
