// Generates original garments (hijab, al-amira, abaya, jalabiya, dresses) for the realistic human.
// The CC0 MakeHuman packs ship no modest wear or dresses, so these are authored here, in code,
// from the human package itself: no third-party meshes or textures are involved.
//
//   npx tsx tools/build-garments.mts [assets/human]      (run after tools/build-human.ts)
//
// Each garment is a proxy like the MakeHuman clothes: every vertex stores refs to up to three body
// vertices + weights + an offset (_REFS/_REFW/_OFFS), so it follows all body and face sliders, and
// skin weights inherited from those refs. Shapes are built on the default female body:
//   - tubes (bodices, skirts, robes, sleeves) are lofted rings around convex hulls of horizontal
//     (or arm-perpendicular) body slices; ring points sit on a hull edge between two body vertices,
//     so they move with them. Skirts and robes "fall" from the widest ring above (drape) and flare.
//   - headwear is a hood around the 3D convex hull of head, neck and shoulders, with an oval face
//     opening whose rim follows the skin.
// Body faces well inside a garment are listed in deleteVerts so they can't poke through.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import sharp from 'sharp';
import { Document, NodeIO, VertexLayout } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { Vector3 } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { DEFAULT_HUMAN, HumanManifest, ProxyMeta, evaluateShape, loadHumanPackage } from '../src/human/runtime';
import { toFloat } from '../src/human/glb';
import { DETAIL_SLIDERS } from '../src/human/sliders';

const OUT = path.resolve(process.argv[2] ?? 'assets/human');
const fsFetch = async (url: string) => {
  const b = readFileSync(path.join(OUT, url.replace(/^file:\/\/human\//, '')));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;
};
const pkg = await loadHumanPackage('file://human', { fetch: fsFetch, loadTexture: async () => { throw new Error('no textures'); } });
const man: HumanManifest = pkg.manifest;

// ---------------------------------------------------------------- authoring body (default female)
const AUTHOR = { ...DEFAULT_HUMAN, gender: 0 };
/** Shape as the runtime builds it: evaluated, then standing on the ground. */
const groundedShape = (c: typeof AUTHOR) => {
  const Q = evaluateShape(pkg, c);
  let gy = 0;
  for (const i of man.groundVerts) gy += Q[i * 3 + 1];
  gy /= man.groundVerts.length;
  for (let i = 1; i < Q.length; i += 3) Q[i] -= gy;
  return Q;
};
const P = groundedShape(AUTHOR);
type V3 = [number, number, number];
const pt = (i: number): V3 => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
const bodyMh = pkg.body.attributes._MH.array as Uint16Array;
const J = pkg.body.attributes.JOINTS_0.array, Wt = toFloat(pkg.body.attributes.WEIGHTS_0);
const boneName = man.bones.map((b) => b.name.replace('mixamorig:', ''));
/** Skin weights and dominant bone per MakeHuman vertex (body vertices only). */
const vw = new Map<number, [number, number][]>();
const dom = new Map<number, string>();
for (let i = 0; i < bodyMh.length; i++) {
  const v = bodyMh[i];
  if (vw.has(v)) continue;
  const list: [number, number][] = [];
  let best = 0;
  for (let k = 0; k < 4; k++) if (Wt[i * 4 + k] > 0) list.push([J[i * 4 + k], Wt[i * 4 + k]]);
  for (let k = 1; k < 4; k++) if (Wt[i * 4 + k] > Wt[i * 4 + best]) best = k;
  vw.set(v, list);
  dom.set(v, boneName[J[i * 4 + best]]);
}
const bodyVerts = [...vw.keys()];
const bodyTris: number[] = [];
for (let i = 0; i < pkg.body.index.length; i++) bodyTris.push(bodyMh[pkg.body.index[i]]);
const joint = (name: string): V3 => {
  const b = man.bones[boneName.indexOf(name)];
  const r: V3 = [0, 0, 0];
  for (const i of b.head) for (let k = 0; k < 3; k++) r[k] += P[i * 3 + k] / b.head.length;
  return r;
};
const v3 = {
  sub: (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a: V3) => Math.hypot(a[0], a[1], a[2]),
  norm: (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const deg = Math.PI / 180;

// ---------------------------------------------------------------- garment mesh under construction
interface Ref { v: V3; w: V3 }
interface GVert { X: V3; ref: Ref; uv: [number, number]; shade: number }
class Garment {
  verts: GVert[] = [];
  tris: number[] = [];
  add(g: GVert) { this.verts.push(g); return this.verts.length - 1; }
  /** Quads between consecutive rows of vertex ids (rows of equal length). */
  grid(rows: number[][], flip = false) {
    for (let r = 0; r + 1 < rows.length; r++) {
      const A = rows[r], B = rows[r + 1];
      for (let j = 0; j + 1 < A.length; j++) {
        const a = A[j], b = A[j + 1], c = B[j + 1], d = B[j];
        if (flip) this.tris.push(a, c, b, a, d, c); else this.tris.push(a, b, c, a, c, d);
      }
    }
  }
}
const edgeRef = (a: number, b: number, s: number): Ref => ({ v: [a, b, a], w: [1 - s, s, 0] });
const refPoint = (r: Ref): V3 => {
  const o: V3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) o[c] += r.w[k] * P[r.v[k] * 3 + c];
  return o;
};
/** Blend two refs (alpha * A + (1 - alpha) * nearest vertex of B) into three refs. */
const blendRef = (A: Ref, B: Ref, alpha: number): Ref => {
  const bi = B.w[0] >= B.w[1] ? B.v[0] : B.v[1];
  return { v: [A.v[0], A.v[1], bi], w: [A.w[0] * alpha, A.w[1] * alpha, 1 - alpha] };
};

// ---------------------------------------------------------------- 2D convex hull slices
interface P2 { i: number; x: number; y: number }
function hull2(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: P2[] = [], up: P2[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1)); // counter-clockwise
}
function centroid(h: P2[]): [number, number] {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < h.length; i++) {
    const p = h[i], q = h[(i + 1) % h.length], c = p.x * q.y - q.x * p.y;
    a += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c;
  }
  if (Math.abs(a) < 1e-12) return [h.reduce((s, p) => s + p.x, 0) / h.length, h.reduce((s, p) => s + p.y, 0) / h.length];
  return [cx / (3 * a), cy / (3 * a)];
}
/** Ray from an interior point to the hull boundary: the edge hit, its parameter and the distance. */
function rayHull(h: P2[], cx: number, cy: number, dx: number, dy: number) {
  let best = { a: h[0].i, b: h[0].i, s: 0, r: Infinity };
  for (let k = 0; k < h.length; k++) {
    const p = h[k], q = h[(k + 1) % h.length];
    const ex = q.x - p.x, ey = q.y - p.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((p.x - cx) * ey - (p.y - cy) * ex) / den;
    const s = ((p.x - cx) * dy - (p.y - cy) * dx) / den;
    if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6 && t < best.r) best = { a: p.i, b: q.i, s: clamp(s), r: t };
  }
  return best;
}

/**
 * Stack of hull slices along an axis. `frame(s)` gives the slice origin and in-plane axes;
 * points are assigned to slices by their axis coordinate `param(i)`.
 */
interface Slice { o: V3; e1: V3; e2: V3; hull: P2[] | null; c: [number, number] }
function slices(ids: number[], param: (i: number) => number, frame: (s: number) => { o: V3; e1: V3; e2: V3 }, s0: number, s1: number, step: number, half: number) {
  const out: (Slice & { s: number })[] = [];
  const ps = ids.map((i) => ({ i, s: param(i) }));
  for (let s = s0; s <= s1 + 1e-9; s += step) {
    const f = frame(s);
    const pts: P2[] = [];
    for (const q of ps) if (Math.abs(q.s - s) <= half) {
      const d = v3.sub(pt(q.i), f.o);
      pts.push({ i: q.i, x: v3.dot(d, f.e1), y: v3.dot(d, f.e2) });
    }
    const hull = pts.length >= 6 ? hull2(pts) : null;
    out.push({ ...f, s, hull, c: hull ? centroid(hull) : [0, 0] });
  }
  // fill empty slices from the nearest valid one; smooth centres along the axis
  const valid = out.map((x, k) => (x.hull ? k : -1)).filter((k) => k >= 0);
  if (!valid.length) throw new Error('no body points for slices');
  for (let k = 0; k < out.length; k++) if (!out[k].hull) {
    const n = valid.reduce((b, v) => (Math.abs(v - k) < Math.abs(b - k) ? v : b), valid[0]);
    out[k].hull = out[n].hull; out[k].c = [...out[n].c];
  }
  const raw = out.map((x) => x.c);
  const R = Math.max(1, Math.round(0.06 / step));
  out.forEach((x, k) => {
    let sx = 0, sy = 0, n = 0;
    for (let j = Math.max(0, k - R); j <= Math.min(out.length - 1, k + R); j++) { sx += raw[j][0]; sy += raw[j][1]; n++; }
    x.c = [sx / n, sy / n];
    const h = x.hull!;
    const inside = h.every((p, i) => { const q = h[(i + 1) % h.length]; return (q.x - p.x) * (x.c[1] - p.y) - (q.y - p.y) * (x.c[0] - p.x) > 0; });
    if (!inside) x.c = centroid(h);
  });
  return Object.assign(out, { frame });
}

// ---------------------------------------------------------------- body regions
const side = (n: string) => [`Left${n}`, `Right${n}`];
const TORSO = new Set(['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', ...side('Shoulder')]);
const LEGS = new Set([...side('UpLeg'), ...side('Leg')]);
const arms = (['Left', 'Right'] as const).map((S) => {
  const a = joint(`${S}Arm`), e = joint(`${S}ForeArm`), w = joint(`${S}Hand`);
  const L1 = v3.len(v3.sub(e, a)), L2 = v3.len(v3.sub(w, e));
  /** Arc-length parameter of the closest point on shoulder->elbow->wrist. */
  const param = (i: number) => {
    const p = pt(i);
    const seg = (A: V3, B: V3, off: number, L: number, lo: boolean, hi: boolean) => {
      const d = v3.sub(B, A);
      let t = v3.dot(v3.sub(p, A), d) / (L * L);
      if (!lo) t = Math.max(0, t);
      if (!hi) t = Math.min(1, t);
      return { s: off + t * L, dist: v3.len(v3.sub(p, v3.add(A, v3.scale(d, t)))) };
    };
    const u = seg(a, e, 0, L1, true, false), f = seg(e, w, L1, L2, false, true);
    return u.dist < f.dist ? u.s : f.s;
  };
  const dirAt = (s: number) => {
    const d1 = v3.norm(v3.sub(e, a)), d2 = v3.norm(v3.sub(w, e));
    return v3.norm(v3.lerp(d1, d2, smooth(L1 - 0.04, L1 + 0.04, s)));
  };
  const at = (s: number): V3 => (s <= L1 ? v3.lerp(a, e, s / L1) : v3.lerp(e, w, Math.min(1.5, (s - L1) / L2)));
  const frame = (s: number) => {
    const T = dirAt(s);
    const e1 = v3.norm(v3.sub([0, 0, 1], v3.scale(T, T[2])));
    return { o: at(s), e1, e2: v3.cross(T, e1), T };
  };
  const ids = bodyVerts.filter((i) => dom.get(i) === `${S}Arm` || dom.get(i) === `${S}ForeArm`);
  return { S, a, e, w, L1, L: L1 + L2, param, frame, ids, sign: S === 'Left' ? 1 : -1 };
});
/** Arm vertices near the shoulder (count as torso so bodices cover the shoulder cap). */
const shoulderCap = (frac: number) => arms.flatMap((A) => A.ids.filter((i) => dom.get(i) === `${A.S}Arm` && A.param(i) < frac * A.L1));
const torsoIds = (opts: { cap: number }) => [...bodyVerts.filter((i) => TORSO.has(dom.get(i)!) || LEGS.has(dom.get(i)!)), ...shoulderCap(opts.cap)];

const sliceCache = new Map<string, ReturnType<typeof slices>>();
const Y_STEP = 0.005;
function torsoSlices(cap: number) {
  const key = `torso${cap}`;
  if (!sliceCache.has(key)) {
    sliceCache.set(key, slices(torsoIds({ cap }), (i) => P[i * 3 + 1],
      (y) => ({ o: [0, y, 0], e1: [1, 0, 0], e2: [0, 0, 1] }), 0.0, 1.45, Y_STEP, 0.012));
  }
  return sliceCache.get(key)!;
}

// ---------------------------------------------------------------- tube garments
interface TubeOpts {
  /** Columns around the tube; rows are spaced ~`rowStep`. */
  cols: number; rowStep: number;
  /** Axis coordinate of the top/bottom edge per column angle (radians, 0 = front / e1). */
  top(a: number): number; bottom(a: number): number;
  ease(s: number, a: number): number;
  flare(s: number, a: number): number;
  /** Rows past this axis coordinate hang from the widest row above (+ how much they follow the body). */
  drapeFrom?: number; drapeFollow?: number;
  /** Axis runs downwards (torso: y decreasing) or along +s (sleeves). */
  down: boolean;
  shade?(s: number, a: number): number;
  uvScale?: number;
  smoothing?: number;
}
/** A tube lofted through slices. Returns the vertex rows (first/last row = edges). */
function tube(g: Garment, sl: ReturnType<typeof slices>, s0: number, step: number, o: TubeOpts, angle0 = Math.PI) {
  const at = (s: number) => sl[clamp(Math.round((s - s0) / step), 0, sl.length - 1)];
  const M = o.cols;
  const angles = Array.from({ length: M + 1 }, (_, j) => angle0 + (2 * Math.PI * j) / M);
  const span = Math.max(...angles.map((a) => Math.abs(o.bottom(a) - o.top(a))));
  const K = Math.max(2, Math.round(span / o.rowStep));
  // pass 1: radius + refs per grid point
  type Cell = { s: number; r: number; floor: number; ref: Ref; sl: Slice; dir: [number, number] };
  const grid: Cell[][] = [];
  for (let j = 0; j <= M; j++) {
    const a = angles[j], dir: [number, number] = [Math.sin(a), Math.cos(a)];
    const col: Cell[] = [];
    let drape: { X: V3; ref: Ref } | null = null;
    for (let k = 0; k <= K; k++) {
      const s = o.top(a) + ((o.bottom(a) - o.top(a)) * k) / K;
      const f = at(s);
      let hit = rayHull(f.hull!, f.c[0], f.c[1], dir[0], dir[1]);
      if (!isFinite(hit.r)) throw new Error(`ray missed the hull at ${s.toFixed(3)}`);
      const own = hit.r + o.ease(s, a);
      let r = own, ref = edgeRef(hit.a, hit.b, hit.s);
      const past = o.drapeFrom !== undefined && (o.down ? s <= o.drapeFrom : s >= o.drapeFrom);
      if (past) {
        if (drape) {
          // radius of the hanging point along this ray (fabric falls straight along the axis)
          const d = v3.sub(drape.X, sl.frame(s).o);
          const rd = (v3.dot(d, f.e1) - f.c[0]) * dir[0] + (v3.dot(d, f.e2) - f.c[1]) * dir[1];
          if (rd > own) { r = rd; ref = blendRef(drape.ref, ref, o.drapeFollow ?? 0.7); }
        }
        if (!drape || r <= own) {
          const X = v3.add(sl.frame(s).o, v3.add(v3.scale(f.e1, f.c[0] + dir[0] * own), v3.scale(f.e2, f.c[1] + dir[1] * own)));
          drape = { X, ref };
        }
      }
      col.push({ s, r: r + o.flare(s, a), floor: hit.r + Math.min(0.004, o.ease(s, a)), ref, sl: f, dir });
    }
    grid.push(col);
  }
  // pass 2: smooth radii, but never closer to the body than `floor`
  for (let it = 0; it < 4; it++) {
    const r0 = grid.map((c) => c.map((x) => x.r));
    for (let j = 0; j <= M; j++) for (let k = 1; k <= K; k++) {
      const jl = j === 0 ? M - 1 : j - 1, jr = j === M ? 1 : j + 1;
      const below = k < K ? r0[j][k + 1] : 2 * r0[j][k] - r0[j][k - 1];
      const avg = (r0[j][k] * 2 + r0[jl][k] + r0[jr][k] + 2 * r0[j][k - 1] + 2 * below) / 8;
      grid[j][k].r = Math.max(grid[j][k].floor, avg);
    }
  }
  // pass 3: positions, then smooth them on the surface (axial coordinate fixed, never inside `floor`)
  const uvScale = o.uvScale ?? 1 / 0.05;
  const frames = grid.map((col) => col.map((c) => sl.frame(c.s)));
  let X = grid.map((col, j) => col.map((c, k) => {
    const f = frames[j][k];
    return v3.add(f.o, v3.add(v3.scale(f.e1, c.sl.c[0] + c.dir[0] * c.r), v3.scale(f.e2, c.sl.c[1] + c.dir[1] * c.r)));
  }));
  for (let it = 0; it < (o.smoothing ?? 12); it++) {
    const X0 = X;
    X = X0.map((col, j) => col.map((x, k) => {
      if (k === 0) return x;
      const jl = j === 0 ? M - 1 : j - 1, jr = j === M ? 1 : j + 1;
      const below = k < K ? X0[j][k + 1] : v3.sub(v3.scale(x, 2), X0[j][k - 1]);
      let n = v3.scale(v3.add(v3.add(v3.scale(x, 2), v3.add(X0[jl][k], X0[jr][k])), v3.scale(v3.add(X0[j][k - 1], below), 2)), 1 / 8);
      const f = frames[j][k], c = grid[j][k], T = v3.cross(f.e1, f.e2);
      n = v3.sub(n, v3.scale(T, v3.dot(v3.sub(n, x), T)));
      const d = v3.sub(n, f.o), rr = (v3.dot(d, f.e1) - c.sl.c[0]) * c.dir[0] + (v3.dot(d, f.e2) - c.sl.c[1]) * c.dir[1];
      if (rr < c.floor) n = v3.add(n, v3.add(v3.scale(f.e1, c.dir[0] * (c.floor - rr)), v3.scale(f.e2, c.dir[1] * (c.floor - rr))));
      return n;
    }));
    for (let k = 0; k <= K; k++) X[M][k] = X[0][k]; // closed seam
  }
  const rows: number[][] = [];
  const vAcc = new Array(M + 1).fill(0);
  for (let k = 0; k <= K; k++) {
    const row: number[] = [];
    let u = 0;
    for (let j = 0; j <= M; j++) {
      if (j) u += v3.len(v3.sub(X[j][k], X[j - 1][k]));
      if (k) vAcc[j] += v3.len(v3.sub(X[j][k], X[j][k - 1]));
      const c = grid[j][k];
      row.push(g.add({ X: X[j][k], ref: c.ref, uv: [u * uvScale, vAcc[j] * uvScale], shade: o.shade?.(c.s, angles[j]) ?? 1 }));
    }
    rows.push(row);
  }
  g.grid(rows, !o.down);
  return rows;
}

/** Sleeve on one arm from s0 to s1 (arc length from the shoulder joint). Starts tucked inside the bodice. */
function sleeve(g: Garment, A: (typeof arms)[number], s0: number, s1: number, o: Omit<TubeOpts, 'top' | 'bottom' | 'down' | 'cols' | 'rowStep'> & { cols?: number }) {
  const key = `arm${A.S}`;
  const step = 0.005;
  if (!sliceCache.has(key)) sliceCache.set(key, slices(A.ids, A.param, A.frame, -0.06, A.L + 0.02, step, 0.007));
  const sl = sliceCache.get(key)!;
  const tucked = s0 - 0.035;
  // right arm: mirror the column order so faces stay outward
  return tube(g, sl, -0.06, step, {
    ...o, cols: o.cols ?? 40, rowStep: 0.012, down: false,
    top: () => tucked, bottom: () => s1,
    ease: (s, a) => (s < s0 ? (-0.02 * (s0 - s)) / 0.035 : 0) + o.ease(s, a),
  });
}

// ---------------------------------------------------------------- headwear hood
const headC: V3 = [0, joint('Head')[1] + 0.068, joint('Head')[2] + 0.018];
const hoodDir = (phi: number, psi: number): V3 => [Math.cos(psi) * Math.sin(phi), Math.sin(psi), Math.cos(psi) * Math.cos(phi)];
/** Outermost skin hit along a ray from the head centre (head/neck triangles only). */
const headTris: number[] = [];
for (let t = 0; t < bodyTris.length; t += 3) {
  const a = bodyTris[t], b = bodyTris[t + 1], c = bodyTris[t + 2];
  if ([a, b, c].some((v) => ['Head', 'Neck', 'Spine2', ...side('Shoulder')].includes(dom.get(v)!))) headTris.push(a, b, c);
}
function skinHit(o: V3, d: V3): { X: V3; ref: Ref } | null {
  let best: { t: number; ref: Ref } | null = null;
  for (let k = 0; k < headTris.length; k += 3) {
    const A = pt(headTris[k]), B = pt(headTris[k + 1]), C = pt(headTris[k + 2]);
    const e1 = v3.sub(B, A), e2 = v3.sub(C, A), p = v3.cross(d, e2), det = v3.dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const tv = v3.sub(o, A), u = v3.dot(tv, p) / det;
    if (u < 0 || u > 1) continue;
    const q = v3.cross(tv, e1), v = v3.dot(d, q) / det;
    if (v < 0 || u + v > 1) continue;
    const t = v3.dot(e2, q) / det;
    if (t > 0 && (!best || t > best.t)) best = { t, ref: { v: [headTris[k], headTris[k + 1], headTris[k + 2]], w: [1 - u - v, u, v] } };
  }
  return best && { X: v3.add(o, v3.scale(d, best.t)), ref: best.ref };
}

interface HoodOpts {
  /** Face opening: half-width (deg of azimuth) and top/bottom elevation (deg) around the head centre. */
  faceW: number; faceTop: number; faceBottom: number;
  /** Hem elevation (deg) at the front, sides and back. */
  hemFront: number; hemSide: number; hemBack: number;
  /** Lowest body point (y) included in the drape hull, and how far down the upper arm it reaches (0..1). */
  drapeLow: number; shoulderCap: number;
  /** Elevation (deg) below which the fabric starts to fall from the head towards the shoulders. */
  headDown: number; headDownBack: number;
  ease(v: number, phi: number): number;
  rimEase: number;
  /** Inner band around the face (visible cap edge): width in deg, shade. */
  band: { width: number; shade: number };
  cols: number; rows: number;
}
function hood(g: Garment, o: HoodOpts) {
  const inFace = (phi: number, psi: number, grow = 0) => {
    const mid = (o.faceTop + o.faceBottom) / 2, hh = (o.faceTop - o.faceBottom) / 2 + grow, hw = o.faceW + grow;
    const x = phi / hw, y = (psi - mid) / hh;
    return Math.pow(Math.abs(x), 2.4) + Math.pow(Math.abs(y), 2.2) < 1;
  };
  const faceHalfWidth = (psi: number) => {
    const mid = (o.faceTop + o.faceBottom) / 2, hh = (o.faceTop - o.faceBottom) / 2;
    const y = Math.abs((psi - mid) / hh);
    return y >= 1 ? 0 : o.faceW * Math.pow(1 - Math.pow(y, 2.2), 1 / 2.4);
  };
  // hull of head (minus face), neck, shoulders and upper chest/back
  const capIds = new Set(shoulderCap(o.shoulderCap));
  const ids = bodyVerts.filter((i) => {
    const p = pt(i), d = v3.sub(p, headC), bone = dom.get(i)!;
    const phi = Math.atan2(d[0], d[2]) / deg, psi = Math.atan2(d[1], Math.hypot(d[0], d[2])) / deg;
    if (bone === 'Head') return !inFace(phi, psi, -1);
    if (p[1] < o.drapeLow) return false;
    return bone === 'Neck' || bone === 'Spine2' || bone.endsWith('Shoulder') || capIds.has(i);
  });
  /** Ray from the head centre against the convex hull of `pts`: hit point + barycentric refs. */
  const hullOf = (pts: number[]) => {
    const vecs = pts.map((i) => new Vector3(...pt(i)));
    const index = new Map(vecs.map((v, k) => [v, pts[k]]));
    const hull = new ConvexHull().setFromPoints(vecs);
    return (d: V3): { X: V3; ref: Ref } => {
      let best = Infinity, face: any = null;
      const dv = new Vector3(...d), cv = new Vector3(...headC);
      for (const f of hull.faces) {
        const nd = f.normal.dot(dv);
        if (nd <= 1e-9) continue;
        const t = (f.constant - f.normal.dot(cv)) / nd;
        if (t > 0 && t < best) { best = t; face = f; }
      }
      const X = v3.add(headC, v3.scale(d, best));
      const e = face.edge, A = e.head().point, B = e.next.head().point, C = e.next.next.head().point;
      const a: V3 = [A.x, A.y, A.z], b: V3 = [B.x, B.y, B.z], c: V3 = [C.x, C.y, C.z];
      const v0 = v3.sub(b, a), v1 = v3.sub(c, a), v2 = v3.sub(X, a);
      const d00 = v3.dot(v0, v0), d01 = v3.dot(v0, v1), d11 = v3.dot(v1, v1), d20 = v3.dot(v2, v0), d21 = v3.dot(v2, v1);
      const den = d00 * d11 - d01 * d01, wb = (d11 * d20 - d01 * d21) / den, wc = (d00 * d21 - d01 * d20) / den;
      return { X, ref: { v: [index.get(A)!, index.get(B)!, index.get(C)!], w: [1 - wb - wc, wb, wc] } };
    };
  };
  const drapeHit = hullOf(ids);
  const headHit = hullOf(ids.filter((i) => dom.get(i) === 'Head'));
  /** Round over the skull, falling straight from the jaw/ears down to the shoulders. */
  const hullHit = (d: V3) => {
    const psi = Math.asin(d[1]) / deg, back = Math.abs(Math.atan2(d[0], d[2])) / Math.PI; // 0 front .. 1 back
    const down = o.headDown + (o.headDownBack - o.headDown) * smooth(0.35, 0.9, back);
    const w = smooth(down, down - 30, psi);
    if (w <= 0) return headHit(d);
    const D = drapeHit(d);
    if (w >= 1) return D;
    const H = headHit(d);
    return { X: v3.lerp(H.X, D.X, w), ref: w < 0.5 ? H.ref : D.ref };
  };
  const hemAt = (phi: number) => {
    const a = Math.abs(((phi / deg + 540) % 360) - 180); // 0 = front, 180 = back
    return a < 55 ? o.hemFront : a < 95 ? o.hemFront + (o.hemSide - o.hemFront) * smooth(55, 95, a) : o.hemSide + (o.hemBack - o.hemSide) * smooth(95, 180, a);
  };
  /** Surface point along a direction: skin-hugging near the face rim, hull-draped elsewhere. */
  const surf = (phi: number, psi: number, ease: number, rimDist: number) => {
    const d = hoodDir(phi * deg, psi * deg);
    const h = hullHit(d);
    const w = smooth(4, 16, rimDist);
    let X = v3.add(h.X, v3.scale(d, ease)), ref = h.ref;
    if (w < 1) {
      const s = skinHit(headC, d);
      if (s) {
        const Xs = v3.add(s.X, v3.scale(d, o.rimEase));
        X = v3.lerp(Xs, X, w);
        if (w < 0.5) ref = s.ref;
      }
    }
    return { X, ref };
  };
  const ovalPoint = (ang: number, grow = 0): [number, number] => {
    const mid = (o.faceTop + o.faceBottom) / 2, hh = (o.faceTop - o.faceBottom) / 2;
    return [(o.faceW + grow) * Math.sign(Math.cos(ang)) * Math.pow(Math.abs(Math.cos(ang)), 2 / 2.4),
      mid + (hh + grow) * Math.sign(Math.sin(ang)) * Math.pow(Math.abs(Math.sin(ang)), 2 / 2.2)];
  };
  const rimPts = Array.from({ length: 72 }, (_, t) => ovalPoint((t / 72) * Math.PI * 2));
  /** Angular distance (deg) to the face opening's rim. */
  const rimDistance = (phi: number, psi: number) => {
    let best = Infinity;
    for (const [rp, rs] of rimPts) {
      const dp = ((((phi - rp) % 360) + 540) % 360) - 180;
      best = Math.min(best, Math.hypot(dp * Math.cos(((psi + rs) / 2) * deg), psi - rs));
    }
    return best;
  };
  const M = o.cols, K = o.rows;
  const rows: number[][] = [];
  const Xs: V3[][] = [];
  for (let k = 0; k <= K; k++) {
    const v = k / K;
    const row: number[] = [], xs: V3[] = [];
    // rows at constant elevation in the face sector (hem is constant there)
    const psiFront = o.hemFront + v * (90 - o.hemFront);
    const fw = Math.min(faceHalfWidth(psiFront), 179);
    for (let j = 0; j <= M; j++) {
      const phi = fw + ((360 - 2 * fw) * j) / M;
      const hem = hemAt(phi * deg);
      const psi = Math.min(89.999, hem + v * (90 - hem));
      const rim = rimDistance(phi, psi);
      const { X, ref } = surf(phi, psi, o.ease(v, phi), rim);
      xs.push(X);
      row.push(g.add({ X, ref, uv: [0, 0], shade: 1 }));
    }
    rows.push(row); Xs.push(xs);
  }
  // uv by arc length
  const vAcc = new Array(M + 1).fill(0);
  for (let k = 0; k <= K; k++) {
    let u = 0;
    for (let j = 0; j <= M; j++) {
      if (j) u += v3.len(v3.sub(Xs[k][j], Xs[k][j - 1]));
      if (k) vAcc[j] += v3.len(v3.sub(Xs[k][j], Xs[k - 1][j]));
      g.verts[rows[k][j]].uv = [u / 0.05, vAcc[j] / 0.05];
    }
  }
  g.grid(rows, true);
  // inner band: a folded edge around the face that rolls in towards the skin
  const B = 96, rings = [0, 0.5, 1];
  const bandRows: number[][] = rings.map((t) => {
    const row: number[] = [];
    for (let j = 0; j <= B; j++) {
      const [phi, psi] = ovalPoint(-Math.PI / 2 + (j / B) * Math.PI * 2, -t * o.band.width);
      const d = hoodDir(phi * deg, psi * deg);
      const s = skinHit(headC, d) ?? hullHit(d);
      const e = o.rimEase * (1 - t) + 0.0012 * t + (1 - t) * 0.0015;
      row.push(g.add({ X: v3.add(s.X, v3.scale(d, e)), ref: s.ref, uv: [j / B * 12, t * 0.3], shade: o.band.shade }));
    }
    return row;
  });
  g.grid(bandRows, false);
  return { inFace };
}

// ---------------------------------------------------------------- coverage -> deleteVerts
function coveredVerts(g: Garment, candidates: number[], margin: number, depth = 0.0) {
  // weld by position for topology (uv seams duplicate vertices)
  const key = (x: V3) => x.map((c) => Math.round(c * 1e5)).join(',');
  const weld = new Map<string, number>();
  const wid = g.verts.map((v) => { const k = key(v.X); if (!weld.has(k)) weld.set(k, weld.size); return weld.get(k)!; });
  const n = weld.size;
  const pos: V3[] = new Array(n);
  g.verts.forEach((v, i) => (pos[wid[i]] = v.X));
  const nor: V3[] = Array.from({ length: n }, () => [0, 0, 0] as V3);
  const edges = new Map<string, number>();
  const adj: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  for (let t = 0; t < g.tris.length; t += 3) {
    const [a, b, c] = [wid[g.tris[t]], wid[g.tris[t + 1]], wid[g.tris[t + 2]]];
    if (a === b || b === c || a === c) continue;
    const fn = v3.cross(v3.sub(pos[b], pos[a]), v3.sub(pos[c], pos[a]));
    for (const v of [a, b, c]) nor[v] = v3.add(nor[v], fn);
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const k = x < y ? `${x}_${y}` : `${y}_${x}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
      const l = v3.len(v3.sub(pos[x], pos[y]));
      adj[x].set(y, l); adj[y].set(x, l);
    }
  }
  // make normals point away from the body (garment winding may be either way)
  let vote = 0;
  g.verts.forEach((v, i) => { vote += Math.sign(v3.dot(nor[wid[i]], v3.sub(v.X, refPoint(v.ref)))); });
  if (vote < 0) for (let i = 0; i < n; i++) nor[i] = v3.scale(nor[i], -1);
  // geodesic distance to the garment's open edges (Dijkstra, simple O(n^2)-free bucket version)
  const dist = new Float64Array(n).fill(Infinity);
  const queue: number[] = [];
  for (const [k, c] of edges) if (c === 1) for (const v of k.split('_').map(Number)) { if (dist[v]) { dist[v] = 0; queue.push(v); } }
  // label-correcting relaxation (fine for these mesh sizes)
  while (queue.length) {
    const v = queue.shift()!;
    for (const [w, l] of adj[v]) if (dist[v] + l < dist[w] - 1e-9) { dist[w] = dist[v] + l; queue.push(w); }
  }
  // spatial hash of garment vertices
  const cell = 0.04, hash = new Map<string, number[]>();
  const ck = (x: number, y: number, z: number) => `${x},${y},${z}`;
  pos.forEach((p, i) => { const k = ck(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)); (hash.get(k) ?? hash.set(k, []).get(k)!).push(i); });
  const nearest = (p: V3) => {
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
    let best = -1, bd = Infinity;
    for (let r = 0; r < 10; r++) {
      for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== r) continue;
        for (const i of hash.get(ck(x, y, z)) ?? []) { const d = v3.len(v3.sub(pos[i], p)); if (d < bd) { bd = d; best = i; } }
      }
      if (best >= 0 && bd < r * cell) break;
    }
    return best;
  };
  const out: number[] = [];
  for (const v of candidates) {
    const p = pt(v), i = nearest(p);
    if (i < 0 || dist[i] < margin) continue;
    if (v3.dot(v3.sub(pos[i], p), v3.norm(nor[i])) > depth) out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------- output
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setVertexLayout(VertexLayout.SEPARATE);
const SCALE: [number, number, number][] = [[5399, 11998, 0], [791, 881, 0], [962, 5320, 0]].map(([a, b], k) => [a, b, Math.abs(P[a * 3 + k] - P[b * 3 + k])] as [number, number, number]);


// ---------------------------------------------------------------- coherent refs
// Hull-edge and drape refs fit the default body exactly, but neighbouring garment vertices may
// reference unrelated body vertices, which crumples the cloth on other body shapes. So: deform the
// garment for a set of sample shapes, smooth each displacement field over the garment surface,
// and re-pick (greedily, up to 3) refs among nearby body vertices that best reproduce the smoothed
// motion in the least-squares sense.
const SAMPLES: Partial<typeof AUTHOR>[] = [
  { weight: 0 }, { weight: 1 }, { height: 0 }, { height: 1 }, { cupSize: 0 }, { cupSize: 1 }, { muscle: 0 }, { muscle: 1 },
  { age: 0.9 }, { proportions: 0 }, { proportions: 1 }, { weight: 1, cupSize: 1, height: 0 },
  ...DETAIL_SLIDERS.filter((d) => d.group === 'body').flatMap((d) => [{ detail: { [d.id]: 1 } }, ...(d.neg.length ? [{ detail: { [d.id]: -1 } }] : [])]),
];
const sampleShapes = SAMPLES.map((p) => {
  const Q = groundedShape({ ...AUTHOR, ...p, detail: { ...(p.detail ?? {}) } } as typeof AUTHOR);
  const sc = SCALE.map(([a, b, d], k) => Math.abs(Q[a * 3 + k] - Q[b * 3 + k]) / d);
  return { Q, sc };
});
const GROUPS = [
  new Set([...TORSO, ...LEGS]), new Set(['Head', 'Neck', 'Spine2', ...side('Shoulder')]),
  new Set(['LeftArm', 'LeftForeArm', 'LeftShoulder']), new Set(['RightArm', 'RightForeArm', 'RightShoulder']),
];
const bodyHash = new Map<string, number[]>();
const HC = 0.03;
for (const i of bodyVerts) {
  const k = [0, 1, 2].map((c) => Math.floor(P[i * 3 + c] / HC)).join(',');
  (bodyHash.get(k) ?? bodyHash.set(k, []).get(k)!).push(i);
}
function nearBody(p: V3, n: number, ok: (i: number) => boolean) {
  const c = p.map((x) => Math.floor(x / HC));
  const found: [number, number][] = [];
  for (let r = 1; r <= 4 && found.length < n; r++) {
    found.length = 0;
    for (let x = c[0] - r; x <= c[0] + r; x++) for (let y = c[1] - r; y <= c[1] + r; y++) for (let z = c[2] - r; z <= c[2] + r; z++)
      for (const i of bodyHash.get(`${x},${y},${z}`) ?? []) if (ok(i)) found.push([v3.len(v3.sub(pt(i), p)), i]);
  }
  return found.sort((a, b) => a[0] - b[0]).slice(0, n).map((x) => x[1]);
}
/** Solve the small normal equations for weights of `ids` (with a soft sum-to-one row). */
function solveSmall(A: Float64Array[], b: Float64Array, ids: number[], mu: number, lambda: number) {
  const n = ids.length, M = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let r = 0; r < b.length; r++) for (let p = 0; p < n; p++) {
    const ap = A[ids[p]][r];
    for (let q = 0; q < n; q++) M[p][q] += ap * A[ids[q]][r];
    M[p][n] += ap * b[r];
  }
  for (let p = 0; p < n; p++) { M[p][p] += lambda; for (let q = 0; q < n; q++) M[p][q] += mu * mu; M[p][n] += mu * mu; }
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const w = M.map((row, p) => row[n] / row[p]);
  let err = 0;
  for (let r = 0; r < b.length; r++) { let e = -b[r]; for (let p = 0; p < n; p++) e += w[p] * A[ids[p]][r]; err += e * e; }
  const sw = w.reduce((a, x) => a + x, 0);
  return { w, err: err + mu * mu * (sw - 1) ** 2 + lambda * w.reduce((a, x) => a + x * x, 0) };
}
function refit(g: Garment, iters: number) {
  const key = (x: V3) => x.map((c) => Math.round(c * 1e5)).join(',');
  const weld = new Map<string, number>();
  const wid = g.verts.map((v) => { const k = key(v.X); if (!weld.has(k)) weld.set(k, weld.size); return weld.get(k)!; });
  const n = weld.size;
  const nb: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < g.tris.length; t += 3) {
    const a = wid[g.tris[t]], b = wid[g.tris[t + 1]], c = wid[g.tris[t + 2]];
    for (const [x, y] of [[a, b], [b, c], [c, a]]) if (x !== y) { nb[x].add(y); nb[y].add(x); }
  }
  const nbs = nb.map((x) => [...x]);
  // smoothed target motion per sample
  const targets = sampleShapes.map(({ Q, sc }) => {
    let D = new Float64Array(n * 3);
    const cnt = new Float64Array(n);
    g.verts.forEach((v, i) => {
      const off = v3.sub(v.X, refPoint(v.ref));
      for (let c = 0; c < 3; c++) {
        let p = off[c] * sc[c];
        for (let k = 0; k < 3; k++) p += v.ref.w[k] * Q[v.ref.v[k] * 3 + c];
        D[wid[i] * 3 + c] += p - v.X[c];
      }
      cnt[wid[i]]++;
    });
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) D[i * 3 + c] /= cnt[i];
    for (let it = 0; it < iters; it++) {
      const E = new Float64Array(n * 3);
      for (let i = 0; i < n; i++) {
        const m = nbs[i].length;
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (const j of nbs[i]) s += D[j * 3 + c];
          E[i * 3 + c] = m ? 0.5 * D[i * 3 + c] + (0.5 * s) / m : D[i * 3 + c];
        }
      }
      D = E;
    }
    return D;
  });
  const S = sampleShapes.length, R = S * 3;
  let before = 0, after = 0;
  g.verts.forEach((v, i) => {
    const groups = GROUPS.filter((G) => v.ref.v.some((r, k) => v.ref.w[k] !== 0 && G.has(dom.get(r)!)));
    const ok = (j: number) => groups.some((G) => G.has(dom.get(j)!));
    const cands = [...new Set([...v.ref.v.filter((_, k) => v.ref.w[k] !== 0), ...nearBody(refPoint(v.ref), 12, ok), ...nearBody(v.X, 12, ok)])];
    const A = cands.map((j) => {
      const col = new Float64Array(R);
      sampleShapes.forEach(({ Q, sc }, m) => { for (let c = 0; c < 3; c++) col[m * 3 + c] = Q[j * 3 + c] - sc[c] * P[j * 3 + c]; });
      return col;
    });
    const b = new Float64Array(R);
    sampleShapes.forEach(({ sc }, m) => { for (let c = 0; c < 3; c++) b[m * 3 + c] = v.X[c] + targets[m][wid[i] * 3 + c] - sc[c] * v.X[c]; });
    // error of the original refs against the smoothed motion
    for (let r = 0; r < R; r++) {
      const m = Math.floor(r / 3), c = r % 3, { Q, sc } = sampleShapes[m];
      let e = -b[r];
      for (let k = 0; k < 3; k++) e += v.ref.w[k] * (Q[v.ref.v[k] * 3 + c] - sc[c] * P[v.ref.v[k] * 3 + c]);
      before += e * e;
    }
    let chosen: number[] = [], best = { w: [] as number[], err: Infinity };
    for (let step = 0; step < 3; step++) {
      let pick = -1, res = best;
      for (let c = 0; c < cands.length; c++) {
        if (chosen.includes(c)) continue;
        const r = solveSmall(A, b, [...chosen, c], 0.1, 1e-7);
        if (r.err < res.err - 1e-12) { res = r; pick = c; }
      }
      if (pick < 0) break;
      chosen = [...chosen, pick]; best = res;
    }
    after += best.err;
    const ids = chosen.map((c) => cands[c]);
    while (ids.length < 3) { ids.push(ids[0]); best.w.push(0); }
    v.ref = { v: ids as V3, w: best.w as V3 };
  });
  return { before: Math.sqrt(before / g.verts.length / R), after: Math.sqrt(after / g.verts.length / R) };
}

function top4(list: [number, number][]): [number[], number[]] {
  const s = [...list].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = s.reduce((a, [, w]) => a + w, 0) || 1;
  const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  s.forEach(([bi, ww], k) => { j[k] = bi; w[k] = ww / sum; });
  if (!s.length) w[0] = 1;
  return [j, w];
}

async function writeGarment(id: string, g: Garment, meta: Partial<ProxyMeta> & { texture: string; normalTexture: string }, deleteVerts: number[]) {
  const n = g.verts.length;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  const rIdx = new Uint16Array(n * 3), rW = new Float32Array(n * 3), rO = new Float32Array(n * 3);
  const jj = new Uint8Array(n * 4), ww = new Float32Array(n * 4);
  g.verts.forEach((v, i) => {
    pos.set(v.X, i * 3);
    uv.set(v.uv, i * 2);
    col.set([v.shade, v.shade, v.shade], i * 3);
    rIdx.set(v.ref.v, i * 3); rW.set(v.ref.w, i * 3);
    rO.set(v3.sub(v.X, refPoint(v.ref)), i * 3);
    const acc = new Map<number, number>();
    for (let k = 0; k < 3; k++) for (const [bi, bw] of vw.get(v.ref.v[k]) ?? []) acc.set(bi, (acc.get(bi) ?? 0) + bw * v.ref.w[k]);
    const [a, b] = top4([...acc.entries()].filter(([, x]) => x > 0));
    jj.set(a, i * 4); ww.set(b, i * 4);
  });
  const doc = new Document();
  const buf = doc.createBuffer();
  const acc = (type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4', arr: any) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const index = n > 65535 ? new Uint32Array(g.tris) : new Uint16Array(g.tris);
  const mat = doc.createMaterial(id).setRoughnessFactor(meta.roughness ?? 0.8).setMetallicFactor(0).setDoubleSided(true);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', pos)).setAttribute('TEXCOORD_0', acc('VEC2', uv))
    .setAttribute('_REFS', acc('VEC3', rIdx)).setAttribute('_REFW', acc('VEC3', rW)).setAttribute('_OFFS', acc('VEC3', rO))
    .setAttribute('_JOINTS', acc('VEC4', jj)).setAttribute('_WEIGHTS', acc('VEC4', ww))
    .setIndices(acc('SCALAR', index)).setMaterial(mat);
  if (g.verts.some((v) => v.shade !== 1)) prim.setAttribute('COLOR_0', acc('VEC3', col));
  doc.createScene().addChild(doc.createNode(id).setMesh(doc.createMesh(id).addPrimitive(prim)));
  await doc.transform(quantize({ pattern: /^(POSITION|TEXCOORD_0)$/, quantizePosition: 14, quantizeTexcoord: 16 }));
  const file = `proxies/clothes-${id}.glb.gz`;
  const gz = gzipSync(await io.writeBinary(doc), { level: 9 });
  writeFileSync(path.join(OUT, file), gz);
  const ranges: [number, number][] = [];
  for (const x of [...new Set(deleteVerts)].sort((a, b) => a - b)) { const l = ranges[ranges.length - 1]; if (l && x === l[1] + 1) l[1] = x; else ranges.push([x, x]); }
  console.log(`  ${file}: ${n} verts, ${g.tris.length / 3} tris, ${(gz.length / 1024).toFixed(0)} KB, hides ${deleteVerts.length} body verts`);
  return {
    id, kind: 'clothes', file, triangles: g.tris.length / 3, transparent: false, tintable: true, zDepth: 50,
    deleteVerts: ranges.length ? ranges : undefined, scale: SCALE, textureSize: 512, doubleSided: true, tileable: true,
    generated: true, ...meta,
  } as ProxyMeta;
}

// ---------------------------------------------------------------- fabric textures (tintable, tileable)
async function fabric(name: string, o: { period: number; depth: number; noise: number; twill?: boolean; knit?: boolean }) {
  const S = 512, h = new Float32Array(S * S);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // tileable value noise
  const lattice = (n: number) => { const g = Array.from({ length: n * n }, rnd); return (x: number, y: number) => {
    const fx = (x / S) * n, fy = (y / S) * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (i: number, j: number) => g[((j % n + n) % n) * n + ((i % n + n) % n)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
  }; };
  const n1 = lattice(8), n2 = lattice(32), n3 = lattice(128);
  const T = o.period;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v: number;
    if (o.knit) {
      // jersey: rows of V-shaped loops
      const cx = (x % T) / T, cy = ((y + (cx < 0.5 ? cx : 1 - cx) * T * 0.8) % T) / T;
      v = Math.sin(Math.PI * cy) * (0.6 + 0.4 * Math.cos(2 * Math.PI * cx));
    } else {
      const i = Math.floor(x / T), j = Math.floor(y / T), fx = (x % T) / T, fy = (y % T) / T;
      const warpUp = o.twill ? ((i + j) % 4) < 2 : (i + j) % 2 === 0;
      const warp = Math.sin(Math.PI * fx), weft = Math.sin(Math.PI * fy);
      v = warpUp ? 0.55 + 0.45 * warp * (0.7 + 0.3 * Math.sin(Math.PI * fy)) : 0.55 + 0.45 * weft * (0.7 + 0.3 * Math.sin(Math.PI * fx));
    }
    h[y * S + x] = v + o.noise * (n1(x, y) * 0.5 + n2(x, y) * 0.3 + n3(x, y) * 0.2 - 0.5);
  }
  const col = Buffer.alloc(S * S * 3), nrm = Buffer.alloc(S * S * 3);
  const H = (x: number, y: number) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 3;
    const l = Math.round(255 * clamp(0.86 + 0.1 * (H(x, y) - 0.6)));
    col[i] = col[i + 1] = col[i + 2] = l;
    const dx = (H(x + 1, y) - H(x - 1, y)) * o.depth, dy = (H(x, y + 1) - H(x, y - 1)) * o.depth;
    const nl = Math.hypot(dx, dy, 1);
    nrm[i] = Math.round(127.5 + 127.5 * (-dx / nl)); nrm[i + 1] = Math.round(127.5 + 127.5 * (dy / nl)); nrm[i + 2] = Math.round(127.5 + 127.5 * (1 / nl));
  }
  const raw = { raw: { width: S, height: S, channels: 3 as const } };
  writeFileSync(path.join(OUT, `textures/fabric-${name}.webp`), await sharp(col, raw).webp({ quality: 82 }).toBuffer());
  writeFileSync(path.join(OUT, `textures/fabric-${name}_n.webp`), await sharp(nrm, raw).webp({ quality: 85 }).toBuffer());
  return { texture: `textures/fabric-${name}.webp`, normalTexture: `textures/fabric-${name}_n.webp` };
}

// ---------------------------------------------------------------- the garments
const yNeck = joint('Neck')[1], yHips = joint('Hips')[1], yKnee = joint('LeftLeg')[1], yAnkle = joint('LeftFoot')[1];
const yArmpit = 1.13, yWaist = 1.02, yBust = 1.15;
const cosA = (a: number) => Math.cos(a); // 1 at the front, -1 at the back
const front = (a: number) => Math.pow(Math.max(0, cosA(a)), 2);
console.log(`landmarks: neck ${yNeck.toFixed(3)} hips ${yHips.toFixed(3)} knee ${yKnee.toFixed(3)} ankle ${yAnkle.toFixed(3)}`);

const fabrics = {
  jersey: await fabric('jersey', { period: 8, depth: 1.2, noise: 0.25, knit: true }),
  crepe: await fabric('crepe', { period: 4, depth: 1.0, noise: 0.6, twill: true }),
  cotton: await fabric('cotton', { period: 8, depth: 1.6, noise: 0.3 }),
  satin: await fabric('satin', { period: 4, depth: 0.25, noise: 0.15, twill: true }),
};

type Built = { id: string; g: Garment; meta: Partial<ProxyMeta> & { texture: string; normalTexture: string }; covers: number[]; margin: number; smooth?: number };
const built: Built[] = [];
const allBody = bodyVerts;
const notHeadOrHands = allBody.filter((i) => !/Head|Hand|Foot|Toe/.test(dom.get(i)!));

// ---- headwear
for (const v of [
  { id: 'hijab01', amira: false },
  { id: 'amira01', amira: true },
].filter((d) => !process.env.ONLY || process.env.ONLY.split(',').includes(d.id))) {
  const g = new Garment();
  hood(g, v.amira ? {
    faceW: 40, faceTop: 44, faceBottom: -50, hemFront: -63, hemSide: -44, hemBack: -58, drapeLow: 1.0, shoulderCap: 0, headDown: 0, headDownBack: -24,
    ease: (t) => 0.016 - 0.01 * smooth(0.3, 0.6, t), rimEase: 0.004, band: { width: 4, shade: 0.74 }, cols: 128, rows: 64,
  } : {
    faceW: 42, faceTop: 45, faceBottom: -50, hemFront: -80, hemSide: -56, hemBack: -72, drapeLow: 1.0, shoulderCap: 0.2, headDown: -4, headDownBack: -28,
    ease: (t) => 0.028 - 0.016 * smooth(0.3, 0.6, t), rimEase: 0.006, band: { width: 2.5, shade: 0.94 }, cols: 128, rows: 70,
  });
  built.push({
    id: v.id, g, margin: 0.02,
    meta: { ...fabrics.jersey, color: v.amira ? '#e9e2d6' : '#3a3c42', hidesHair: true, roughness: 0.85 },
    covers: allBody.filter((i) => /Head|Neck|Spine2|Shoulder|Arm$/.test(dom.get(i)!) && P[i * 3 + 1] > 1.05),
  });
}

// ---- robes and dresses
interface DressSpec {
  id: string; color: string; fabric: keyof typeof fabrics; roughness?: number;
  neck(a: number): number; hem: number; ease(y: number, a: number): number; flare: number; flareFrom: number;
  drapeFrom?: number; drapeFollow?: number; cap: number;
  sleeve?: { to: number; ease(s: number, L: number): number; flare: number };
  trim?: { neck?: number; hem?: number; cuff?: number; shade: number };
}
const DRESSES: DressSpec[] = ([
  {
    id: 'abaya01', color: '#1b1b1f', fabric: 'crepe', cap: 0.3,
    neck: (a) => yNeck + 0.022 - 0.045 * front(a), hem: yAnkle - 0.005,
    ease: (y) => 0.008 + 0.02 * smooth(1.32, 1.1, y), drapeFrom: 1.17, flare: 0.07, flareFrom: yHips,
    sleeve: { to: 1.0, ease: (s, L) => 0.012 + 0.012 * smooth(0.1, 0.6, s / L), flare: 0.045 },
  },
  {
    id: 'jalabiya01', color: '#7c2945', fabric: 'crepe', cap: 0.3,
    neck: (a) => yNeck + 0.018 - 0.06 * Math.pow(Math.max(0, cosA(a)), 6), hem: yAnkle + 0.01,
    ease: (y) => 0.008 + 0.022 * smooth(1.32, 1.12, y), drapeFrom: 1.17, flare: 0.06, flareFrom: yKnee + 0.1,
    sleeve: { to: 0.97, ease: (s, L) => 0.012 + 0.016 * smooth(0.05, 0.5, s / L), flare: 0.06 },
    trim: { neck: 0.035, cuff: 0.04, hem: 0.05, shade: 0.72 },
  },
  {
    id: 'dress_knee01', color: '#3f5e8c', fabric: 'cotton', cap: 0.25,
    neck: (a) => yNeck - 0.01 - 0.07 * front(a), hem: yKnee - 0.04,
    ease: (y) => (y > yWaist - 0.04 ? 0.006 : 0.012), drapeFrom: yWaist - 0.04, flare: 0.09, flareFrom: yWaist - 0.06,
    sleeve: { to: 0.3, ease: () => 0.008, flare: 0.012 },
  },
  {
    id: 'dress_maxi01', color: '#b85c4a', fabric: 'cotton', cap: 0.25,
    neck: (a) => yNeck + 0.005 - 0.11 * Math.max(0, 1 - Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) / 0.9), hem: yAnkle + 0.02,
    ease: (y) => (y > yBust - 0.06 ? 0.007 : 0.014), drapeFrom: yBust - 0.05, flare: 0.1, flareFrom: yBust - 0.08,
    sleeve: { to: 0.75, ease: (s, L) => 0.01 + 0.012 * (s / L), flare: 0.03 },
  },
  {
    id: 'gown01', color: '#1f3a5f', fabric: 'satin', roughness: 0.42, cap: 0.22,
    neck: (a) => yNeck - 0.005 - 0.05 * front(a), hem: 0.012,
    ease: (y) => (y > yWaist - 0.03 ? 0.005 : 0.014), drapeFrom: yWaist - 0.03, flare: 0.24, flareFrom: yWaist - 0.05,
    sleeve: { to: 0.2, ease: () => 0.007, flare: 0.01 },
  },
] as DressSpec[]).filter((d) => !process.env.ONLY || process.env.ONLY.split(',').includes(d.id));
for (const d of DRESSES) {
  const g = new Garment();
  const sl = torsoSlices(d.cap);
  const rows = tube(g, sl, 0, Y_STEP, {
    cols: 112, rowStep: 0.013, down: true,
    top: d.neck, bottom: () => d.hem, ease: d.ease,
    flare: (y) => d.flare * Math.pow(smooth(d.flareFrom, d.hem, y), 1.15),
    drapeFrom: d.drapeFrom, drapeFollow: d.drapeFollow ?? 1,
    shade: (y, a) => {
      const t = d.trim;
      if (!t) return 1;
      if (t.neck && y > d.neck(a) - t.neck) return t.shade;
      if (t.hem && y < d.hem + t.hem) return t.shade;
      return 1;
    },
  });
  void rows;
  if (d.sleeve) for (const A of arms) {
    const to = d.sleeve.to * A.L;
    sleeve(g, A, 0.02, to, {
      ease: (s) => d.sleeve!.ease(s, A.L), flare: (s) => d.sleeve!.flare * Math.pow(smooth(0.05 * A.L, to, s), 1.6),
      shade: (s) => (d.trim?.cuff && s > to - d.trim.cuff ? d.trim.shade : 1),
    });
  }
  built.push({
    id: d.id, g, margin: 0.03, smooth: 60,
    meta: { ...fabrics[d.fabric], color: d.color, roughness: d.roughness ?? 0.82 },
    covers: notHeadOrHands,
  });
}

// ---------------------------------------------------------------- write + manifest
const proxies: ProxyMeta[] = [];
for (const b of built) {
  const del = coveredVerts(b.g, b.covers, b.margin);
  const fit = process.env.NOREFIT ? { before: 0, after: 0 } : refit(b.g, b.smooth ?? 30);
  console.log(`  ${b.id}: refit rms ${(fit.after * 1000).toFixed(2)} mm (vs ${(fit.before * 1000).toFixed(2)} mm before)`);
  proxies.push(await writeGarment(b.id, b.g, b.meta, del));
}
const manifestFile = path.join(OUT, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const ids = new Set(proxies.map((p) => p.id));
// replace what was rebuilt (a full run also drops garments that no longer exist)
manifest.proxies = [...manifest.proxies.filter((p: ProxyMeta & { generated?: boolean }) => (process.env.ONLY ? true : !p.generated) && !(p.kind === 'clothes' && ids.has(p.id))), ...proxies];
writeFileSync(manifestFile, JSON.stringify(manifest));
console.log(`manifest: ${proxies.length} generated garments`);
