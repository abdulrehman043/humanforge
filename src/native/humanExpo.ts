// React Native (Expo) adapters for the realistic human: a disk-cached fetcher and an
// expo-gl texture loader. Pass expoLoadOptions to loadHumanPackage / preloadHumanPackage
// (useHumanPackage does it for you).
//
// expo-gl decodes images with stb_image, which has no WebP support, so these options select the
// JPEG/PNG mobile texture pack (manifest.mobileTextures, built by `npm run build:mobile`).
import * as FileSystem from 'expo-file-system/legacy';
import { Texture } from 'three';
import type { HumanTextureLoader, LoadOptions } from '../human/runtime';

const DIR = `${FileSystem.cacheDirectory ?? ''}humanforge/`;
let dirReady: Promise<void> | null = null;

const inflight = new Map<string, Promise<string>>();

/**
 * Download once into the cache directory; later sessions load offline. Concurrent requests for
 * the same URL share one download, and files are written to a temp name and moved into place, so
 * an interrupted download never leaves a broken file in the cache.
 */
export function cached(url: string): Promise<string> {
  let p = inflight.get(url);
  if (!p) {
    p = (async () => {
      dirReady ??= FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
      await dirReady;
      const file = DIR + url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      if ((await FileSystem.getInfoAsync(file)).exists) return file;
      const tmp = `${file}.${Date.now()}.part`;
      const res = await FileSystem.downloadAsync(url, tmp);
      if (res.status !== 200) {
        await FileSystem.deleteAsync(tmp, { idempotent: true });
        throw new Error(`humanforge: ${res.status} for ${url}`);
      }
      await FileSystem.moveAsync({ from: tmp, to: file });
      return file;
    })();
    inflight.set(url, p);
    p.catch(() => {}).finally(() => inflight.delete(url));
  }
  return p;
}

const B64 = new Uint8Array(128);
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((c, i) => (B64[c.charCodeAt(0)] = i));
function fromBase64(s: string): ArrayBuffer {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64[clean.charCodeAt(i)] << 18) | (B64[clean.charCodeAt(i + 1)] << 12) | (B64[clean.charCodeAt(i + 2)] << 6) | B64[clean.charCodeAt(i + 3)];
    out[o++] = n >> 16;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out.buffer;
}

export const expoFetch = async (url: string): Promise<ArrayBuffer> =>
  fromBase64(await FileSystem.readAsStringAsync(await cached(url), { encoding: FileSystem.EncodingType.Base64 }));

/**
 * expo-gl decodes images natively when texImage2D receives `{ localUri }`, so we hand three
 * a "data texture" whose data is the cached file (same trick expo-three uses). The file must be
 * JPEG or PNG (stb_image); WebP uploads silently fail and the mesh renders black.
 */
export const expoTextureLoader: HumanTextureLoader = async (url, size) => {
  if (/\.webp$/i.test(url)) console.warn(`humanforge: expo-gl can't decode WebP (${url}); build/host the mobile texture pack`);
  const localUri = await cached(url);
  const tex = new Texture();
  tex.image = { data: { localUri }, width: size, height: size };
  (tex as any).isDataTexture = true;
  // all pack textures are power-of-two squares, so mipmaps work and avoid shimmer at bust framing
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
};

/** Options for loadHumanPackage / preloadHumanPackage on Expo: disk cache + JPEG/PNG textures. */
export const expoLoadOptions: LoadOptions = { fetch: expoFetch, loadTexture: expoTextureLoader, textureFormat: 'mobile' };
