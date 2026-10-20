import { defineConfig } from 'vite';
import path from 'node:path';

const here = import.meta.dirname;
// react-native-web harness for the React Native Forge2D editor (demo/forge2d-native.html): runs the real RN code and
// react-native-svg's web build in a browser to check layout and logic. Device performance must still be measured on phones.
export default defineConfig({
  root: path.join(here, 'demo'),
  publicDir: path.join(here, 'assets'),
  resolve: {
    alias: { 'react-native': path.join(here, 'demo/stubs/rn-web-shim.ts') },
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.mjs', '.json'],
  },
  define: { __DEV__: 'true', 'process.env.NODE_ENV': '"development"', global: 'globalThis' },
  optimizeDeps: {
    entries: ['forge2d-native.html'],
    include: ['react-native-web', 'react-native-svg'],
    // prebundle react-native-svg with its web files (*.web.js) instead of the native fabric modules
    rolldownOptions: { resolve: { extensions: ['.web.js', '.web.ts', '.web.tsx', '.js', '.ts', '.tsx', '.json'] } },
  },
  server: { fs: { allow: [here] } },
});
