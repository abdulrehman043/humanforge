// Smoke test for the realistic human package (run `npm run build:human` first).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_HUMAN, evaluateShape, loadHumanPackage } from '../src/human/runtime';
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
console.log(`human: ${m.body.triangles} body tris, ${pkg.morphs.size} morphs, ${m.proxies.length} proxies, ${m.skins.length} skins, height ${short.toFixed(2)}–${tall.toFixed(2)} m`);
console.log(fails ? `${fails} failures` : 'all human checks passed');
process.exit(fails ? 1 : 0);
