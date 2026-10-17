// React Native (Expo) adapters for the realistic human: a disk-cached fetcher and an
// expo-gl texture loader. Pass both to loadHumanPackage (useHumanPackage does it for you).
import * as FileSystem from 'expo-file-system/legacy';
import { Texture } from 'three';
import type { HumanTextureLoader, LoadOptions } from '../human/runtime';

const DIR = `${FileSystem.cacheDirectory ?? ''}humanforge/`;
let dirReady: Promise<void> | null = null;

/** Download once into the cache directory; later sessions load offline. */
async function cached(url: string): Promise<string> {
  dirReady ??= FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  await dirReady;
  const file = DIR + url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const info = await FileSystem.getInfoAsync(file);
  if (!info.exists) {
    const res = await FileSystem.downloadAsync(url, file);
    if (res.status !== 200) {
      await FileSystem.deleteAsync(file, { idempotent: true });
      throw new Error(`humanforge: ${res.status} for ${url}`);
    }
  }
  return file;
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
 * a "data texture" whose data is the cached file (same trick expo-three uses).
 */
export const expoTextureLoader: HumanTextureLoader = async (url, size) => {
  const localUri = await cached(url);
  const tex = new Texture();
  tex.image = { data: { localUri }, width: size, height: size };
  (tex as any).isDataTexture = true;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
};

export const expoLoadOptions: LoadOptions = { fetch: expoFetch, loadTexture: expoTextureLoader };
