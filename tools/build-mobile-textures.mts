// Mobile texture pack: JPEG (opaque) / PNG (alpha) copies of every WebP texture, because
// expo-gl decodes images with stb_image, which has no WebP support (WebP -> black mesh).
//
//   npm run build:mobile [-- --skin-2k] [--base-url <url>]   (after build:human / build:garments)
//
// Writes assets/human/mobile/<path>_<tier>.(jpg|png) for tiers 512 and 1k (and 2k skins with
// --skin-2k) and adds `mobileTextures` to the manifest. Web keeps using the WebP files.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve(import.meta.dirname, '../assets/human');
const skin2k = process.argv.includes('--skin-2k');
// --base-url <url>: where the pack will be hosted, if not at <manifest dir>/mobile (e.g. its own CDN tag)
const baseIdx = process.argv.indexOf('--base-url');
const baseUrl = baseIdx > 0 ? process.argv[baseIdx + 1] : undefined;
const manifestPath = path.join(OUT, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const TIERS: [string, number][] = [['512', 512], ['1k', 1024], ['2k', 2048]];

/** key (path without extension and size suffix) -> best source WebP */
const sources = new Map<string, { src: string; size: number }>();
for (const s of manifest.skins) sources.set(`skins/${s.id}`, { src: `skins/${s.id}_2k.webp`, size: 2048 });
for (const e of manifest.eyes) sources.set(`eyes/${e}`, { src: `eyes/${e}.webp`, size: manifest.textureSizes.eyes });
for (const p of manifest.proxies) {
  if (p.texture) sources.set(p.texture.replace(/\.webp$/, ''), { src: p.texture, size: p.textureSize });
  if (p.normalTexture) sources.set(p.normalTexture.replace(/\.webp$/, ''), { src: p.normalTexture, size: 1024 });
}

const files: Record<string, { ext: 'jpg' | 'png'; max: number }> = {};
let total = 0;
for (const [key, { src, size }] of sources) {
  const img = sharp(path.join(OUT, src));
  const { isOpaque } = await img.stats();
  const ext = isOpaque ? 'jpg' : 'png';
  const isSkin = key.startsWith('skins/');
  const normal = key.endsWith('_n');
  // normal maps only at 512 (lite on phones); skins up to 1k (2k optional); others up to their own size
  const max = normal ? 512 : isSkin ? (skin2k ? 2048 : 1024) : Math.min(size, 1024);
  for (const [tier, tierPx] of TIERS) {
    // sources smaller than 512 (brows, lashes) get only the '512' file, at their native size
    if (tierPx > max && tier !== '512') continue;
    const px = Math.min(tierPx, max);
    const out = path.join(OUT, 'mobile', `${key}_${tier}.${ext}`);
    mkdirSync(path.dirname(out), { recursive: true });
    const resized = sharp(path.join(OUT, src)).resize(px, px, { fit: 'fill' });
    // baseline JPEG and paletted PNG: both decode with stb_image (expo-gl)
    const buf = ext === 'jpg'
      ? await resized.removeAlpha().jpeg({ quality: normal ? 85 : 82, progressive: false, mozjpeg: false, chromaSubsampling: '4:2:0' }).toBuffer()
      : await resized.png({ palette: true, quality: 85, effort: 8, compressionLevel: 9 }).toBuffer();
    writeFileSync(out, buf);
    total += buf.length;
  }
  files[key] = { ext, max };
}
manifest.mobileTextures = {
  /** Paths: mobile/<key>_<tier>.<ext>, tier in '512' | '1k' | '2k' up to `max` px. */
  dir: 'mobile', ...(baseUrl ? { baseUrl } : {}), tiers: { '512': 512, '1k': 1024, '2k': 2048 }, files,
};
writeFileSync(manifestPath, JSON.stringify(manifest));
console.log(`mobile textures: ${Object.keys(files).length} textures, ${(total / 1048576).toFixed(1)} MB`);
