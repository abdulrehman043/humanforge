// Builds the realistic-human asset package from MakeHuman/MPFB CC0 data.
//
//   npx tsx tools/build-human.ts <mpfb2/src/mpfb/data> <makehuman_system_assets dir> [outDir]
//
// Output (default assets/human/):
//   manifest.json   morph table, sliders, bones, proxies, skins
//   shapes.bin      base positions (all 19158 MH verts) + sparse int16 shape/expression deltas
//   body.glb        body mesh (UV-split) + Mixamo skeleton + skin weights + _MH vertex map
//   proxies/*.glb   eyes, brows, lashes, teeth, tongue, hair, clothes (with fitting refs)
//   skins/*.webp    skin textures (1k + 2k), eyes/*.webp iris textures
//
// All input assets are CC0 (see LICENSE.ASSETS.md in MPFB2 / the system asset pack).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import path from 'node:path';
import sharp from 'sharp';
import { Document, NodeIO, VertexLayout } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { quat, mat4, vec3 } from 'gl-matrix';
import { DETAIL_SLIDERS, EXPRESSION_UNITS } from '../src/human/sliders';

const [DATA, ASSETS, OUT = path.resolve('assets/human')] = process.argv.slice(2);
if (!DATA || !ASSETS) throw new Error('usage: build-human.ts <mpfb data dir> <system assets dir> [outDir]');
const UNIT = 0.1; // MakeHuman decimetres -> metres

// ---------------------------------------------------------------- OBJ / targets
interface Obj { v: Float32Array; vt: Float32Array; groups: Map<string, number[][][]>; }
function readObj(file: string): Obj {
  const v: number[] = [], vt: number[] = [];
  const groups = new Map<string, number[][][]>();
  let g = 'default';
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push(+p[1], +p[2], +p[3]);
    else if (p[0] === 'vt') vt.push(+p[1], +p[2]);
    else if (p[0] === 'g' || p[0] === 'usemtl' && !groups.size) g = p[1] ?? g;
    else if (p[0] === 'f') {
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(p.slice(1).map((s) => s.split('/').map((n) => (n ? +n - 1 : -1))));
    }
  }
  return { v: new Float32Array(v), vt: new Float32Array(vt), groups };
}

const targetCache = new Map<string, { idx: Int32Array; d: Float32Array } | null>();
function loadTarget(rel: string) {
  if (targetCache.has(rel)) return targetCache.get(rel)!;
  const file = path.join(DATA, 'targets', rel + '.target.gz');
  if (!existsSync(file)) { targetCache.set(rel, null); return null; }
  const idx: number[] = [], d: number[] = [];
  for (const line of gunzipSync(readFileSync(file)).toString('utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p.length < 4 || p[0].startsWith('#')) continue;
    idx.push(+p[0]); d.push(+p[1], +p[2], +p[3]);
  }
  const t = { idx: Int32Array.from(idx), d: Float32Array.from(d) };
  targetCache.set(rel, t);
  return t;
}

// ---------------------------------------------------------------- base mesh
const base = readObj(path.join(DATA, '3dobjs/base.obj'));
const N = base.v.length / 3;
const vgroups: Record<string, [number, number][]> = JSON.parse(readFileSync(path.join(DATA, 'mesh_metadata/basemesh_vertex_groups.json'), 'utf8'));
const groupVerts = (name: string) => vgroups[name].flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
console.log(`base mesh: ${N} verts`);

// ---------------------------------------------------------------- macro model (MakeHuman semantics)
type Macro = { gender: number; age: number; muscle: number; weight: number; height: number; proportions: number;
  cupsize: number; firmness: number; african: number; asian: number; caucasian: number };
const DEFAULTS: Macro = { gender: 0.5, age: 0.5, muscle: 0.5, weight: 0.5, height: 0.5, proportions: 0.5,
  cupsize: 0.5, firmness: 0.5, african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3 };
type W = [string, number][];
const three = (v: number, lo: string, mid: string, hi: string): W => v < 0.5 ? [[lo, 1 - 2 * v], [mid, 2 * v]] : [[mid, 2 - 2 * v], [hi, 2 * v - 1]];
function ageW(a: number): W {
  if (a < 0.1875) return [['baby', 1 - a / 0.1875], ['child', a / 0.1875]];
  if (a < 0.5) { const t = (a - 0.1875) / 0.3125; return [['child', 1 - t], ['young', t]]; }
  return [['young', 1 - (a - 0.5) * 2], ['old', (a - 0.5) * 2]];
}
function macroTargets(m: Macro): W {
  const g: W = [['female', 1 - m.gender], ['male', m.gender]];
  const a = ageW(m.age), mu = three(m.muscle, 'minmuscle', 'averagemuscle', 'maxmuscle');
  const we = three(m.weight, 'minweight', 'averageweight', 'maxweight');
  const h: W = m.height < 0.5 ? [['minheight', 1 - 2 * m.height]] : [['maxheight', 2 * m.height - 1]];
  const p: W = m.proportions < 0.5 ? [['uncommonproportions', 1 - 2 * m.proportions]] : [['idealproportions', 2 * m.proportions - 1]];
  const cup = three(m.cupsize, 'mincup', 'averagecup', 'maxcup'), fi = three(m.firmness, 'minfirmness', 'averagefirmness', 'maxfirmness');
  const rs = m.african + m.asian + m.caucasian || 1;
  const race: W = [['african', m.african / rs], ['asian', m.asian / rs], ['caucasian', m.caucasian / rs]];
  const out: W = [];
  const push = (rel: string, w: number) => { if (w > 1e-6) out.push([rel, w]); };
  for (const [gn, gw] of g) for (const [an, aw] of a) {
    for (const [rn, rw] of race) push(`macrodetails/${rn}-${gn}-${an}`, rw * gw * aw);
    for (const [mn, mw] of mu) for (const [wn, ww] of we) {
      const k = `${gn}-${an}-${mn}-${wn}`, w = gw * aw * mw * ww;
      push(`macrodetails/universal-${k}`, w);
      for (const [hn, hw] of h) push(`macrodetails/height/${k}-${hn}`, w * hw);
      for (const [pn, pw] of p) push(`macrodetails/proportions/${k}-${pn}`, w * pw);
      for (const [cn, cw] of cup) for (const [fn, fw] of fi) push(`breast/${k}-${cn}-${fn}`, w * cw * fw);
    }
  }
  return out;
}
function shape(m: Macro): Float32Array {
  const out = new Float32Array(N * 3);
  for (const [rel, w] of macroTargets(m)) {
    const t = loadTarget(rel);
    if (!t) continue;
    for (let i = 0; i < t.idx.length; i++) {
      const o = t.idx[i] * 3;
      out[o] += t.d[i * 3] * w; out[o + 1] += t.d[i * 3 + 1] * w; out[o + 2] += t.d[i * 3 + 2] * w;
    }
  }
  return out;
}
const sub = (a: Float32Array, b: Float32Array) => a.map((v, i) => v - b[i]);

// basis morphs, relative to the default shape B0 (see src/human/runtime.ts for how weights combine)
const B0 = shape(DEFAULTS);
const VARIANTS: Record<string, Partial<Macro>> = {
  muscleUp: { muscle: 1 }, muscleDown: { muscle: 0 }, weightUp: { weight: 1 }, weightDown: { weight: 0 },
  heightUp: { height: 1 }, heightDown: { height: 0 }, proportionsUp: { proportions: 1 }, proportionsDown: { proportions: 0 },
  ageOld: { age: 1 }, ageYoung: { age: 0.344 },
  african: { african: 1, asian: 0, caucasian: 0 }, asian: { african: 0, asian: 1, caucasian: 0 }, caucasian: { african: 0, asian: 0, caucasian: 1 },
  cupUp: { cupsize: 1 }, cupDown: { cupsize: 0 }, firmUp: { firmness: 1 }, firmDown: { firmness: 0 },
};
const shapeMorphs: { name: string; d: Float32Array }[] = [];
for (const [G, gender] of [['F', 0], ['M', 1]] as const) {
  const bG = shape({ ...DEFAULTS, gender });
  shapeMorphs.push({ name: `macro/sex${G}`, d: sub(bG, B0) });
  for (const [k, v] of Object.entries(VARIANTS)) shapeMorphs.push({ name: `macro/${k}${G}`, d: sub(shape({ ...DEFAULTS, gender, ...v }), bG) });
}
console.log(`macro basis: ${shapeMorphs.length} morphs from ${[...targetCache.values()].filter(Boolean).length} targets`);

// detail targets
const detailNames = [...new Set(DETAIL_SLIDERS.flatMap((s) => [...s.neg, ...s.pos]))];
for (const rel of detailNames) {
  const t = loadTarget(rel);
  if (!t) { console.warn('  missing target', rel); continue; }
  const d = new Float32Array(N * 3);
  for (let i = 0; i < t.idx.length; i++) d.set(t.d.subarray(i * 3, i * 3 + 3), t.idx[i] * 3);
  shapeMorphs.push({ name: rel, d });
}
// expression units (caucasian set; deltas are small and race-neutral enough)
for (const unit of Object.keys(EXPRESSION_UNITS)) {
  const t = loadTarget(`expression/units/caucasian/${unit}`);
  if (!t) { console.warn('  missing expression', unit); continue; }
  const d = new Float32Array(N * 3);
  for (let i = 0; i < t.idx.length; i++) d.set(t.d.subarray(i * 3, i * 3 + 3), t.idx[i] * 3);
  shapeMorphs.push({ name: `expr/${unit}`, d });
}

// ---------------------------------------------------------------- default shape in metres, grounded
const P0 = new Float32Array(N * 3);
for (let i = 0; i < N * 3; i++) P0[i] = (base.v[i] + B0[i]) * UNIT;
const meanOf = (P: Float32Array, idx: number[]) => {
  const r = [0, 0, 0];
  for (const i of idx) { r[0] += P[i * 3]; r[1] += P[i * 3 + 1]; r[2] += P[i * 3 + 2]; }
  return r.map((x) => x / idx.length) as [number, number, number];
};
const groundIdx = groupVerts('joint-ground');
const groundY = meanOf(P0, groundIdx)[1];
for (let i = 1; i < N * 3; i += 3) P0[i] -= groundY;
console.log(`default height: ${(Math.max(...groupVerts('body').map((i) => P0[i * 3 + 1]))).toFixed(3)} m`);

// ---------------------------------------------------------------- shapes.bin.gz
// Encoding (decoded by src/human/runtime.ts decodeShapes): every stream is delta-coded
// (wrapping) along vertex order and split into byte planes, which gzip compresses ~3x
// better than raw. Morph values use 8 bits when that keeps the step <= 0.4 mm.
const morphTable: { name: string; offset: number; count: number; scale: number; bits: 8 | 16 }[] = [];
const chunks: Buffer[] = [];
let off = 0;
const pushChunk = (b: Buffer) => { chunks.push(b); const o = off; off += b.length; return o; };
/** Delta-code (wrapping) + split 16-bit values into lo/hi byte planes. */
const planes16 = (vals: ArrayLike<number>) => {
  const n = vals.length, out = Buffer.alloc(n * 2);
  let prev = 0;
  for (let i = 0; i < n; i++) { const dlt = (vals[i] - prev) & 0xffff; prev = vals[i]; out[i] = dlt & 0xff; out[n + i] = dlt >> 8; }
  return out;
};
const planes8 = (vals: ArrayLike<number>) => {
  const out = Buffer.alloc(vals.length);
  let prev = 0;
  for (let i = 0; i < vals.length; i++) { out[i] = (vals[i] - prev) & 0xff; prev = vals[i]; }
  return out;
};
// base positions: int16 over the bounding box
const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < N * 3; i++) { bmin[i % 3] = Math.min(bmin[i % 3], P0[i]); bmax[i % 3] = Math.max(bmax[i % 3], P0[i]); }
const baseScale = bmin.map((m, k) => (bmax[k] - m) / 65535);
const baseOffset = pushChunk(Buffer.concat([0, 1, 2].map((k) =>
  planes16(Array.from({ length: N }, (_, i) => Math.round((P0[i * 3 + k] - bmin[k]) / baseScale[k]))))));
for (const { name, d } of shapeMorphs) {
  const idx: number[] = [];
  let max = 0;
  for (let i = 0; i < N; i++) {
    const m = Math.max(Math.abs(d[i * 3]), Math.abs(d[i * 3 + 1]), Math.abs(d[i * 3 + 2])) * UNIT;
    if (m > 2e-5) { idx.push(i); max = Math.max(max, m); }
  }
  if (!idx.length) { console.warn('  empty morph', name); continue; }
  const bits: 8 | 16 = max / 127 <= 0.0004 ? 8 : 16;
  const scale = max / (bits === 8 ? 127 : 32767);
  const parts = [planes16(idx)];
  for (let c = 0; c < 3; c++) {
    const q = idx.map((v) => Math.round((d[v * 3 + c] * UNIT) / scale));
    parts.push(bits === 8 ? planes8(q) : planes16(q));
  }
  morphTable.push({ name, offset: pushChunk(Buffer.concat(parts)), count: idx.length, scale, bits });
}
mkdirSync(path.join(OUT, 'proxies'), { recursive: true });
mkdirSync(path.join(OUT, 'skins'), { recursive: true });
mkdirSync(path.join(OUT, 'eyes'), { recursive: true });
mkdirSync(path.join(OUT, 'textures'), { recursive: true });
const shapesGz = gzipSync(Buffer.concat(chunks), { level: 9 });
writeFileSync(path.join(OUT, 'shapes.bin.gz'), shapesGz);
console.log(`shapes.bin.gz: ${(shapesGz.length / 1024).toFixed(0)} KB (${(off / 1024).toFixed(0)} KB raw), ${morphTable.length} morphs`);

// ---------------------------------------------------------------- rig
const rig = JSON.parse(readFileSync(path.join(DATA, 'rigs/standard/rig.mixamo.json'), 'utf8')).bones as Record<string, any>;
const wjson = JSON.parse(readFileSync(path.join(DATA, 'rigs/standard/weights.mixamo.json'), 'utf8')).weights as Record<string, [number, number][]>;
const jointRef = (j: any): number[] => j.strategy === 'CUBE' ? groupVerts(j.cube_name) : j.vertex_indices;
// parents before children
const boneNames: string[] = [];
const visit = (n: string) => { if (boneNames.includes(n)) return; if (rig[n].parent) visit(rig[n].parent); boneNames.push(n); };
Object.keys(rig).forEach(visit);
const bones = boneNames.map((name) => ({
  name, parent: rig[name].parent ? boneNames.indexOf(rig[name].parent) : -1,
  head: jointRef(rig[name].head), tail: jointRef(rig[name].tail),
}));
/** World rest matrices: origin at head, +Y pointing to tail (Blender/Mixamo convention). */
function boneWorld(P: Float32Array) {
  return bones.map((b) => {
    const h = meanOf(P, b.head), t = meanOf(P, b.tail);
    const dir = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), t, h));
    const q = quat.rotationTo(quat.create(), [0, 1, 0], dir);
    return mat4.fromRotationTranslation(mat4.create(), q, h);
  });
}
// per-vertex top-4 weights
const vw: [number, number][][] = Array.from({ length: N }, () => []);
for (const [bn, list] of Object.entries(wjson)) {
  const bi = boneNames.indexOf(bn);
  if (bi < 0) continue;
  for (const [v, w] of list) vw[v].push([bi, w]);
}
function top4(list: [number, number][]): [number[], number[]] {
  const s = [...list].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = s.reduce((a, [, w]) => a + w, 0) || 1;
  const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  s.forEach(([bi, ww], k) => { j[k] = bi; w[k] = ww / sum; });
  if (!s.length) w[0] = 1; // unweighted -> root
  return [j, w];
}

// ---------------------------------------------------------------- textures
async function webp(file: string, size: number, opts: { gray?: boolean; alpha?: boolean; q?: number } = {}) {
  let img = sharp(file).resize(size, size, { fit: 'fill' });
  if (opts.gray) {
    // Tintable: luminance normalised so the mean opaque texel is ~0.8, colour comes from material.color.
    const { data, info } = await sharp(file).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let sum = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 128) { sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; n++; }
    const k = (0.8 * 255) / ((sum / Math.max(1, n)) || 1);
    for (let i = 0; i < data.length; i += 4) {
      const l = Math.min(255, (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * k);
      data[i] = data[i + 1] = data[i + 2] = l;
    }
    img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  }
  return img.webp({ quality: opts.q ?? 82, alphaQuality: 90, effort: 6 }).toBuffer();
}

// ---------------------------------------------------------------- glTF helpers
// SEPARATE layout: the runtime reads custom attributes (_MH, _REFS...) as plain typed arrays.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setVertexLayout(VertexLayout.SEPARATE);
/** Quantize standard attributes (KHR_mesh_quantization; no decoder needed) and gzip. */
async function writeGlb(doc: Document, rel: string) {
  await doc.transform(quantize({ pattern: /^(POSITION|TEXCOORD_0|WEIGHTS_0)$/, quantizePosition: 14, quantizeTexcoord: 12, quantizeWeight: 8 }));
  const gz = gzipSync(await io.writeBinary(doc), { level: 9 });
  writeFileSync(path.join(OUT, rel + '.gz'), gz);
  return gz.length;
}
function newDoc() {
  const doc = new Document();
  doc.createBuffer();
  return doc;
}
const acc = (doc: Document, type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4', arr: any) =>
  doc.createAccessor().setType(type).setArray(arr).setBuffer(doc.getRoot().listBuffers()[0]);

/** Split (vertex, uv) pairs into glTF vertices; triangulate quads. */
function weld(faces: number[][][], vt: Float32Array) {
  const key = new Map<string, number>(), mh: number[] = [], uv: number[] = [], index: number[] = [];
  const get = ([v, t]: number[]) => {
    const k = `${v}/${t}`;
    let i = key.get(k);
    if (i === undefined) { i = mh.length; key.set(k, i); mh.push(v); uv.push(t >= 0 ? vt[t * 2] : 0, t >= 0 ? 1 - vt[t * 2 + 1] : 0); }
    return i;
  };
  for (const f of faces) {
    const ids = f.map(get);
    for (let k = 1; k + 1 < ids.length; k++) index.push(ids[0], ids[k], ids[k + 1]);
  }
  return { mh, uv: new Float32Array(uv), index: mh.length > 65535 ? new Uint32Array(index) : new Uint16Array(index) };
}
// ---------------------------------------------------------------- body.glb
async function buildBody() {
  const doc = newDoc();
  const { mh, uv, index } = weld(base.groups.get('body')!, base.vt);
  const n = mh.length;
  const pos = new Float32Array(n * 3), j = new Uint8Array(n * 4), w = new Float32Array(n * 4);
  mh.forEach((v, i) => {
    pos.set(P0.subarray(v * 3, v * 3 + 3), i * 3);
    const [jj, ww] = top4(vw[v]);
    j.set(jj, i * 4); w.set(ww, i * 4);
  });
  const mat = doc.createMaterial('skin').setRoughnessFactor(0.6).setMetallicFactor(0);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc(doc, 'VEC3', pos))
    .setAttribute('TEXCOORD_0', acc(doc, 'VEC2', uv)).setAttribute('JOINTS_0', acc(doc, 'VEC4', j))
    .setAttribute('WEIGHTS_0', acc(doc, 'VEC4', w)).setAttribute('_MH', acc(doc, 'SCALAR', Uint16Array.from(mh)))
    .setIndices(acc(doc, 'SCALAR', index)).setMaterial(mat);
  const mesh = doc.createMesh('body').addPrimitive(prim);
  // skeleton
  const world = boneWorld(P0);
  const nodes = bones.map((b, i) => {
    const local = b.parent < 0 ? world[i] : mat4.multiply(mat4.create(), mat4.invert(mat4.create(), world[b.parent]), world[i]);
    const t = mat4.getTranslation(vec3.create(), local), r = mat4.getRotation(quat.create(), local);
    return doc.createNode(b.name).setTranslation([t[0], t[1], t[2]]).setRotation([r[0], r[1], r[2], r[3]]);
  });
  bones.forEach((b, i) => { if (b.parent >= 0) nodes[b.parent].addChild(nodes[i]); });
  const ibm = new Float32Array(bones.length * 16);
  world.forEach((m, i) => ibm.set(mat4.invert(mat4.create(), m), i * 16));
  const skin = doc.createSkin('mixamo').setInverseBindMatrices(acc(doc, 'MAT4', ibm) as any).setSkeleton(nodes[0]);
  nodes.forEach((nd) => skin.addJoint(nd));
  const bodyNode = doc.createNode('body').setMesh(mesh).setSkin(skin);
  const root = doc.createNode('human').addChild(nodes[0]).addChild(bodyNode);
  doc.createScene('scene').addChild(root);
  const size = await writeGlb(doc, 'body.glb');
  console.log(`body.glb.gz: ${n} verts, ${index.length / 3} tris, ${(size / 1024).toFixed(0)} KB`);
  return { vertexCount: n, triangles: index.length / 3 };
}

// ---------------------------------------------------------------- proxies (.mhclo)
interface ProxyMeta {
  id: string; kind: string; file: string; triangles: number; transparent: boolean; tintable: boolean;
  /** Body vertices hidden under this garment, as inclusive [start, end] ranges. */
  zDepth: number; deleteVerts?: [number, number][]; scale: [number, number, number][];
  texture?: string; normalTexture?: string; textureSize: number; doubleSided: boolean;
}
function toRanges(v: number[]): [number, number][] {
  const s = [...new Set(v)].sort((a, b) => a - b), out: [number, number][] = [];
  for (const x of s) { const last = out[out.length - 1]; if (last && x === last[1] + 1) last[1] = x; else out.push([x, x]); }
  return out;
}
function parseMhclo(file: string) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const refs: number[][] = [];
  const scale: [number, number, number][] = [[0, 0, 1], [0, 0, 1], [0, 0, 1]];
  const meta: Record<string, string> = {};
  const del: number[] = [];
  let mode = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const p = line.split(/\s+/);
    if (p[0] === 'verts') { mode = 'verts'; continue; }
    if (p[0] === 'delete_verts') { mode = 'delete'; continue; }
    if (mode === 'verts' && /^-?\d/.test(p[0])) {
      refs.push(p.length >= 9 ? p.slice(0, 9).map(Number) : [+p[0], +p[0], +p[0], 1, 0, 0, 0, 0, 0]);
      continue;
    }
    if (mode === 'delete' && /^\d/.test(p[0])) {
      for (let i = 0; i < p.length; i++) {
        if (p[i + 1] === '-') { for (let v = +p[i]; v <= +p[i + 2]; v++) del.push(v); i += 2; } else del.push(+p[i]);
      }
      continue;
    }
    if (p[0] === 'x_scale' || p[0] === 'y_scale' || p[0] === 'z_scale') scale['xyz'.indexOf(p[0][0])] = [+p[1], +p[2], +p[3] * UNIT];
    else meta[p[0]] = p.slice(1).join(' ');
  }
  return { refs, scale, meta, del };
}
function parseMhmat(file: string) {
  const m: Record<string, string> = {};
  if (!existsSync(file)) return m;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] && !p[0].startsWith('#')) m[p[0]] = p.slice(1).join(' ');
  }
  return m;
}
/** Fit proxy vertices onto positions P (metres): barycentric refs + axis-scaled offsets. */
function fitProxy(refs: number[][], scale: [number, number, number][], P: Float32Array) {
  const s = scale.map(([a, b, d], k) => Math.abs(P[a * 3 + k] - P[b * 3 + k]) / d);
  const out = new Float32Array(refs.length * 3);
  refs.forEach(([a, b, c, wa, wb, wc, ox, oy, oz], i) => {
    for (let k = 0; k < 3; k++) out[i * 3 + k] = wa * P[a * 3 + k] + wb * P[b * 3 + k] + wc * P[c * 3 + k] + [ox, oy, oz][k] * UNIT * s[k];
  });
  return out;
}

async function buildProxy(kind: string, dir: string, opts: { tint?: boolean; texSize?: number; mat?: string } = {}): Promise<ProxyMeta | null> {
  const id = path.basename(dir);
  const mhclo = readdirSync(dir).find((f) => f.endsWith('.mhclo'));
  if (!mhclo) return null;
  const { refs, scale, meta, del } = parseMhclo(path.join(dir, mhclo));
  const obj = readObj(path.join(dir, meta.obj_file));
  const faces = [...obj.groups.values()].flat();
  const { mh: pv, uv, index } = weld(faces, obj.vt);
  const fitted = fitProxy(refs, scale, P0);
  const n = pv.length;
  const pos = new Float32Array(n * 3), rIdx = new Uint16Array(n * 3), rW = new Float32Array(n * 3), rO = new Float32Array(n * 3);
  const j = new Uint8Array(n * 4), w = new Float32Array(n * 4);
  pv.forEach((v, i) => {
    pos.set(fitted.subarray(v * 3, v * 3 + 3), i * 3);
    const [a, b, c, wa, wb, wc, ox, oy, oz] = refs[v];
    rIdx.set([a, b, c], i * 3); rW.set([wa, wb, wc], i * 3); rO.set([ox * UNIT, oy * UNIT, oz * UNIT], i * 3);
    // skin weights inherited from the referenced body vertices
    const acc4 = new Map<number, number>();
    [[a, wa], [b, wb], [c, wc]].forEach(([vv, ww]) => vw[vv].forEach(([bi, bw]) => acc4.set(bi, (acc4.get(bi) ?? 0) + bw * ww)));
    const [jj, ww4] = top4([...acc4.entries()].filter(([, x]) => x > 0));
    j.set(jj, i * 4); w.set(ww4, i * 4);
  });
  const mhmat = parseMhmat(path.join(dir, opts.mat ?? meta.material ?? ''));
  const doc = newDoc();
  const transparent = mhmat.transparent === 'True' || kind === 'hair' || kind === 'eyebrows' || kind === 'eyelashes';
  const material = doc.createMaterial(id).setRoughnessFactor(kind === 'eyes' ? 0.15 : kind === 'hair' ? 0.55 : 0.8)
    .setMetallicFactor(0).setDoubleSided(mhmat.backfaceCull === 'False' || transparent)
    .setAlphaMode(transparent ? (kind === 'hair' ? 'MASK' : 'BLEND') : 'OPAQUE').setAlphaCutoff(0.35);
  const diffuse = mhmat.diffuseTexture && path.join(path.dirname(path.join(dir, opts.mat ?? meta.material ?? '')), mhmat.diffuseTexture);
  // Textures ship as separate WebP files (not embedded) so the runtime can load them with
  // whatever the platform offers (TextureLoader on web, expo-gl on React Native).
  let texture: string | undefined, normalTexture: string | undefined;
  const texSize = opts.texSize ?? 1024;
  if (diffuse && existsSync(diffuse)) {
    texture = `textures/${kind}-${id}.webp`;
    writeFileSync(path.join(OUT, texture), await webp(diffuse, texSize, { gray: opts.tint }));
  }
  const normalMap = mhmat.normalmapTexture && path.join(dir, mhmat.normalmapTexture);
  if (normalMap && existsSync(normalMap) && kind === 'clothes') {
    normalTexture = `textures/${kind}-${id}_n.webp`;
    writeFileSync(path.join(OUT, normalTexture), await webp(normalMap, 1024, { q: 75 }));
  }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc(doc, 'VEC3', pos))
    .setAttribute('TEXCOORD_0', acc(doc, 'VEC2', uv))
    .setAttribute('_REFS', acc(doc, 'VEC3', rIdx)).setAttribute('_REFW', acc(doc, 'VEC3', rW)).setAttribute('_OFFS', acc(doc, 'VEC3', rO))
    .setAttribute('_JOINTS', acc(doc, 'VEC4', j)).setAttribute('_WEIGHTS', acc(doc, 'VEC4', w))
    .setIndices(acc(doc, 'SCALAR', index)).setMaterial(material);
  doc.createScene().addChild(doc.createNode(id).setMesh(doc.createMesh(id).addPrimitive(prim)));
  const file = `proxies/${kind}-${id}.glb.gz`;
  await writeGlb(doc, file.replace(/\.gz$/, ''));
  return {
    id, kind, file, triangles: index.length / 3, transparent, tintable: !!opts.tint, zDepth: +(meta.z_depth ?? 50),
    deleteVerts: del.length ? toRanges(del) : undefined, scale, texture, normalTexture, textureSize: texSize,
    doubleSided: mhmat.backfaceCull === 'False' || transparent,
  };
}

// ---------------------------------------------------------------- run
(async () => {
  const body = await buildBody();
  const proxies: ProxyMeta[] = [];
  const add = async (kind: string, sub: string, o?: Parameters<typeof buildProxy>[2]) => {
    const dir = path.join(ASSETS, kind, sub);
    if (!existsSync(dir)) return;
    const p = await buildProxy(kind, dir, o);
    if (p) { proxies.push(p); console.log(`  ${p.file} (${p.triangles} tris)`); }
  };
  await add('eyes', 'high-poly', { texSize: 512 });
  for (const s of readdirSync(path.join(ASSETS, 'eyebrows'))) await add('eyebrows', s, { tint: true, texSize: 256 });
  for (const s of readdirSync(path.join(ASSETS, 'eyelashes'))) await add('eyelashes', s, { texSize: 256 });
  await add('teeth', 'teeth_base', { texSize: 256 });
  await add('tongue', 'tongue01', { texSize: 256 });
  for (const s of readdirSync(path.join(ASSETS, 'hair'))) await add('hair', s, { tint: true, texSize: 1024 });
  for (const s of readdirSync(path.join(ASSETS, 'clothes'))) await add('clothes', s, { texSize: 1024 });

  // skins
  const skins: { id: string; tags: string[] }[] = [];
  for (const s of readdirSync(path.join(ASSETS, 'skins')).sort()) {
    const dir = path.join(ASSETS, 'skins', s);
    const mat = parseMhmat(path.join(dir, `${s}.mhmat`));
    if (!mat.diffuseTexture || s.includes('special') || s.includes('toon')) continue;
    const src = path.join(dir, path.basename(mat.diffuseTexture));
    if (!existsSync(src)) continue;
    writeFileSync(path.join(OUT, `skins/${s}_2k.webp`), await webp(src, 2048, { q: 80 }));
    writeFileSync(path.join(OUT, `skins/${s}_1k.webp`), await webp(src, 1024, { q: 82 }));
    skins.push({ id: s, tags: s.split('_') });
  }
  // eye colours
  const eyes: string[] = [];
  for (const f of readdirSync(path.join(ASSETS, 'eyes/materials')).filter((f) => f.endsWith('_eye.png'))) {
    const id = f.replace('_eye.png', '');
    writeFileSync(path.join(OUT, `eyes/${id}.webp`), await webp(path.join(ASSETS, 'eyes/materials', f), 512));
    eyes.push(id);
  }

  const manifest = {
    format: 'humanforge-human', version: 1, license: 'CC0-1.0 (MakeHuman / MPFB assets)', units: 'm',
    vertexCount: N, bodyVertexRange: vgroups.body[0], groundVerts: groundIdx,
    body: { file: 'body.glb.gz', ...body },
    shapes: { file: 'shapes.bin.gz', baseOffset, baseMin: bmin, baseScale, morphs: morphTable },
    bones: bones.map((b) => ({ name: b.name, parent: b.parent, head: b.head, tail: b.tail })),
    proxies, skins, eyes,
    textureSizes: { skin1k: 1024, skin2k: 2048, eyes: 512 },
    expressions: EXPRESSION_UNITS,
  };
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
  console.log(`manifest: ${proxies.length} proxies, ${skins.length} skins, ${eyes.length} eye colours`);
})();
