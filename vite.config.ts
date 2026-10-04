import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

// base './' : le jeu fonctionne aussi dans un sous-dossier (GitHub Pages, serveur local, etc.).
// plugin-legacy : une deuxième version du jeu pour les vieux navigateurs (télé, Fire TV / Silk).
export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  plugins: [
    legacy({
      targets: ['chrome >= 61', 'android >= 5', 'safari >= 11', 'firefox >= 60', 'edge >= 79'],
      // la version « moderne » doit aussi marcher sur les navigateurs de télé de quelques années
      modernTargets: ['chrome >= 64', 'safari >= 12', 'firefox >= 67', 'edge >= 79'],
      modernPolyfills: true,
    }),
  ],
  build: {
    target: 'es2017',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
});
