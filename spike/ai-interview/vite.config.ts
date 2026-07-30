import { defineConfig } from 'vite';

// Serves the candidate + review pages and proxies /api to the Express control plane.
export default defineConfig({
  root: 'web',
  server: {
    port: 5180,
    proxy: {
      '/api': `http://localhost:${process.env.PORT ?? 4100}`,
    },
  },
});
