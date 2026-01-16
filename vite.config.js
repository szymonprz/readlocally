import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: '/readlocally/',
  build: {
    outDir: 'dist',
  },
});
