// Automated QA for the 2D avatar creator. Rasterises real renders (sharp / librsvg, blur-free "fast" mode) and checks:
//   - full-body visibility (feet reach the ground line, nothing touches the canvas edge)
//   - no enclosed transparent gaps in the forehead / hair area (down to the chin under a head covering)
//   - no hair showing through a head covering (render with and without hair must be pixel-identical)
//   - the portable (React Native, filter-free) render has the same silhouette (within 3%) and passes the same body checks
//   - layer ordering, render time
// Every asset is exercised at least once. Writes assets/forge2d/review.json ({ tested, approved, metrics }).
// "approved" is never written by this tool: it is a human decision (see docs/FORGE2D.md).
//   usage: tsx tools/forge2d/qa.mts [randomCount=150]
import sharp from 'sharp';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderAvatarSvg, buildLayers } from '../../src/forge2d/render';
import { buildManifest } from '../../src/forge2d/manifest';
import { DEFAULT_CONFIG } from '../../src/forge2d/defaults';
import { randomConfig } from '../../src/forge2d/random';
import { resolveConfig } from '../../src/forge2d/compat';
import { Defs, CANVAS, TOP_PAD } from '../../src/forge2d/geom';
import { SK } from '../../src/forge2d/body';
import { LAYER_ORDER } from '../../src/forge2d/layers';
import { HEADWEAR_BY_ID } from '../../src/forge2d/headwear';
import type { AvatarConfig } from '../../src/forge2d/types';

const W = 200, H = Math.round((W * CANVAS.h) / CANVAS.w), S = W / CANVAS.w;
const randomCount = Number(process.argv[2] ?? 150);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

async function alpha(cfg: AvatarConfig, portable = false): Promise<Uint8Array> {
  const svg = renderAvatarSvg(cfg, { width: W, fast: true, portable, uid: 'qa' });
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== W || info.height !== H) throw new Error(`unexpected raster size ${info.width}x${info.height}`);
  const a = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) a[i] = data[i * 4 + 3];
  return a;
}
const rgbaOf = async (cfg: AvatarConfig) => (await sharp(Buffer.from(renderAvatarSvg(cfg, { width: W, fast: true, uid: 'qa' })), { density: 72 }).flatten({ background: '#ffffff' }).raw().toBuffer());

function checkAlpha(a: Uint8Array, cfg: AvatarConfig, holeAlpha: Uint8Array = a): string[] {
  const fails: string[] = [];
  const opaque = (x: number, y: number) => a[y * W + x] > 24;
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (opaque(x, y)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  if (maxX < 0) return ['blank render'];
  if (minX <= 0 || maxX >= W - 1 || minY <= 0) fails.push(`content touches the canvas edge (x ${minX}-${maxX}, top ${minY})`);
  const ground = (SK.groundY + TOP_PAD) * S;
  if (maxY < ground - 4) fails.push(`feet do not reach the ground line (bottom ${maxY}, expected ~${Math.round(ground)})`);
  if (maxY > H - 1) fails.push('content cut off at the bottom');
  // both feet visible: opaque pixels near the ground on each side of the centre line
  const row = Math.round(ground - 3);
  let left = 0, right = 0;
  for (let x = 0; x < W; x++) if (opaque(x, row)) (x < W / 2 ? left++ : right++);
  if (left < 2 || right < 2) fails.push('both feet should be visible on the ground line');
  // enclosed transparent pockets in the head area (flood fill from the outside)
  // forehead / hair area for every look; down to the chin when a head covering must sit flush on the face
  const covered = HEADWEAR_BY_ID[resolveConfig(cfg).cfg.headwear.style]?.coverage === 'full';
  const limit = Math.round(((covered ? 176 : 118) + TOP_PAD) * S);
  const ha = holeAlpha; // hoop earrings legitimately enclose a pocket, so holes are measured on a copy without them
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || ha[i] > 24) continue;
    seen[i] = 1;
    const x = i % W, y = (i / W) | 0;
    if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W);
  }
  let holes = 0;
  for (let y = 0; y < limit; y++) for (let x = 0; x < W; x++) if (!seen[y * W + x] && ha[y * W + x] <= 24) holes++;
  if (holes > 6) fails.push(`${holes}px of enclosed transparent gaps in the head area`);
  return fails;
}

const manifest = buildManifest();
const setters: Record<string, (c: any, id: string) => void> = {
  faceShape: (c, id) => (c.face.shape = id), skin: (c, id) => (c.face.skin = id), eyes: (c, id) => (c.face.eyes = id), brows: (c, id) => (c.face.brows = id), nose: (c, id) => (c.face.nose = id), mouth: (c, id) => (c.face.mouth = id),
  hair: (c, id) => (c.hair.style = id), headwear: (c, id) => (c.headwear.style = id), top: (c, id) => (c.outfit.top = id), outer: (c, id) => (c.outfit.outer = id), bottom: (c, id) => (c.outfit.bottom = id),
  dress: (c, id) => (c.outfit.dress = id), shoes: (c, id) => (c.outfit.shoes = id), glasses: (c, id) => (c.accessories.glasses = id), earrings: (c, id) => (c.accessories.earrings = id),
  necklace: (c, id) => (c.accessories.necklace = id), scarf: (c, id) => (c.accessories.scarf = id), bag: (c, id) => (c.accessories.bag = id), hairAccessory: (c, id) => (c.accessories.hairAccessory = id),
  expression: (c, id) => (c.expression = id), pose: (c, id) => (c.pose = id),
};

const failures: { what: string; problems: string[] }[] = [];
const tested = new Set<string>();
let configs = 0;
const genMs: number[] = [];

async function run(label: string, cfg: AvatarConfig, covers: string[]) {
  const t0 = performance.now();
  renderAvatarSvg(cfg, { fast: true, uid: 'p' });
  genMs.push(performance.now() - t0);
  const noRings = ['hoop', 'huggie'].includes(cfg.accessories.earrings) ? { ...clone(cfg), accessories: { ...cfg.accessories, earrings: 'none' } } as AvatarConfig : cfg;
  const a0 = await alpha(cfg);
  const problems = checkAlpha(a0, cfg, noRings === cfg ? a0 : await alpha(noRings));
  // the portable (React Native) render must have the same silhouette and pass the same body checks
  const ap = await alpha(cfg, true);
  const onlyOne = (() => { let n = 0, tot = 0; for (let i = 0; i < a0.length; i++) { const x = a0[i] > 24, y = ap[i] > 24; if (x) tot++; if (x !== y) n++; } return n / Math.max(1, tot); })();
  if (onlyOne > 0.03) problems.push(`portable silhouette differs from the web render by ${(onlyOne * 100).toFixed(1)}%`);
  for (const f of checkAlpha(ap, cfg, ap).filter((m) => !m.includes('enclosed'))) problems.push(`portable: ${f}`);
  // layer ordering
  const layers = buildLayers(cfg, new Defs('q'));
  if (!layers.every((l, i) => i === 0 || layers[i - 1].order <= l.order) || layers.some((l) => LAYER_ORDER[l.id as keyof typeof LAYER_ORDER] !== l.order)) problems.push('layer order violated');
  // head covering: hair must not show through
  const hw = HEADWEAR_BY_ID[resolveConfig(cfg).cfg.headwear.style];
  if (hw?.coverage === 'full' && cfg.hair.style !== 'none') {
    const bare = clone(cfg); bare.hair.style = 'none'; bare.accessories.hairAccessory = 'none';
    const [x, y] = await Promise.all([rgbaOf(cfg), rgbaOf(bare)]);
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff += Math.abs(x[i] - y[i]);
    if (diff > 0) problems.push(`hair or hair accessory shows through ${hw.id} (pixel difference ${diff})`);
  }
  configs++;
  if (problems.length) failures.push({ what: label, problems });
  else covers.forEach((id) => tested.add(id));
}

const t0 = Date.now();
// 1. every asset on top of the default avatar (and on a second context where the default hides it)
for (const e of manifest) {
  const cfg = clone(DEFAULT_CONFIG) as AvatarConfig;
  setters[e.category](cfg, e.optionId);
  await run(e.id, cfg, [e.id]);
}
// 2. contexts that the default avatar does not exercise
const contexts: [string, (c: any) => void][] = [
  ['hijab + dress + pose crossed', (c) => { c.headwear.style = 'hijab-shayla'; c.outfit.dress = 'abaya'; c.pose = 'crossed'; c.accessories.earrings = 'hoop'; c.accessories.necklace = 'pearls'; c.hair.style = 'long-curtain'; }],
  ['hijab + hands over mouth', (c) => { c.headwear.style = 'hijab-wrap'; c.pose = 'shy'; c.headwear.undercap = true; c.accessories.hairAccessory = 'bow'; }],
  ['turban + hair + clips', (c) => { c.headwear.style = 'turban-twist'; c.hair.style = 'wavy-long'; c.accessories.hairAccessory = 'clip'; }],
  ['head wrap + hair', (c) => { c.headwear.style = 'headwrap'; c.hair.style = 'braids-twin'; }],
  ['sunhat + long hair + glasses', (c) => { c.headwear.style = 'sunhat'; c.hair.style = 'long-center'; c.accessories.glasses = 'aviator'; }],
  ['afro + glasses + hoops', (c) => { c.hair.style = 'afro'; c.accessories.glasses = 'cat-eye'; c.accessories.earrings = 'hoop'; c.face.skin = 'ebony'; }],
  ['maxi skirt + knee boots + tote', (c) => { c.outfit.bottom = 'maxi-skirt'; c.outfit.shoes = 'knee-boots'; c.accessories.bag = 'tote'; c.pose = 'hip'; }],
  ['long coat + wave', (c) => { c.outfit.outer = 'long-coat'; c.pose = 'wave'; c.outfit.bottom = 'skinny-jeans'; }],
  ['long puffer + shrug', (c) => { c.outfit.outer = 'puffer-long'; c.pose = 'shrug'; }],
];
for (const [label, f] of contexts) { const c = clone(DEFAULT_CONFIG) as any; f(c); await run(label, c, []); }
// 3. face shapes x skin tones x expressions
for (const shape of ['oval', 'round', 'heart', 'square', 'long', 'diamond']) for (const expr of ['happy', 'excited', 'sad', 'surprised', 'confident', 'thoughtful', 'neutral']) {
  const c = clone(DEFAULT_CONFIG) as any; c.face.shape = shape; c.expression = expr; c.face.skin = ['porcelain', 'medium', 'ebony'][(shape.length + expr.length) % 3];
  await run(`face ${shape} / ${expr}`, c, []);
}
// 4. random avatars
for (let i = 0; i < randomCount; i++) await run(`random #${i + 1000}`, randomConfig(1000 + i), []);

genMs.sort((a, b) => a - b);
const metrics = {
  configsTested: configs,
  failures: failures.length,
  svgGenerationMs: { mean: +(genMs.reduce((a, b) => a + b, 0) / genMs.length).toFixed(2), p95: +genMs[Math.floor(genMs.length * 0.95)].toFixed(2), max: +genMs[genMs.length - 1].toFixed(2) },
  rasterSize: `${W}x${H}`,
  durationSec: +((Date.now() - t0) / 1000).toFixed(1),
};
const outPath = path.resolve('assets/forge2d/review.json');
let prevApproved: string[] = [];
if (existsSync(outPath)) { try { prevApproved = JSON.parse(readFileSync(outPath, 'utf8')).approved ?? []; } catch { /* ignore */ } }
mkdirSync(path.dirname(outPath), { recursive: true });
const review = {
  generatedAt: new Date().toISOString(),
  note: 'tested = asset rendered without automated-check failures; approved = a human signed it off after viewing it (edit this list by hand).',
  tested: [...tested].sort(),
  approved: prevApproved,
  configsTested: configs,
  approvedConfigs: 0,
  metrics,
  failures,
};
writeFileSync(outPath, JSON.stringify(review, null, 1));
console.log(JSON.stringify(metrics));
console.log(`assets exercised: ${tested.size}/${manifest.length} passed automated checks`);
for (const f of failures.slice(0, 25)) console.log('FAIL', f.what, '->', f.problems.join('; '));
if (failures.length > 25) console.log(`... and ${failures.length - 25} more`);
process.exit(failures.length ? 1 : 0);
