import { defineConfig } from 'vite';
import path from 'node:path';

const here = import.meta.dirname;
// Demo pages live in demo/; the built human package (assets/human) is served at /human/.
export default defineConfig({
  root: path.join(here, 'demo'),
  publicDir: path.join(here, 'assets'),
  server: { fs: { allow: [here] } },
});
