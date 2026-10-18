// Smoke test for the realistic human package (run `npm run build:human` first).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_HUMAN, evaluateShape, humanAssetsFor, loadHumanPackage, preloadHumanPackage } from '../src/human/runtime';
import { Texture } from 'three';
import { readGlb } from '../src/human/glb';
import { DETAIL_SLIDERS } from '../src/human/sliders';

const dir = path.resolve('assets/human');
if (!existsSync(path.join(dir, 'manifest.json'))) {
  console.log('assets/human not built; skipping human smoke test');
  process.exit(0);
}
let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.error('FAIL', msg); } };
const fsFetch = async (url: string) => { const b = readFileSync(path.join(dir, url.replace(/^file:\/\/human\//, ''))); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };

const pkg = await loadHumanPackage('file://human', { fetch: fsFetch, loadTexture: async () => { throw new Error('no textures in node'); } });
const m = pkg.manifest;
check(pkg.morphs.size === m.shapes.morphs.length, 'all morphs decoded');
const height = (P: Float32Array) => { let lo = Infinity, hi = -Infinity; for (let i = 1; i < 13380 * 3; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); } return hi - lo; };
const base = evaluateShape(pkg, DEFAULT_HUMAN);
check(!base.some(Number.isNaN), 'default shape finite');
const tall = height(evaluateShape(pkg, { ...DEFAULT_HUMAN, height: 1, gender: 1 }));
const short = height(evaluateShape(pkg, { ...DEFAULT_HUMAN, height: 0, gender: 0 }));
check(tall > short + 0.2, `height slider works (${short.toFixed(2)}m .. ${tall.toFixed(2)}m)`);
for (const s of DETAIL_SLIDERS) {
  for (const t of [...s.neg, ...s.pos]) check(pkg.morphs.has(t), `detail target ${t}`);
}
for (const p of m.proxies) {
  const prim = readGlb(await pkg.fetchBinary(`file://human/${p.file}`));
  const refs = prim.attributes._REFS.array;
  let mx = 0; for (const v of refs) mx = Math.max(mx, v);
  check(mx < m.vertexCount, `${p.file} refs in range`);
  check(!p.texture || existsSync(path.join(dir, p.texture)), `${p.file} texture exists`);
}
for (const s of m.skins) check(existsSync(path.join(dir, `skins/${s.id}_2k.webp`)), `skin ${s.id}`);
// mobile texture pack (JPEG/PNG for expo-gl): every key/tier resolves to a decodable file
if (m.mobileTextures) {
  const mfetch = async (url: string) => { const local = url.replace(/^file:\/\/human\//, '').replace(/^mobile:\/\//, 'mobile/'); const b = readFileSync(path.join(dir, local)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
  const seen: string[] = [];
  const mpkg = await loadHumanPackage('file://human', {
    fetch: mfetch, textureFormat: 'mobile', mobileBaseUrl: 'mobile://',
    loadTexture: async (url, size) => { seen.push(`${url} ${size}`); return new Texture(); },
  });
  check(mpkg.textureFormat === 'mobile', 'mobile format selected');
  let bad = 0, progressive = 0;
  for (const [key, e] of Object.entries(m.mobileTextures.files)) {
    for (const tier of ['512', '1k', '2k'] as const) {
      const { url, size } = mpkg.resolveTexture(key, tier, 4096);
      const file = path.join(dir, url.replace(/^mobile:\/\//, 'mobile/'));
      if (!existsSync(file)) { bad++; console.error('missing', file); continue; }
      const b = readFileSync(file);
      const jpg = b[0] === 0xff && b[1] === 0xd8, png = b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
      if (!(e.ext === 'jpg' ? jpg : png)) bad++;
      if (jpg && b.includes(Buffer.from([0xff, 0xc2]))) progressive++; // SOF2
      if (size > e.max || size > { '512': 512, '1k': 1024, '2k': 2048 }[tier]) bad++;
    }
  }
  check(bad === 0, `mobile pack: ${Object.keys(m.mobileTextures.files).length} textures resolve to JPEG/PNG at every tier`);
  check(progressive === 0, 'mobile JPEGs are baseline (stb_image friendly)');
  const look = { ...DEFAULT_HUMAN, hair: 'long01', clothes: ['female_casualsuit01', 'shoes01'] };
  const assets = humanAssetsFor(mpkg, look, { textureSize: '1k' });
  check(assets.textures.every((t) => /\.(jpg|png)$/.test(t.url)) && assets.meshes.length >= 6, `first-frame assets: ${assets.meshes.length} meshes, ${assets.textures.length} JPEG/PNG textures`);
  let steps = 0;
  const pre = await preloadHumanPackage('file://human', {
    fetch: mfetch, textureFormat: 'mobile', mobileBaseUrl: 'mobile://', loadTexture: async () => new Texture(),
    config: look, textureSize: '1k', onProgress: (d, t) => { steps = t; },
  });
  check(steps === assets.meshes.length + assets.textures.length && pre.proxyCache.size === assets.meshes.length && pre.textureCache.size === assets.textures.length,
    `preload fills caches (${pre.proxyCache.size} meshes, ${pre.textureCache.size} textures)`);
  const web = humanAssetsFor(pkg, look, { textureSize: '2k' });
  check(web.textures.every((t) => t.url.endsWith('.webp')) && web.textures.some((t) => t.url.endsWith('_2k.webp')), 'web keeps WebP');
}
console.log(`human: ${m.body.triangles} body tris, ${pkg.morphs.size} morphs, ${m.proxies.length} proxies, ${m.skins.length} skins, height ${short.toFixed(2)}–${tall.toFixed(2)} m`);
console.log(fails ? `${fails} failures` : 'all human checks passed');
process.exit(fails ? 1 : 0);
