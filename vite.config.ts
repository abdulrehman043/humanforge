import { defineConfig } from 'vite';
import path from 'node:path';

const here = import.meta.dirname;
// Demo pages live in demo/; the built human package (assets/human) is served at /human/.
// (The React Native editor demo has its own config: vite.forge2d-native.config.ts.)
export default defineConfig({
  root: path.join(here, 'demo'),
  publicDir: path.join(here, 'assets'),
  server: { fs: { allow: [here] } },
  optimizeDeps: { entries: ['index.html', 'human.html', 'wardrobe.html', 'garments.html', 'calibrate.html', 'forge2d.html', 'forge2d-gallery.html'] },
});
