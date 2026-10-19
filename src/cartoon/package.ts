// Cartoon asset package: manifest + layer URIs, with an optional local file cache (Expo).
import { CartoonConfig, CartoonManifest, CartoonView, cartoonFiles, DEFAULT_CARTOON } from './model';

export interface CartoonPackage {
  baseUrl: string;
  manifest: CartoonManifest;
  /** pixel density of the layer files in use (1 or 2) */
  density: number;
  /** URI to give <Image>: the local cached file when available, else the CDN URL. */
  uri(file: string): string;
  /** Absolute URL of a preview tile (relative path from the manifest). */
  previewUri(rel: string): string;
  /** Make sure files are available offline (no-op without a cache). Resolves when done. */
  ensure(files: string[], onProgress?: (done: number, total: number) => void): Promise<void>;
}

export interface CartoonLoadOptions {
  /** Layer density: 1 (default for phones under 3x or low-memory devices) or 2. */
  density?: number;
  /** Download a URL to a local file and return its URI (Expo: the humanforge disk cache). */
  cacheFile?: (url: string) => Promise<string>;
  /** Fetch the manifest JSON (defaults to fetch). */
  fetchJson?: (url: string) => Promise<unknown>;
}

export async function loadCartoonPackage(baseUrl: string, opts: CartoonLoadOptions = {}): Promise<CartoonPackage> {
  const root = baseUrl.replace(/\/$/, '');
  const manifestUrl = `${root}/manifest.json`;
  const manifest = (opts.fetchJson
    ? await opts.fetchJson(manifestUrl)
    : await (await fetch(manifestUrl)).json()) as CartoonManifest;
  const density = manifest.densities.includes(opts.density ?? 1) ? (opts.density ?? 1) : manifest.densities[0];
  const local = new Map<string, string>();
  const inflight = new Map<string, Promise<void>>();
  const remote = (file: string) => `${root}/${density}x/${file}`;
  const ensureOne = (file: string): Promise<void> => {
    if (!opts.cacheFile || local.has(file)) return Promise.resolve();
    let p = inflight.get(file);
    if (!p) {
      p = opts.cacheFile(remote(file)).then((u) => { local.set(file, u); });
      inflight.set(file, p);
      p.catch(() => inflight.delete(file));
    }
    return p;
  };
  return {
    baseUrl: root, manifest, density,
    uri: (file) => local.get(file) ?? remote(file),
    previewUri: (rel) => `${root}/${rel}`,
    async ensure(files, onProgress) {
      let done = 0;
      await Promise.all(files.map((f) => ensureOne(f).then(() => onProgress?.(++done, files.length))));
    },
  };
}

/** Files for a config's views, downloaded to the cache (first frame then paints from disk). */
export function warmCartoon(pkg: CartoonPackage, config: Partial<CartoonConfig> = {}, opts: { views?: CartoonView[]; onProgress?: (d: number, t: number) => void } = {}) {
  const c = { ...DEFAULT_CARTOON, ...config } as CartoonConfig;
  return pkg.ensure(cartoonFiles(pkg.manifest, c, opts.views ?? pkg.manifest.views), opts.onProgress);
}
