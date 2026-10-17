import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.PUBLIC_BASE_PATH ?? '/',
  server: {
    // The project is on a Windows drive while Vite runs in WSL; inotify does
    // not reliably report edits made by Windows tools on /mnt/c.
    watch: { usePolling: true, interval: 500 },
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', ws: true },
    },
  },
});
