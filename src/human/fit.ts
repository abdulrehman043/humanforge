// Selfie-to-avatar fitting for the realistic human.
//
// Input: MediaPipe Face Landmarker output (478 landmarks, normalized image coords) and,
// optionally, the selfie's RGBA pixels. Output: a HumanConfig patch (gender / ethnicity /
// weight macros, face detail sliders, skin + skinTint, eye color) that resembles the person.
//
// Platform-neutral: no DOM, no WASM. Run the landmark model wherever you like (MediaPipe
// tasks-vision on the web, a TFLite model on device, or a server) and call fitSelfie().
//
// Method: each MediaPipe landmark is tied to one MakeHuman vertex (FACE_MAP, built by
// tools/build-facemap.ts). Per iteration we similarity-align the landmarks to the current
// model (Umeyama/Horn, removes pose and scale), then solve a box-constrained ridge least-squares
// problem whose columns are the morph deltas at the mapped vertices. Detail sliders are exactly
// linear; macros are linearized with finite differences (Gauss-Newton). Expression units are
// free nuisance columns, so a smile in the photo isn't baked into a wide mouth.
import { DEFAULT_HUMAN, HumanConfig, HumanPackage, macroWeights } from './runtime';
import { DETAIL_SLIDERS } from './sliders';
import { EYE_COLORS, FACE_MAP, SCLERA_COLOR, SKIN_COLORS } from './faceMap';

export interface Landmark { x: number; y: number; z: number }
export interface RgbaImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

// ---------------------------------------------------------------- small linear algebra

/** Weighted similarity transform (s, R, t) minimizing Σ w‖s·R·src + t − dst‖² (Horn's quaternion method). */
export function similarityAlign(src: Float64Array, dst: Float64Array, w?: Float64Array) {
  const n = src.length / 3;
  let W = 0;
  const cs = [0, 0, 0], cd = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1;
    W += wi;
    for (let k = 0; k < 3; k++) { cs[k] += wi * src[i * 3 + k]; cd[k] += wi * dst[i * 3 + k]; }
  }
  for (let k = 0; k < 3; k++) { cs[k] /= W; cd[k] /= W; }
  const S = new Float64Array(9);
  let vs = 0;
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1;
    for (let a = 0; a < 3; a++) {
      const pa = src[i * 3 + a] - cs[a];
      vs += wi * pa * pa;
      for (let b = 0; b < 3; b++) S[a * 3 + b] += wi * pa * (dst[i * 3 + b] - cd[b]);
    }
  }
  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const q = topEigenvector4(N);
  const [q0, qx, qy, qz] = q;
  const R = [
    q0 * q0 + qx * qx - qy * qy - qz * qz, 2 * (qx * qy - q0 * qz), 2 * (qx * qz + q0 * qy),
    2 * (qy * qx + q0 * qz), q0 * q0 - qx * qx + qy * qy - qz * qz, 2 * (qy * qz - q0 * qx),
    2 * (qz * qx - q0 * qy), 2 * (qz * qy + q0 * qx), q0 * q0 - qx * qx - qy * qy + qz * qz,
  ];
  // s = trace(Rᵀ S) / Σ w|p|²
  let tr = 0;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) tr += R[b * 3 + a] * S[a * 3 + b];
  const s = vs > 0 ? tr / vs : 1;
  const t = [0, 1, 2].map((r) => cd[r] - s * (R[r * 3] * cs[0] + R[r * 3 + 1] * cs[1] + R[r * 3 + 2] * cs[2]));
  const apply = (p: Float64Array, out = new Float64Array(p.length)) => {
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      for (let r = 0; r < 3; r++) out[i + r] = s * (R[r * 3] * x + R[r * 3 + 1] * y + R[r * 3 + 2] * z) + t[r];
    }
    return out;
  };
  return { s, R, t, apply };
}

/** Largest-eigenvalue eigenvector of a symmetric 4×4 matrix (cyclic Jacobi). */
function topEigenvector4(M: number[][]) {
  const a = M.map((r) => r.slice());
  const v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] * a[p][q];
    if (off < 1e-30) break;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 4; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 4; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 4; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
  return [v[0][best], v[1][best], v[2][best], v[3][best]];
}

/**
 * Box-constrained ridge least squares:
 *   minimize ‖A x − b‖²_W + Σ_j λ_j (x_j − p_j)²   subject to lo ≤ x ≤ hi
 * A is column-major (cols[j] has length m). Solved by projected coordinate descent on the
 * normal equations, which is exact for this convex problem and tiny here (≤ ~100 unknowns).
 */
export function solveBoxRidge(
  cols: Float64Array[], b: Float64Array, opts: { w?: Float64Array; lambda: Float64Array; prior?: Float64Array; lo: Float64Array; hi: Float64Array; x0?: Float64Array; sweeps?: number },
) {
  const n = cols.length, m = b.length;
  const w = opts.w;
  const G = new Float64Array(n * n), g = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ci = cols[i];
    let gi = 0;
    for (let r = 0; r < m; r++) gi += (w ? w[r] : 1) * ci[r] * b[r];
    g[i] = gi;
    for (let j = i; j < n; j++) {
      const cj = cols[j];
      let s = 0;
      for (let r = 0; r < m; r++) s += (w ? w[r] : 1) * ci[r] * cj[r];
      G[i * n + j] = G[j * n + i] = s;
    }
  }
  const x = opts.x0 ? Float64Array.from(opts.x0) : new Float64Array(n);
  for (let j = 0; j < n; j++) x[j] = Math.min(opts.hi[j], Math.max(opts.lo[j], x[j]));
  const sweeps = opts.sweeps ?? 300;
  for (let it = 0; it < sweeps; it++) {
    let change = 0;
    for (let j = 0; j < n; j++) {
      const d = G[j * n + j] + opts.lambda[j];
      if (d <= 0) continue;
      let r = g[j] + opts.lambda[j] * (opts.prior ? opts.prior[j] : 0);
      for (let k = 0; k < n; k++) if (k !== j) r -= G[j * n + k] * x[k];
      const nx = Math.min(opts.hi[j], Math.max(opts.lo[j], r / d));
      change = Math.max(change, Math.abs(nx - x[j]));
      x[j] = nx;
    }
    if (change < 1e-7) break;
  }
  return x;
}

// ---------------------------------------------------------------- landmarks

/** MediaPipe normalized landmarks -> 3D points in MakeHuman axes (y up, z toward camera), image-pixel units. */
export function landmarksToPoints(lms: Landmark[], width: number, height: number) {
  const out = new Float64Array(FACE_MAP.vertex.length * 3);
  for (let i = 0; i < FACE_MAP.vertex.length; i++) {
    const l = lms[i];
    out[i * 3] = l.x * width;
    out[i * 3 + 1] = -l.y * height;
    out[i * 3 + 2] = -l.z * width;
  }
  return out;
}

/**
 * Landmarks -> fitting target in MakeHuman space. MediaPipe's landmark layout and the MakeHuman
 * mesh never agree exactly, so instead of fitting raw landmarks we transfer the person's
 * *difference from MediaPipe's canonical face* onto the neutral MakeHuman face. A face equal to
 * the canonical one then maps to the neutral avatar, with no systematic bias.
 */
export function landmarksToTarget(pkg: HumanPackage, lms: Landmark[], width: number, height: number, neutralConfig: HumanConfig = DEFAULT_HUMAN) {
  const obs = landmarksToPoints(lms, width, height);
  const ref = Float64Array.from(FACE_MAP.reference);
  if (!ref.length) return obs;
  const aligned = similarityAlign(obs, ref, Float64Array.from(FACE_MAP.weight)).apply(obs);
  const neutral = landmarkBasis(pkg).evaluate({ ...neutralConfig, detail: {} });
  for (let i = 0; i < aligned.length; i++) aligned[i] = neutral[i] + aligned[i] - ref[i];
  return aligned;
}

interface LandmarkBasis { base: Float64Array; col: (name: string) => Float64Array | null; evaluate: (c: HumanConfig) => Float64Array }
const basisCache = new WeakMap<HumanPackage, LandmarkBasis>();
/** Morph deltas restricted to the mapped vertices, so shapes at the landmarks cost ~µs instead of a full evaluateShape. */
export function landmarkBasis(pkg: HumanPackage): LandmarkBasis {
  const hit = basisCache.get(pkg);
  if (hit) return hit;
  const L = FACE_MAP.vertex.length;
  const rowOf = new Map<number, number[]>();
  FACE_MAP.vertex.forEach((v, i) => { if (!rowOf.has(v)) rowOf.set(v, []); rowOf.get(v)!.push(i); });
  const cols = new Map<string, Float64Array | null>();
  const col = (name: string) => {
    if (cols.has(name)) return cols.get(name)!;
    const m = pkg.morphs.get(name);
    let c: Float64Array | null = null;
    if (m) {
      for (let i = 0; i < m.idx.length; i++) {
        const rows = rowOf.get(m.idx[i]);
        if (!rows) continue;
        c ??= new Float64Array(L * 3);
        for (const r of rows) for (let k = 0; k < 3; k++) c[r * 3 + k] += m.d[i * 3 + k] * m.scale;
      }
    }
    cols.set(name, c);
    return c;
  };
  const base = shapeAtLandmarks(pkg.base);
  const evaluate = (c: HumanConfig) => {
    const out = Float64Array.from(base);
    const add = (name: string, wt: number) => {
      const d = Math.abs(wt) >= 1e-4 ? col(name) : null;
      if (d) for (let r = 0; r < out.length; r++) out[r] += d[r] * wt;
    };
    for (const [k, v] of Object.entries(macroWeights(c))) add(k, v);
    for (const s of DETAIL_SLIDERS) {
      const v = c.detail[s.id] ?? 0;
      if (v > 0) s.pos.forEach((t) => add(t, v));
      else if (v < 0) s.neg.forEach((t) => add(t, -v));
    }
    return out;
  };
  const b = { base, col, evaluate };
  basisCache.set(pkg, b);
  return b;
}

/** The mapped MakeHuman vertices of a shape, as landmark-ordered points (metres). */
export function shapeAtLandmarks(shape: Float32Array) {
  const v = FACE_MAP.vertex;
  const out = new Float64Array(v.length * 3);
  for (let i = 0; i < v.length; i++) for (let k = 0; k < 3; k++) out[i * 3 + k] = shape[v[i] * 3 + k];
  return out;
}

// ---------------------------------------------------------------- shape fit

/** Detail sliders the face landmarks can actually observe. */
export const FIT_SLIDERS = DETAIL_SLIDERS.filter(
  (s) => ['head', 'eyes', 'nose', 'mouth'].includes(s.group) && !['chinCleft', 'eyeBags', 'dimples'].includes(s.id),
);
/** Expression units fitted as nuisance parameters (then discarded). */
const NUISANCE = [
  'mouth-open', 'mouth-corner-puller', 'mouth-retraction', 'mouth-pursing', 'mouth-depression',
  'eye-left-closure', 'eye-right-closure', 'eye-left-opened-up', 'eye-right-opened-up',
  'eyebrows-left-up', 'eyebrows-right-up', 'eyebrows-left-down', 'eyebrows-right-down',
];
type MacroKey = 'gender' | 'weight' | 'african' | 'asian' | 'caucasian';
/**
 * Macros estimated by default. Gender is not: face landmarks carry too little gender signal
 * (in tests on real portraits it was right about half the time), so ask the user and pass it
 * as a hint, or opt in with `macros: ['gender', ...]`.
 */
export const DEFAULT_FIT_MACROS: MacroKey[] = ['african', 'asian', 'caucasian'];

export interface FitShapeOptions {
  /** Starting config; also the prior for macros. Defaults to DEFAULT_HUMAN. */
  base?: HumanConfig;
  /** Ridge strength for detail sliders (relative to the data term). Higher = more conservative. Default 0.02. */
  lambda?: number;
  /** Macros to estimate from geometry. Default DEFAULT_FIT_MACROS (ethnicity mix). */
  macros?: MacroKey[];
  /** Weight of the depth axis (MediaPipe z is a guess from a single image). Default 0.4. */
  zWeight?: number;
  /** Outer Gauss-Newton iterations. Default 6. */
  iterations?: number;
}

export interface FitShapeResult {
  config: HumanConfig;
  /** RMS landmark error after fitting, relative to face height (≈ 0.02 is a good fit). */
  error: number;
  /** Error of the starting shape, same units. */
  initialError: number;
  /** Fitted nuisance expression weights (useful for debugging, not part of the identity). */
  expression: Record<string, number>;
}

interface Var { kind: 'detail' | 'expr' | 'macro'; key: string; sign: 1 | -1; targets: string[]; lo: number; hi: number; lambda: number; prior: number }

/**
 * Fit macros + detail sliders to target points (landmark order, any units/pose).
 * Gender has a kink at 0.5 (the female and male bases are separate), and detail sliders can
 * imitate part of it, so it is picked by a coarse search first and then refined.
 */
export function fitFaceShape(pkg: HumanPackage, target: Float64Array, opts: FitShapeOptions = {}): FitShapeResult {
  const macros = opts.macros ?? DEFAULT_FIT_MACROS;
  if (!macros.includes('gender')) return fitFaceShapeAt(pkg, target, { ...opts, macros });
  const base = opts.base ?? DEFAULT_HUMAN;
  const rest = macros.filter((m) => m !== 'gender');
  let best: FitShapeResult | null = null;
  for (const gender of [0.05, 0.3, 0.5, 0.7, 0.95]) {
    const r = fitFaceShapeAt(pkg, target, { ...opts, base: { ...base, gender }, macros: rest, iterations: 3 });
    if (!best || r.error < best.error) best = r;
  }
  const res = fitFaceShapeAt(pkg, target, { ...opts, base: { ...base, gender: best!.config.gender }, macros });
  return { ...res, initialError: fitFaceShapeAt(pkg, target, { ...opts, iterations: 1, macros: [] }).initialError };
}

function fitFaceShapeAt(pkg: HumanPackage, target: Float64Array, opts: FitShapeOptions = {}): FitShapeResult {
  const base: HumanConfig = { ...(opts.base ?? DEFAULT_HUMAN), detail: { ...(opts.base ?? DEFAULT_HUMAN).detail } };
  const lambda = opts.lambda ?? 0.02;
  const zW = opts.zWeight ?? 0.4;
  const macros = opts.macros ?? DEFAULT_FIT_MACROS;
  const iterations = opts.iterations ?? 6;
  const L = FACE_MAP.vertex.length;
  const basis = landmarkBasis(pkg);

  // per-row weights (landmark weight × axis weight)
  const w = new Float64Array(L * 3), pw = new Float64Array(L);
  for (let i = 0; i < L; i++) {
    const lw = FACE_MAP.weight[i];
    pw[i] = lw;
    w[i * 3] = lw; w[i * 3 + 1] = lw; w[i * 3 + 2] = lw * zW * (FACE_MAP.contour[i] ? 0 : 1);
  }

  const vars: Var[] = [];
  for (const s of FIT_SLIDERS) {
    if (s.pos.length) vars.push({ kind: 'detail', key: s.id, sign: 1, targets: s.pos, lo: 0, hi: 1, lambda, prior: 0 });
    if (s.neg.length) vars.push({ kind: 'detail', key: s.id, sign: -1, targets: s.neg, lo: 0, hi: 1, lambda, prior: 0 });
  }
  for (const u of NUISANCE) if (pkg.morphs.has(`expr/${u}`)) vars.push({ kind: 'expr', key: u, sign: 1, targets: [`expr/${u}`], lo: 0, hi: 1, lambda: lambda * 0.1, prior: 0 });
  for (const k of macros) vars.push({ kind: 'macro', key: k, sign: 1, targets: [], lo: k === 'weight' ? 0.25 : 0, hi: k === 'weight' ? 0.85 : 1, lambda: lambda * 4, prior: base[k] });

  // Detail/expression columns are constant: morph deltas at the mapped vertices.
  const morphCol = (names: string[]) => {
    const c = new Float64Array(L * 3);
    for (const name of names) { const d = basis.col(name); if (d) for (let r = 0; r < c.length; r++) c[r] += d[r]; }
    return c;
  };
  const fixedCols = new Map<number, Float64Array>();
  vars.forEach((v, j) => { if (v.kind !== 'macro') fixedCols.set(j, morphCol(v.targets)); });

  const x = new Float64Array(vars.length);
  vars.forEach((v, j) => { if (v.kind === 'macro') x[j] = base[v.key as MacroKey]; });
  for (const [j, v] of vars.entries()) {
    const cur = base.detail[v.key];
    if (v.kind === 'detail' && cur && Math.sign(cur) === v.sign) x[j] = Math.abs(cur);
  }

  const macroConfig = (xv: Float64Array): HumanConfig => {
    const c: HumanConfig = { ...base, detail: {} };
    vars.forEach((v, j) => { if (v.kind === 'macro') (c as any)[v.key] = xv[j]; });
    return c;
  };
  const macroShape = (c: HumanConfig) => basis.evaluate(c);
  const faceHeight = (p: Float64Array) => {
    const [a, b] = FACE_MAP.heightPair;
    return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  };
  const model = (P0: Float64Array, xv: Float64Array) => {
    const out = Float64Array.from(P0);
    for (const [j, c] of fixedCols) if (xv[j]) for (let r = 0; r < out.length; r++) out[r] += c[r] * xv[j];
    return out;
  };
  const rms = (a: Float64Array, b: Float64Array) => {
    let e = 0, W = 0;
    for (let r = 0; r < a.length; r++) { e += w[r] * (a[r] - b[r]) ** 2; W += w[r]; }
    return Math.sqrt(e / W) / faceHeight(b);
  };

  let initialError = 0, error = 0;
  for (let it = 0; it < iterations; it++) {
    const mc = macroConfig(x);
    const P0 = macroShape(mc);
    // P0 contains the current macros but no detail; detail/expression come from x.
    const cur = model(P0, x);
    const T = similarityAlign(target, cur, pw).apply(target);
    if (it === 0) initialError = rms(cur, T);
    // Linearize: model ≈ P0 + Σ fixed·x + Σ J_macro·(x − x_macro); solve for all x at once.
    const cols: Float64Array[] = [];
    const rhs = new Float64Array(T.length);
    for (let r = 0; r < T.length; r++) rhs[r] = T[r] - P0[r];
    vars.forEach((v, j) => {
      if (v.kind !== 'macro') { cols.push(fixedCols.get(j)!); return; }
      const h = 0.05, k = v.key as MacroKey;
      const up = { ...mc, [k]: Math.min(1, mc[k] + h) }, dn = { ...mc, [k]: Math.max(0, mc[k] - h) };
      // Macros also move/scale the whole head (body height changes); align that away so the
      // column only holds the change in face shape, which is what the aligned target can show.
      const Pu = similarityAlign(macroShape(up), P0, pw).apply(macroShape(up));
      const Pd = similarityAlign(macroShape(dn), P0, pw).apply(macroShape(dn));
      const span = up[k] - dn[k];
      const c = new Float64Array(T.length);
      for (let r = 0; r < c.length; r++) c[r] = (Pu[r] - Pd[r]) / span;
      cols.push(c);
      for (let r = 0; r < rhs.length; r++) rhs[r] += c[r] * x[j];
    });
    // Scale-free ridge: λ is relative to the mean column energy.
    let energy = 0;
    for (const c of cols) for (let r = 0; r < c.length; r++) energy += w[r] * c[r] * c[r];
    energy /= cols.length;
    const lam = Float64Array.from(vars, (v) => v.lambda * energy);
    // Two-sided sliders: penalize using both directions at once (keeps x+ · x− ≈ 0).
    const next = solveBoxRidge(cols, rhs, {
      w, lambda: lam, prior: Float64Array.from(vars, (v) => v.prior),
      lo: Float64Array.from(vars, (v) => v.lo), hi: Float64Array.from(vars, (v) => v.hi), x0: x,
    });
    x.set(next);
    error = rms(model(macroShape(macroConfig(x)), x), T);
  }

  const config = macroConfig(x);
  config.detail = { ...base.detail };
  for (const s of FIT_SLIDERS) delete config.detail[s.id];
  const expression: Record<string, number> = {};
  vars.forEach((v, j) => {
    if (v.kind === 'detail') config.detail[v.key] = (config.detail[v.key] ?? 0) + v.sign * x[j];
    else if (v.kind === 'expr') expression[v.key] = x[j];
  });
  for (const k of Object.keys(config.detail)) config.detail[k] = Math.round(config.detail[k] * 1000) / 1000;
  const rs = config.african + config.asian + config.caucasian || 1;
  config.african /= rs; config.asian /= rs; config.caucasian /= rs;
  return { config, error, initialError, expression };
}

// ---------------------------------------------------------------- color

const toLin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = (c: number) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)));
const hex = (rgb: number[]) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');

/** sRGB (0..255) -> CIE Lab (D65). */
export function srgbToLab([r, g, b]: number[]) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

/** Per-channel median of the pixels in a disc. */
function sampleDisc(img: RgbaImage, cx: number, cy: number, r: number, keep?: (rgb: number[], d: number) => boolean) {
  const ch: number[][] = [[], [], []];
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(img.height - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(img.width - 1, Math.ceil(cx + r)); x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 > r2) continue;
      const o = (y * img.width + x) * 4;
      const rgb = [img.data[o], img.data[o + 1], img.data[o + 2]];
      if (keep && !keep(rgb, Math.sqrt(d2) / r)) continue;
      for (let k = 0; k < 3; k++) ch[k].push(rgb[k]);
    }
  }
  return ch;
}
const median = (a: number[]) => { if (!a.length) return NaN; const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };

/** Median skin color (sRGB 0..255) from cheek and forehead patches. */
export function sampleSkinColor(img: RgbaImage, lms: Landmark[]) {
  const faceW = Math.hypot((lms[234].x - lms[454].x) * img.width, (lms[234].y - lms[454].y) * img.height);
  const ch: number[][] = [[], [], []];
  for (const i of FACE_MAP.skinLandmarks) {
    const p = sampleDisc(img, lms[i].x * img.width, lms[i].y * img.height, faceW * 0.035);
    for (let k = 0; k < 3; k++) ch[k].push(...p[k]);
  }
  return ch.map(median);
}

/** Iris centre/radius (pixels) for the eye whose corners are (a, b). */
function irisNear(img: RgbaImage, lms: Landmark[], a: number, b: number) {
  const mx = (lms[a].x + lms[b].x) / 2, my = (lms[a].y + lms[b].y) / 2;
  const [c, p, q] = Math.hypot(lms[468].x - mx, lms[468].y - my) < Math.hypot(lms[473].x - mx, lms[473].y - my) ? [468, 469, 471] : [473, 474, 476];
  return { x: lms[c].x * img.width, y: lms[c].y * img.height, r: Math.hypot((lms[p].x - lms[q].x) * img.width, (lms[p].y - lms[q].y) * img.height) / 2 };
}

/** Median sclera (eye white) color, sRGB 0..255: a white reference for the photo's lighting. */
export function sampleScleraColor(img: RgbaImage, lms: Landmark[]) {
  if (lms.length < 478) return null;
  const px: number[][] = [];
  for (const [a, b] of [[33, 133], [263, 362]]) {
    const iris = irisNear(img, lms, a, b);
    for (const corner of [a, b]) {
      const cx = lms[corner].x * img.width, cy = lms[corner].y * img.height;
      const D = Math.hypot(cx - iris.x, cy - iris.y);
      if (!(D - iris.r > 2)) continue;
      // a thin band from just outside the iris toward the corner
      const ux = (cx - iris.x) / D, uy = (cy - iris.y) / D;
      for (let d = iris.r * 1.15; d < iris.r + (D - iris.r) * 0.8; d += 0.7) {
        for (let o = -iris.r * 0.25; o <= iris.r * 0.25; o += 0.7) {
          const x = Math.round(iris.x + ux * d - uy * o), y = Math.round(iris.y + uy * d + ux * o);
          if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
          const at = (y * img.width + x) * 4;
          px.push([img.data[at], img.data[at + 1], img.data[at + 2]]);
        }
      }
    }
  }
  if (px.length < 4) return null;
  // the brightest pixels are sclera; the rest is lid, lashes, iris edge and shadow
  px.sort((u, v) => v[0] + v[1] + v[2] - (u[0] + u[1] + u[2]));
  const top = px.slice(0, Math.max(2, Math.round(px.length * 0.2)));
  return [0, 1, 2].map((k) => median(top.map((p) => p[k])));
}

/**
 * Re-express a photo's skin color as if it had been lit like the textures, using the sclera as
 * a white reference (cancels exposure and white balance). Gain is limited so a bad sclera
 * sample can't produce absurd colors.
 */
export function normalizeSkin(skin: number[], sclera: number[] | null) {
  // Only trust a clearly visible eye white: clearly brighter than the skin and nearly neutral.
  // Small or shadowed eyes (typical in waist-up portraits) give lid/skin pixels instead.
  const lum = (c: number[]) => 0.2126 * toLin(c[0]) + 0.7152 * toLin(c[1]) + 0.0722 * toLin(c[2]);
  if (!sclera || lum(sclera) < lum(skin) * 1.25 || Math.max(...sclera) - Math.min(...sclera) > 0.18 * Math.max(...sclera)) return skin;
  const gain = [0, 1, 2].map((k) => toLin(SCLERA_COLOR[k]) / Math.max(1e-3, toLin(sclera[k])));
  const g = gain.reduce((a, b) => a + b) / 3;
  const lim = Math.min(2.5, Math.max(0.4, g));
  // overall exposure fully, white balance only half (sclera is rarely truly neutral in photos)
  return [0, 1, 2].map((k) => toSrgb(toLin(skin[k]) * lim * Math.sqrt(gain[k] / g)));
}

/** Median iris color (sRGB 0..255), skipping pupil, specular highlights and lid shadow. */
export function sampleIrisColor(img: RgbaImage, lms: Landmark[]) {
  if (lms.length < 478) return null;
  const ch: number[][] = [[], [], []];
  for (const [c, a, b] of [[468, 469, 471], [473, 474, 476]]) {
    const cx = lms[c].x * img.width, cy = lms[c].y * img.height;
    const r = Math.hypot((lms[a].x - lms[b].x) * img.width, (lms[a].y - lms[b].y) * img.height) / 2;
    if (!(r > 1.5)) continue;
    const p = sampleDisc(img, cx, cy, r * 0.85, (rgb, d) => {
      const l = (rgb[0] + rgb[1] + rgb[2]) / 3;
      return d > 0.35 && l > 18 && l < 225;
    });
    for (let k = 0; k < 3; k++) ch[k].push(...p[k]);
  }
  return ch[0].length >= 6 ? ch.map(median) : null;
}

const labDist = (a: number[], b: number[], lw = 1) => Math.hypot((a[0] - b[0]) * lw, a[1] - b[1], a[2] - b[2]);

/** Choose the closest eye texture for an iris color. Photos darken irises, so lightness counts less than hue. */
export function pickEyes(iris: number[], available: string[] = Object.keys(EYE_COLORS)) {
  const lab = srgbToLab(iris);
  let best = available[0], bd = Infinity;
  for (const id of available) {
    const ref = EYE_COLORS[id];
    if (!ref) continue;
    const r = srgbToLab(ref);
    // compare chroma direction at matched lightness: scale the reference's a/b by the photo's lightness ratio
    const k = Math.max(0.35, Math.min(1, lab[0] / Math.max(1, r[0])));
    const d = labDist(lab, [r[0], r[1] * k, r[2] * k], 0.35);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

/**
 * Choose a skin texture (preferring the fitted gender and age bucket) and a tint that moves its
 * face color toward the photo's. The tint only darkens/hue-shifts (it multiplies the texture).
 */
export function pickSkin(skin: number[], c: Partial<HumanConfig> & Pick<HumanConfig, 'gender' | 'age'>, available: { id: string; tags: string[] }[], tintStrength = 0.6) {
  const lab = srgbToLab(skin);
  const sex = c.gender >= 0.5 ? 'male' : 'female';
  const years = 18 + 72 * c.age;
  const ageTag = years < 35 ? 'young' : years < 60 ? 'middleage' : 'old';
  let best = available[0]?.id ?? 'young_caucasian_female', bd = Infinity;
  for (const s of available) {
    const ref = SKIN_COLORS[s.id];
    if (!ref) continue;
    // lightness counts half: photo exposure varies far more than skin hue does
    let d = labDist(lab, srgbToLab(ref), 0.5);
    if (!s.tags.some((t) => t.startsWith(sex))) d += 40;
    if (!s.tags.includes(ageTag)) d += 20;
    // among similar colors, prefer the ethnicity the face geometry leans toward
    if (c.african !== undefined && c.asian !== undefined && c.caucasian !== undefined) {
      const mix: Record<string, number> = { african: c.african, asian: c.asian, caucasian: c.caucasian };
      const tag = s.tags.find((t) => t in mix);
      if (tag) d += 6 * (Math.max(c.african, c.asian, c.caucasian) - mix[tag]);
    }
    if (d < bd) { bd = d; best = s.id; }
  }
  const ref = SKIN_COLORS[best] ?? [200, 160, 140];
  // Tint corrects hue only (chromaticity ratio at equal luminance), since the photo's exposure is
  // unknown. Limited to ±15% per channel and normalized so it never brightens the texture.
  const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const pl = skin.map(toLin), rl = ref.map(toLin);
  const ratio = [0, 1, 2].map((k) => Math.min(1.15, Math.max(0.85, (pl[k] / Math.max(1e-4, lum(pl))) / (rl[k] / Math.max(1e-4, lum(rl))))));
  const top = Math.max(...ratio);
  const tint = ratio.map((v) => 1 + tintStrength * (v / top - 1));
  return { skin: best, skinTint: hex(tint.map(toSrgb)) };
}

// ---------------------------------------------------------------- one-call API

export interface FitSelfieOptions extends FitShapeOptions {
  /** Known facts override estimates, e.g. { gender: 1, age: 0.2 }. */
  hints?: Partial<Pick<HumanConfig, 'gender' | 'age' | 'african' | 'asian' | 'caucasian' | 'weight'>>;
  /** Skins to choose from (pkg.manifest.skins). */
  skins?: { id: string; tags: string[] }[];
  /** Eye texture ids to choose from (pkg.manifest.eyes). */
  eyes?: string[];
}

export interface SelfieFit extends FitShapeResult {
  /** Sampled colors (sRGB), for UI/debugging. `skin` is after sclera normalization. */
  colors: { skin: number[] | null; rawSkin: number[] | null; sclera: number[] | null; iris: number[] | null };
}

/**
 * Selfie -> HumanConfig. `landmarks` are MediaPipe Face Landmarker landmarks (478 with iris,
 * normalized to the image); `image` is the same image's RGBA pixels (optional: no colors without it).
 */
export function fitSelfie(pkg: HumanPackage, landmarks: Landmark[], imageSize: { width: number; height: number }, image?: RgbaImage, opts: FitSelfieOptions = {}): SelfieFit {
  if (landmarks.length < FACE_MAP.vertex.length) throw new Error(`need ${FACE_MAP.vertex.length} landmarks, got ${landmarks.length}`);
  const hints = opts.hints ?? {};
  const base: HumanConfig = { ...(opts.base ?? DEFAULT_HUMAN), ...hints };
  const fixed = new Set(Object.keys(hints));
  const macros = (opts.macros ?? DEFAULT_FIT_MACROS).filter((k) => !fixed.has(k));
  // Known macros (hints) shape the neutral face the person's differences are transferred onto.
  const target = landmarksToTarget(pkg, landmarks, imageSize.width, imageSize.height, { ...DEFAULT_HUMAN, ...hints });
  const res = fitFaceShape(pkg, target, { ...opts, base, macros });
  const colors: SelfieFit['colors'] = { skin: null, rawSkin: null, sclera: null, iris: null };
  if (image) {
    colors.rawSkin = sampleSkinColor(image, landmarks);
    colors.sclera = sampleScleraColor(image, landmarks);
    colors.skin = normalizeSkin(colors.rawSkin, colors.sclera);
    if (colors.skin.every(Number.isFinite)) Object.assign(res.config, pickSkin(colors.skin, res.config, opts.skins ?? pkg.manifest.skins));
    colors.iris = sampleIrisColor(image, landmarks);
    if (colors.iris) res.config.eyes = pickEyes(colors.iris, opts.eyes ?? pkg.manifest.eyes);
  }
  return { ...res, colors };
}
