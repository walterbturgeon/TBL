import { defineConfig } from 'vite';

// base './' : le jeu fonctionne aussi dans un sous-dossier (GitHub Pages, serveur local, etc.).
export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
  },
});
