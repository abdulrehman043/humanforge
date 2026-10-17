// Builds src/human/faceMap.ts: MediaPipe Face Mesh landmark -> MakeHuman vertex correspondences,
// plus reference colors of the skin and eye textures for selfie color matching.
//
//   curl -LO https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
//   npx tsx tools/build-facemap.mts canonical_face_model.obj            # rigid ICP pass
//   npx tsx tools/build-facemap.mts canonical_face_model.obj --refine   # optional: re-map after fitting MH to the canonical face
//   npx tsx tools/build-facemap.mts canonical_face_model.obj --refine --calibration mean.json
//
// --calibration takes the output of demo/calibrate.html (mean MediaPipe landmarks over the
// public-domain portraits in tools/calibration-portraits.json) and uses it as the fitting
// reference instead of the canonical face, which removes the bias every fit otherwise shares.
//
// canonical_face_model.obj is MediaPipe's canonical face (Apache-2.0); only derived vertex
// indices end up in the repo. Requires a built assets/human package.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { DEFAULT_HUMAN, HumanConfig, evaluateShape, loadHumanPackage } from '../src/human/runtime';
import { similarityAlign } from '../src/human/fit';

const [OBJ, ...flags] = process.argv.slice(2);
if (!OBJ) throw new Error('usage: build-facemap.mts <canonical_face_model.obj> [--refine]');
const refine = flags.includes('--refine');
const calIdx = flags.indexOf('--calibration');
const calibration = calIdx >= 0 ? JSON.parse(readFileSync(flags[calIdx + 1], 'utf8')) as { count: number; mean: number[] } : null;
const dir = path.resolve('assets/human');
const OUT = path.resolve('src/human/faceMap.ts');

const fsFetch = async (url: string) => { const b = readFileSync(path.join(dir, url.replace(/^file:\/\/human\//, ''))); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const pkg = await loadHumanPackage('file://human', { fetch: fsFetch, loadTexture: async () => { throw new Error('no textures'); } });
const [, bodyEnd] = (pkg.manifest as any).bodyVertexRange as [number, number];

// canonical face, cm -> m, landmark order
const canon: number[] = [];
for (const line of readFileSync(OBJ, 'utf8').split('\n')) {
  const p = line.trim().split(/\s+/);
  if (p[0] === 'v') canon.push(+p[1] * 0.01, +p[2] * 0.01, +p[3] * 0.01);
}
const L = canon.length / 3;
if (L !== 468) throw new Error(`expected 468 canonical vertices, got ${L}`);
const C = Float64Array.from(canon);

// MediaPipe silhouette ring: these slide along the outline with pose, so depth is ignored for them.
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const SKIN = [50, 280, 205, 425, 151, 108, 337]; // cheeks + forehead

// Front-of-head candidate vertices of a shape
function headVerts(shape: Float32Array) {
  let top = -Infinity;
  for (let i = 0; i <= bodyEnd; i++) top = Math.max(top, shape[i * 3 + 1]);
  const ids: number[] = [];
  let zc = 0;
  for (let i = 0; i <= bodyEnd; i++) if (shape[i * 3 + 1] > top - 0.27) { ids.push(i); zc += shape[i * 3 + 2]; }
  zc /= ids.length;
  return ids.filter((i) => shape[i * 3 + 2] > zc - 0.01);
}
function nearest(p: Float64Array, i: number, shape: Float32Array, ids: number[]) {
  let best = ids[0], bd = Infinity;
  for (const v of ids) {
    const d = (shape[v * 3] - p[i * 3]) ** 2 + (shape[v * 3 + 1] - p[i * 3 + 1]) ** 2 + (shape[v * 3 + 2] - p[i * 3 + 2]) ** 2;
    if (d < bd) { bd = d; best = v; }
  }
  return { v: best, d: Math.sqrt(bd) };
}

/** Similarity ICP canonical -> MH surface, then nearest-vertex correspondences. */
function register(shape: Float32Array, init?: number[]) {
  const ids = headVerts(shape);
  let src: Float64Array;
  if (init) {
    // start from an existing map: align canonical to the mapped vertices
    const dst = new Float64Array(L * 3);
    init.forEach((v, i) => { for (let k = 0; k < 3; k++) dst[i * 3 + k] = shape[v * 3 + k]; });
    src = similarityAlign(C, dst).apply(C);
  } else {
    let tip = ids[0];
    for (const v of ids) if (Math.abs(shape[v * 3]) < 0.006 && shape[v * 3 + 2] > shape[tip * 3 + 2]) tip = v;
    src = Float64Array.from(C);
    for (let i = 0; i < L; i++) for (let k = 0; k < 3; k++) src[i * 3 + k] += shape[tip * 3 + k] - C[3 + k];
  }
  for (let it = 0; it < 40; it++) {
    const dst = new Float64Array(L * 3);
    for (let i = 0; i < L; i++) { const { v } = nearest(src, i, shape, ids); for (let k = 0; k < 3; k++) dst[i * 3 + k] = shape[v * 3 + k]; }
    src = similarityAlign(src, dst).apply(src);
  }
  const map: number[] = [], dist: number[] = [];
  for (let i = 0; i < L; i++) { const n = nearest(src, i, shape, ids); map.push(n.v); dist.push(n.d); }
  return { map, dist };
}

let shape = evaluateShape(pkg, DEFAULT_HUMAN);
let { map, dist } = register(shape);
if (refine) {
  // Deform MH toward the canonical face with the solver itself, then re-map on the deformed surface.
  const { FACE_MAP } = await import('../src/human/faceMap');
  const { fitFaceShape } = await import('../src/human/fit');
  const fit = fitFaceShape(pkg, C, { base: DEFAULT_HUMAN as HumanConfig, macros: [], zWeight: 1 });
  console.log(`refine: canonical fit error ${fit.initialError.toFixed(4)} -> ${fit.error.toFixed(4)}`);
  shape = evaluateShape(pkg, fit.config);
  ({ map, dist } = register(shape, Array.from(FACE_MAP.vertex)));
}
const sorted = dist.slice().sort((a, b) => a - b);
console.log(`landmark->vertex distance: median ${(sorted[L >> 1] * 1000).toFixed(1)} mm, p95 ${(sorted[Math.floor(L * 0.95)] * 1000).toFixed(1)} mm, unique verts ${new Set(map).size}/${L}`);

// Landmark weights: down-weight landmarks that ended up far from the surface (bad correspondences).
const weight = dist.map((d) => Math.round(Math.max(0.2, Math.min(1, 1 - (d - 0.003) / 0.006)) * 100) / 100);

// ---------------------------------------------------------------- reference colors
const uvs = pkg.body.attributes.TEXCOORD_0, mh = pkg.body.attributes._MH;
const uvOf = (v: number) => {
  for (let i = 0; i < mh.array.length; i++) if (mh.array[i] === v) {
    const s = uvs.normalized ? (uvs.array instanceof Uint16Array ? 65535 : 255) : 1;
    return [uvs.array[i * 2] / s, uvs.array[i * 2 + 1] / s];
  }
  throw new Error(`vertex ${v} not in body mesh`);
};
const skinUV = SKIN.map((l) => uvOf(map[l]));
async function meanColor(file: string, pts: number[][], r: number) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch: number[][] = [[], [], []];
  for (const [u, v] of pts) {
    const cx = u * info.width, cy = v * info.height;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r || x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
      for (let k = 0; k < 3; k++) ch[k].push(data[(y * info.width + x) * 3 + k]);
    }
  }
  return ch.map((c) => { const s = c.sort((a, b) => a - b); return s[s.length >> 1]; });
}
const skins: Record<string, number[]> = {};
for (const s of pkg.manifest.skins) skins[s.id] = await meanColor(path.join(dir, `skins/${s.id}_1k.webp`), skinUV, 6);
// Iris textures: the iris is a ring around (0.703, 0.293) of the 512² texture (pupil r≈0.035, iris r≈0.11).
const eyes: Record<string, number[]> = {};
for (const e of pkg.manifest.eyes) {
  const { data, info } = await sharp(path.join(dir, `eyes/${e}.webp`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch: number[][] = [[], [], []];
  const cx = 0.703 * info.width, cy = 0.293 * info.height, r = 0.11 * info.width;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x - cx, y - cy) / r;
    if (d < 0.4 || d > 0.85) continue;
    for (let k = 0; k < 3; k++) ch[k].push(data[(y * info.width + x) * 3 + k]);
  }
  eyes[e] = ch.map((c) => { const s = c.sort((a, b) => a - b); return s[s.length >> 1]; });
}
// Sclera (eye white) albedo: the ring just outside the iris. Selfie colors are normalized by the
// photo's sclera, so lighting/exposure cancels when comparing to skin textures.
const scleraCh: number[][] = [[], [], []];
for (const e of pkg.manifest.eyes) {
  const { data, info } = await sharp(path.join(dir, `eyes/${e}.webp`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const cx = 0.703 * info.width, cy = 0.293 * info.height;
  for (let a = 0; a < 64; a++) for (const rr of [0.15, 0.17, 0.19]) {
    const x = Math.round(cx + Math.cos(a / 10) * rr * info.width), y = Math.round(cy + Math.sin(a / 10) * rr * info.height);
    for (let k = 0; k < 3; k++) scleraCh[k].push(data[(y * info.width + x) * 3 + k]);
  }
}
const sclera = scleraCh.map((c) => { const s = c.sort((a, b) => a - b); return s[s.length >> 1]; });

// Canonical face expressed in the neutral MakeHuman frame (for bias-free delta transfer).
const neutral = evaluateShape(pkg, DEFAULT_HUMAN);
const mapped = new Float64Array(L * 3);
map.forEach((v, i) => { for (let k = 0; k < 3; k++) mapped[i * 3 + k] = neutral[v * 3 + k]; });
const refSrc = calibration ? Float64Array.from(calibration.mean) : C;
if (calibration) console.log(`reference: calibrated mean of ${calibration.count} portraits`);
const reference = Array.from(similarityAlign(refSrc, mapped).apply(refSrc), (v) => Math.round(v * 1e5) / 1e5);

const contour = new Array(L).fill(0);
FACE_OVAL.forEach((i) => (contour[i] = 1));
writeFileSync(OUT, `// Generated by tools/build-facemap.mts from MediaPipe's canonical face model (Apache-2.0)
// and the CC0 MakeHuman base mesh. Do not edit by hand.

export const FACE_MAP = {
  /** MakeHuman vertex index for each of the 468 MediaPipe face-mesh landmarks. */
  vertex: Uint16Array.from(${JSON.stringify(map)}),
  /** Confidence of each correspondence (0.2..1). */
  weight: Float32Array.from(${JSON.stringify(weight)}),
  /** 1 for silhouette landmarks (depth unreliable). */
  contour: Uint8Array.from(${JSON.stringify(contour)}),
  /** ${calibration ? `Mean MediaPipe landmarks over ${calibration.count} public-domain portraits` : "MediaPipe's canonical face"} (metres), similarity-aligned to the neutral MakeHuman face at \`vertex\`. */
  reference: Float32Array.from(${JSON.stringify(reference)}),
  /** Landmarks spanning the face height (forehead, chin), for error normalization. */
  heightPair: [10, 152] as [number, number],
  /** Landmarks around which skin color is sampled (cheeks, forehead). */
  skinLandmarks: ${JSON.stringify(SKIN)},
};

/** Median sRGB color of each skin texture at the skin landmarks. */
export const SKIN_COLORS: Record<string, number[]> = ${JSON.stringify(skins)};

/** Median sRGB sclera color of the eye textures (white reference for skin matching). */
export const SCLERA_COLOR: number[] = ${JSON.stringify(sclera)};

/** Median sRGB iris color of each eye texture. */
export const EYE_COLORS: Record<string, number[]> = ${JSON.stringify(eyes)};
`);
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
console.log('skins', skins);
console.log('eyes', eyes, 'sclera', sclera);
