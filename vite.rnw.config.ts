import { defineConfig } from 'vite';
import path from 'node:path';

const here = import.meta.dirname;
// react-native-web harness for the cartoon components (demo/cartoon.html): runs the real RN code
// in a browser to check layout and behavior. Device performance must still be measured on phones.
export default defineConfig({
  root: path.join(here, 'demo'),
  publicDir: path.join(here, 'assets'),
  resolve: {
    alias: { 'react-native': 'react-native-web', 'react-native-view-shot': path.join(here, 'demo/stubs/view-shot.ts') },
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.mjs', '.json'],
  },
  define: { __DEV__: 'true', 'process.env.NODE_ENV': '"development"', global: 'globalThis' },
  optimizeDeps: { include: ['react-native-web'], exclude: ['react-native-view-shot'] },
  server: { fs: { allow: [here] } },
  plugins: [{
    // ?slow on a layer URL delays it 1.5 s: simulates a slow network to check swaps never blank
    name: 'slow-layers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.includes('slow=1')) return next();
        // like a phone's image cache: a file is slow the first time only
        const seen = ((globalThis as any).__seen ??= new Set<string>());
        const key = req.url.split('?')[0];
        if (seen.has(key)) return next();
        seen.add(key);
        res.setHeader('Cache-Control', 'max-age=3600');
        setTimeout(next, 1500);
      });
    },
  }],
});
