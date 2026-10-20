import { defineConfig } from 'vite';
import path from 'node:path';

const here = import.meta.dirname;
// 2D avatar creator only: scan just its own pages (the other demos pull in React Native / three.js).
export default defineConfig({
  root: path.join(here, 'demo'),
  publicDir: path.join(here, 'assets'),
  server: { fs: { allow: [here] } },
  optimizeDeps: { entries: ['forge2d.html', 'forge2d-gallery.html'] },
});
