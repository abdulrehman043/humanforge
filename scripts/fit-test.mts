// Unit tests for the selfie fitting solver (src/human/fit.ts).
// Pure-math tests always run; the shape-recovery tests need a built assets/human package.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_HUMAN, HumanConfig, evaluateShape, loadHumanPackage } from '../src/human/runtime';
import { FIT_SLIDERS, fitFaceShape, fitSelfie, pickEyes, pickSkin, shapeAtLandmarks, similarityAlign, solveBoxRidge } from '../src/human/fit';
import { FACE_MAP } from '../src/human/faceMap';

let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.error('FAIL', msg); } else console.log('  ok', msg); };

// deterministic RNG
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const randn = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

function rotation(ax: number, ay: number, az: number) {
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(ax), Math.sin(ax), Math.cos(ay), Math.sin(ay), Math.cos(az), Math.sin(az)];
  const X = [1, 0, 0, 0, ca, -sa, 0, sa, ca], Y = [cb, 0, sb, 0, 1, 0, -sb, 0, cb], Z = [cc, -sc, 0, sc, cc, 0, 0, 0, 1];
  const mul = (A: number[], B: number[]) => A.map((_, i) => [0, 1, 2].reduce((s, k) => s + A[Math.floor(i / 3) * 3 + k] * B[k * 3 + (i % 3)], 0));
  return mul(Z, mul(Y, X));
}
function transform(p: Float64Array, R: number[], s: number, t: number[]) {
  const o = new Float64Array(p.length);
  for (let i = 0; i < p.length; i += 3) for (let r = 0; r < 3; r++) o[i + r] = s * (R[r * 3] * p[i] + R[r * 3 + 1] * p[i + 1] + R[r * 3 + 2] * p[i + 2]) + t[r];
  return o;
}

console.log('solver math');
{
  // similarityAlign recovers a known transform
  const src = Float64Array.from({ length: 60 }, () => randn());
  const R = rotation(0.3, -0.5, 0.2);
  const dst = transform(src, R, 2.5, [1, -2, 3]);
  const T = similarityAlign(src, dst);
  const back = T.apply(src);
  let e = 0; for (let i = 0; i < dst.length; i++) e = Math.max(e, Math.abs(back[i] - dst[i]));
  check(Math.abs(T.s - 2.5) < 1e-9 && e < 1e-9, `similarityAlign exact (scale ${T.s.toFixed(6)}, max err ${e.toExponential(1)})`);
}
{
  // solveBoxRidge: unconstrained solution matches normal equations; bounds are respected
  const m = 40, n = 4;
  const cols = Array.from({ length: n }, () => Float64Array.from({ length: m }, () => randn()));
  const xt = [0.3, -0.2, 0.8, 0.1];
  const b = new Float64Array(m);
  for (let r = 0; r < m; r++) for (let j = 0; j < n; j++) b[r] += cols[j][r] * xt[j];
  const big = new Float64Array(n).fill(10), zero = new Float64Array(n);
  const x = solveBoxRidge(cols, b, { lambda: zero, lo: big.map(() => -10), hi: big });
  check(xt.every((v, j) => Math.abs(v - x[j]) < 1e-6), `solveBoxRidge exact LS (${Array.from(x, (v) => v.toFixed(3)).join(', ')})`);
  const xb = solveBoxRidge(cols, b, { lambda: zero, lo: zero, hi: new Float64Array(n).fill(0.5) });
  check(xb.every((v) => v >= 0 && v <= 0.5) && xb[1] === 0 && xb[2] === 0.5, `solveBoxRidge clamps (${Array.from(xb, (v) => v.toFixed(3)).join(', ')})`);
  const xr = solveBoxRidge(cols, b, { lambda: new Float64Array(n).fill(1e6), lo: big.map(() => -10), hi: big });
  check(xr.every((v) => Math.abs(v) < 1e-3), 'solveBoxRidge ridge shrinks to prior');
}
check(pickEyes([40, 80, 120]).includes('blue'), `pickEyes blue-ish -> ${pickEyes([40, 80, 120])}`);
check(pickEyes([60, 30, 15]).startsWith('brown'), `pickEyes dark brown -> ${pickEyes([60, 30, 15])}`);
const skinList = Object.keys((await import('../src/human/faceMap')).SKIN_COLORS).map((id) => ({ id, tags: id.split('_') }));
{
  const dark = pickSkin([95, 60, 42], { gender: 1, age: 0.1 }, skinList);
  const light = pickSkin([230, 185, 160], { gender: 0, age: 0.1 }, skinList);
  check(dark.skin.includes('african') && dark.skin.includes('male'), `pickSkin dark male -> ${dark.skin} ${dark.skinTint}`);
  check(!light.skin.includes('african') && light.skin.includes('female'), `pickSkin light female -> ${light.skin} ${light.skinTint}`);
}
check(FACE_MAP.vertex.length === 468 && new Set(FACE_MAP.vertex).size > 400, 'FACE_MAP has 468 mostly-unique vertices');

const dir = path.resolve('assets/human');
if (!existsSync(path.join(dir, 'manifest.json'))) {
  console.log('assets/human not built; skipping shape-recovery tests');
} else {
  console.log('shape recovery');
  const fsFetch = async (url: string) => { const b = readFileSync(path.join(dir, url.replace(/^file:\/\/human\//, ''))); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
  const pkg = await loadHumanPackage('file://human', { fetch: fsFetch, loadTexture: async () => { throw new Error('no textures'); } });
  const pose = (p: Float64Array) => {
    const o = transform(p, rotation(0.15, 0.25, -0.1), 3100, [400, -300, 50]); // metres -> "pixels", tilted head
    for (let i = 0; i < o.length; i++) o[i] += randn() * 0.6;                 // ~0.2 mm landmark noise
    return o;
  };

  // 1. neutral face in -> near-neutral sliders out
  {
    const t0 = performance.now();
    const res = fitFaceShape(pkg, pose(shapeAtLandmarks(evaluateShape(pkg, DEFAULT_HUMAN))), { macros: [] });
    const ms = performance.now() - t0;
    const mx = Math.max(...FIT_SLIDERS.map((s) => Math.abs(res.config.detail[s.id] ?? 0)));
    check(mx < 0.15, `neutral input stays neutral (max |slider| ${mx.toFixed(3)}, ${ms.toFixed(0)} ms)`);
  }

  // 2. random faces: recover sliders
  for (let trial = 0; trial < 3; trial++) {
    const truth: HumanConfig = { ...DEFAULT_HUMAN, detail: {} };
    const chosen = FIT_SLIDERS.filter(() => rand() < 0.3);
    for (const s of chosen) truth.detail[s.id] = (s.neg.length ? rand() * 2 - 1 : rand()) * 0.8;
    const res = fitFaceShape(pkg, pose(shapeAtLandmarks(evaluateShape(pkg, truth))), { macros: [] });
    // geometric agreement: the fitted shape should explain the target far better than neutral
    const a = FIT_SLIDERS.map((s) => truth.detail[s.id] ?? 0), b = FIT_SLIDERS.map((s) => res.config.detail[s.id] ?? 0);
    const dot = a.reduce((s, v, i) => s + v * b[i], 0), na = Math.hypot(...a), nb = Math.hypot(...b);
    check(res.error < res.initialError * 0.35, `trial ${trial}: error ${res.initialError.toFixed(4)} -> ${res.error.toFixed(4)}`);
    check(dot / (na * nb) > 0.6, `trial ${trial}: slider correlation ${(dot / (na * nb)).toFixed(2)} (${chosen.length} sliders)`);
    check(b.every((v) => v >= -1 && v <= 1), `trial ${trial}: sliders within -1..1`);
  }

  // 3. macros: a male face is recognized as more male than the neutral start
  {
    const male = { ...DEFAULT_HUMAN, gender: 0.95, detail: {} };
    const res = fitFaceShape(pkg, pose(shapeAtLandmarks(evaluateShape(pkg, male))), { macros: ['gender'] });
    check(res.config.gender > 0.7, `gender recovered from geometry (0.95 -> ${res.config.gender.toFixed(2)})`);
  }

  // 4. smile in the photo is absorbed by nuisance expressions, not by mouth width
  {
    const smile = shapeAtLandmarks(evaluateShape(pkg, DEFAULT_HUMAN));
    const m = pkg.morphs.get('expr/mouth-corner-puller')!;
    const rows = new Map<number, number[]>();
    FACE_MAP.vertex.forEach((v, i) => rows.set(v, [...(rows.get(v) ?? []), i]));
    for (let i = 0; i < m.idx.length; i++) for (const r of rows.get(m.idx[i]) ?? []) for (let k = 0; k < 3; k++) smile[r * 3 + k] += m.d[i * 3 + k] * m.scale * 0.8;
    const res = fitFaceShape(pkg, pose(smile), { macros: [] });
    check(Math.abs(res.config.detail.mouthWidth ?? 0) < 0.2 && res.expression['mouth-corner-puller'] > 0.4,
      `smile -> expression ${res.expression['mouth-corner-puller'].toFixed(2)}, mouthWidth ${(res.config.detail.mouthWidth ?? 0).toFixed(2)}`);
  }

  // 5. The reference face (calibrated mean MediaPipe face) maps to the neutral avatar (no bias)
  {
    const lms = Array.from({ length: 468 }, (_, i) => ({ x: FACE_MAP.reference[i * 3] * 2000 / 640 + 0.5, y: -FACE_MAP.reference[i * 3 + 1] * 2000 / 800 + 3.6, z: -FACE_MAP.reference[i * 3 + 2] * 2000 / 640 }));
    const fit = fitSelfie(pkg, lms, { width: 640, height: 800 }, undefined, { macros: [] });
    const mx = Math.max(...FIT_SLIDERS.map((s) => Math.abs(fit.config.detail[s.id] ?? 0)));
    check(mx < 0.05 && fit.error < 0.002, `reference face -> neutral (max |slider| ${mx.toFixed(3)}, err ${fit.error.toFixed(4)})`);
  }

  // 6. fitSelfie end-to-end on synthetic MediaPipe-style landmarks + a flat-colored image
  {
    // An ideal MediaPipe result: the canonical face plus the shape change we want to recover.
    const truth = shapeAtLandmarks(evaluateShape(pkg, { ...DEFAULT_HUMAN, gender: 1, detail: { noseWidth: 0.7, jaw: 0.6 } }));
    const neutral = shapeAtLandmarks(evaluateShape(pkg, { ...DEFAULT_HUMAN, gender: 1 }));
    const pts = Float64Array.from(FACE_MAP.reference, (v, i) => v + truth[i] - neutral[i]);
    const W = 640, H = 800;
    const px = transform(pts, rotation(0, 0, 0), 2400, [W / 2, -H / 2 - 3900, 0]);
    const lms = Array.from({ length: 468 }, (_, i) => ({ x: px[i * 3] / W, y: -px[i * 3 + 1] / H, z: -px[i * 3 + 2] / W }));
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) data.set([120, 78, 55, 255], i * 4);
    const fit = fitSelfie(pkg, lms, { width: W, height: H }, { width: W, height: H, data }, { hints: { gender: 1 } });
    check(fit.config.gender === 1 && fit.config.skin.includes('african') && fit.config.skin.includes('_male'), `fitSelfie skin ${fit.config.skin} tint ${fit.config.skinTint}`);
    check((fit.config.detail.noseWidth ?? 0) > 0.35 && (fit.config.detail.jaw ?? 0) > 0.3,
      `fitSelfie sliders noseWidth ${fit.config.detail.noseWidth?.toFixed(2)} jaw ${fit.config.detail.jaw?.toFixed(2)} (mix ${[fit.config.african, fit.config.asian, fit.config.caucasian].map((v) => v.toFixed(2))}, err ${fit.error.toFixed(4)})`);
  }
}

console.log(fails ? `${fails} failures` : 'all fit checks passed');
process.exit(fails ? 1 : 0);
