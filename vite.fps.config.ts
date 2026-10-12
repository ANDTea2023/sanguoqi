import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: projectRoot,
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist-fps',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./fps.html', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5189,
    strictPort: true,
    open: '/fps.html',
  },
  preview: {
    host: '127.0.0.1',
    port: 5189,
    strictPort: true,
  },
});
