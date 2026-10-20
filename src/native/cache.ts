// Expo disk cache for the realistic human packages (no three.js here, so it can be reused without the 3D renderer).
import * as FileSystem from 'expo-file-system/legacy';

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
