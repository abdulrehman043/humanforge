// Expo helpers for the cartoon avatar: disk cache (shared with the 3D human), preload and a hook.
import { useEffect, useState } from 'react';
import { PixelRatio } from 'react-native';
import { cached } from '../native/humanExpo';
import { CartoonConfig, CartoonView } from './model';
import { CartoonPackage, loadCartoonPackage, warmCartoon } from './package';

/**
 * Layer density for an avatar drawn `width` points wide. 1x unless the avatar is drawn large on a
 * dense screen (> 760 px wide): GPU fill rate is what limits swiping on weak phones, and 1x layers
 * need a quarter of the pixels and memory of 2x. Pass `density: 2` to force sharper layers.
 */
export const cartoonDensity = (width = 260) => (PixelRatio.get() * width > 760 ? 2 : 1);

const packages = new Map<string, Promise<CartoonPackage>>();
function getPackage(baseUrl: string, density: number) {
  const key = `${baseUrl}@${density}`;
  let p = packages.get(key);
  if (!p) {
    p = loadCartoonPackage(baseUrl, { density, cacheFile: cached });
    packages.set(key, p);
    p.catch(() => packages.delete(key));
  }
  return p;
}

export interface CartoonPreloadOptions {
  config?: Partial<CartoonConfig>;
  /** Width the avatar will be shown at (points), to pick the density. Default 260. */
  width?: number;
  density?: number;
  views?: CartoonView[];
  onProgress?: (done: number, total: number) => void;
}

/** Download the manifest and every layer of `config` (all angles) to disk; resolve when done. */
export async function preloadCartoon(baseUrl: string, opts: CartoonPreloadOptions = {}) {
  const pkg = await getPackage(baseUrl, opts.density ?? cartoonDensity(opts.width));
  await warmCartoon(pkg, opts.config, opts);
  return pkg;
}

/** `ready`: the first frame can be drawn from disk (manifest + this look's layers cached). */
export function useCartoonPackage(baseUrl: string, opts: Omit<CartoonPreloadOptions, 'onProgress'> & { preload?: boolean } = {}) {
  const [pkg, setPkg] = useState<CartoonPackage | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const density = opts.density ?? cartoonDensity(opts.width);
  const key = JSON.stringify([opts.config ?? null, density, opts.preload ?? true]);
  useEffect(() => {
    let live = true;
    setReady(false);
    getPackage(baseUrl, density).then(async (p) => {
      if (!live) return;
      setPkg(p);
      if (opts.preload !== false) await warmCartoon(p, opts.config, { views: opts.views, onProgress: (d, t) => live && setProgress(d / t) });
      if (live) { setProgress(1); setReady(true); }
    }).catch((e) => live && setError(e));
    return () => { live = false; };
  }, [baseUrl, key]);
  return { pkg, ready, progress, error };
}
