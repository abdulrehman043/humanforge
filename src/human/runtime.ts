// Realistic human runtime: loads the CC0 MakeHuman-derived package built by
// tools/build-human.ts and reshapes it on the CPU (shape sliders change rarely),
// keeping only facial expressions as GPU morph targets.
//
// Platform-neutral: no DOM, no GLTFLoader. Textures come from a pluggable loader
// (TextureLoader on the web by default; see src/native/humanTextures.ts for React Native).
import {
  Bone, BufferAttribute, BufferGeometry, DoubleSide, FrontSide, Group, Material, Matrix4, MeshStandardMaterial,
  Quaternion, SRGBColorSpace, Skeleton, SkinnedMesh, Texture, TextureLoader, Vector3,
} from 'three';
import { gunzipSync } from 'fflate';
import { DETAIL_SLIDERS } from './sliders';
import { GlbPrimitive, readGlb, toFloat } from './glb';

// ---------------------------------------------------------------- config
export interface HumanConfig {
  /** 0 = female, 1 = male */
  gender: number;
  /** 0..1 maps to 18..90 years */
  age: number;
  muscle: number;
  weight: number;
  height: number;
  proportions: number;
  cupSize: number;
  firmness: number;
  african: number;
  asian: number;
  caucasian: number;
  /** Detail sliders, -1..1, keyed by DETAIL_SLIDERS id. */
  detail: Record<string, number>;
  skin: string;
  /** Multiplied over the skin texture for fine tone control. */
  skinTint: string;
  eyes: string;
  eyebrows: string | null;
  eyebrowColor: string;
  eyelashes: string | null;
  hair: string | null;
  hairColor: string;
  clothes: string[];
}

export const DEFAULT_HUMAN: HumanConfig = {
  gender: 0.5, age: 0.15, muscle: 0.5, weight: 0.5, height: 0.5, proportions: 0.5, cupSize: 0.5, firmness: 0.5,
  african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3, detail: {},
  skin: 'young_caucasian_female', skinTint: '#ffffff', eyes: 'brownlight', eyebrows: 'eyebrow001', eyebrowColor: '#3b2a1e',
  eyelashes: 'eyelashes01', hair: 'bob02', hairColor: '#3b2a1e', clothes: ['female_casualsuit01', 'shoes01'],
};

// ---------------------------------------------------------------- package
export interface ProxyMeta {
  id: string; kind: string; file: string; triangles: number; transparent: boolean; tintable: boolean; zDepth: number;
  deleteVerts?: [number, number][]; scale: [number, number, number][];
  texture?: string; normalTexture?: string; textureSize: number; doubleSided: boolean;
}
export interface HumanManifest {
  vertexCount: number;
  groundVerts: number[];
  body: { file: string; vertexCount: number; triangles: number };
  shapes: {
    file: string; baseOffset: number; baseMin: number[]; baseScale: number[];
    morphs: { name: string; offset: number; count: number; scale: number; bits: 8 | 16 }[];
  };
  bones: { name: string; parent: number; head: number[]; tail: number[] }[];
  proxies: ProxyMeta[];
  skins: { id: string; tags: string[] }[];
  eyes: string[];
  textureSizes: { skin1k: number; skin2k: number; eyes: number };
  expressions: Record<string, string>;
}
interface Morph { idx: Uint16Array; d: Int16Array; scale: number }

/** Loads a texture from a URL. `size` is the known square size (React Native needs it up front). */
export type HumanTextureLoader = (url: string, size: number) => Promise<Texture>;

export const webTextureLoader: HumanTextureLoader = async (url) => new TextureLoader().loadAsync(url);

export interface HumanPackage {
  baseUrl: string;
  manifest: HumanManifest;
  base: Float32Array;
  morphs: Map<string, Morph>;
  body: GlbPrimitive;
  loadTexture: HumanTextureLoader;
  fetchBinary: (url: string) => Promise<ArrayBuffer>;
  proxyCache: Map<string, Promise<GlbPrimitive>>;
  textureCache: Map<string, Promise<Texture>>;
}

export interface LoadOptions {
  loadTexture?: HumanTextureLoader;
  /** Override fetching (e.g. for an offline cache). Must return the raw (still gzipped) bytes. */
  fetch?: (url: string) => Promise<ArrayBuffer>;
}

/** Undo build-human's wrapping delta coding + byte planes. */
function unplane16(src: Uint8Array, at: number, n: number, signed: boolean) {
  const out = signed ? new Int16Array(n) : new Uint16Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc = (acc + (src[at + i] | (src[at + n + i] << 8))) & 0xffff; out[i] = acc; }
  return out;
}
function unplane8(src: Uint8Array, at: number, n: number) {
  const out = new Int16Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc = (acc + src[at + i]) & 0xff; out[i] = acc > 127 ? acc - 256 : acc; }
  return out;
}

/** Load the human package (manifest + shapes + body). Proxies/textures load lazily per config. */
export async function loadHumanPackage(baseUrl: string, opts: LoadOptions = {}): Promise<HumanPackage> {
  const root = baseUrl.replace(/\/$/, '');
  const rawFetch = opts.fetch ?? (async (u: string) => (await fetch(u)).arrayBuffer());
  // `.gz` files are gunzipped in JS, so no server Content-Encoding setup is needed (and it works in RN).
  const fetchBinary = async (u: string) => {
    const buf = new Uint8Array(await rawFetch(u));
    const raw = u.endsWith('.gz') && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
    return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  };
  const manifestBytes = new Uint8Array(await rawFetch(`${root}/manifest.json`));
  let text = '';
  for (let i = 0; i < manifestBytes.length; i += 8192) text += String.fromCharCode(...manifestBytes.subarray(i, i + 8192));
  const manifest: HumanManifest = JSON.parse(text);
  const [bin, bodyBuf] = await Promise.all([fetchBinary(`${root}/${manifest.shapes.file}`), fetchBinary(`${root}/${manifest.body.file}`)]);
  const bytes = new Uint8Array(bin);
  const N = manifest.vertexCount, sh = manifest.shapes;
  const base = new Float32Array(N * 3);
  for (let k = 0; k < 3; k++) {
    const q = unplane16(bytes, sh.baseOffset + k * N * 2, N, false);
    for (let i = 0; i < N; i++) base[i * 3 + k] = sh.baseMin[k] + q[i] * sh.baseScale[k];
  }
  const morphs = new Map<string, Morph>();
  for (const m of sh.morphs) {
    const idx = unplane16(bytes, m.offset, m.count, false) as Uint16Array;
    const d = new Int16Array(m.count * 3);
    let at = m.offset + m.count * 2;
    for (let k = 0; k < 3; k++) {
      const v = m.bits === 8 ? unplane8(bytes, at, m.count) : unplane16(bytes, at, m.count, true);
      at += m.count * (m.bits === 8 ? 1 : 2);
      for (let i = 0; i < m.count; i++) d[i * 3 + k] = v[i];
    }
    morphs.set(m.name, { idx, d, scale: m.scale });
  }
  return {
    baseUrl: root, manifest, base, morphs, body: readGlb(bodyBuf), loadTexture: opts.loadTexture ?? webTextureLoader,
    fetchBinary, proxyCache: new Map(), textureCache: new Map(),
  };
}

// ---------------------------------------------------------------- shape evaluation
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Weights of the baked macro basis for a config (see VARIANTS in tools/build-human.ts). */
export function macroWeights(c: HumanConfig): Record<string, number> {
  const w: Record<string, number> = {};
  const g = clamp01(c.gender);
  w['macro/sexF'] = Math.max(0, 1 - 2 * g);
  w['macro/sexM'] = Math.max(0, 2 * g - 1);
  const split = (v: number, up: string, down: string) => {
    const x = clamp01(v);
    const [k, amt] = x >= 0.5 ? [up, 2 * x - 1] : [down, 1 - 2 * x];
    w[`macro/${k}F`] = (w[`macro/${k}F`] ?? 0) + amt * (1 - g);
    w[`macro/${k}M`] = (w[`macro/${k}M`] ?? 0) + amt * g;
  };
  split(c.muscle, 'muscleUp', 'muscleDown');
  split(c.weight, 'weightUp', 'weightDown');
  // MakeHuman's height range spans dwarf..giant (1.2-2.45 m); use its realistic middle band.
  split(0.5 + (clamp01(c.height) - 0.5) * 0.36, 'heightUp', 'heightDown');
  split(c.proportions, 'proportionsUp', 'proportionsDown');
  split(c.cupSize, 'cupUp', 'cupDown');
  split(c.firmness, 'firmUp', 'firmDown');
  // age slider 0..1 -> 18..90 years -> MakeHuman age value
  const years = 18 + 72 * clamp01(c.age);
  if (years < 25) {
    const t = (25 - years) / 7;
    w['macro/ageYoungF'] = t * (1 - g); w['macro/ageYoungM'] = t * g;
  } else {
    const t = (years - 25) / 65;
    w['macro/ageOldF'] = t * (1 - g); w['macro/ageOldM'] = t * g;
  }
  const rs = c.african + c.asian + c.caucasian || 1;
  for (const r of ['african', 'asian', 'caucasian'] as const) {
    const x = c[r] / rs;
    w[`macro/${r}F`] = x * (1 - g); w[`macro/${r}M`] = x * g;
  }
  return w;
}

/** Full shape (all MakeHuman vertices incl. helpers), metres, before grounding. */
export function evaluateShape(pkg: HumanPackage, c: HumanConfig, out: Float32Array = new Float32Array(pkg.base.length)) {
  out.set(pkg.base);
  const add = (name: string, weight: number) => {
    const m = pkg.morphs.get(name);
    if (!m || Math.abs(weight) < 1e-4) return;
    const s = m.scale * weight;
    for (let i = 0; i < m.idx.length; i++) {
      const o = m.idx[i] * 3;
      out[o] += m.d[i * 3] * s; out[o + 1] += m.d[i * 3 + 1] * s; out[o + 2] += m.d[i * 3 + 2] * s;
    }
  };
  for (const [k, v] of Object.entries(macroWeights(c))) add(k, v);
  for (const s of DETAIL_SLIDERS) {
    const v = c.detail[s.id] ?? 0;
    if (v > 0) s.pos.forEach((t) => add(t, v));
    else if (v < 0) s.neg.forEach((t) => add(t, -v));
  }
  return out;
}

function morphDeltas(pkg: HumanPackage, name: string): Float32Array | null {
  const m = pkg.morphs.get(name);
  if (!m) return null;
  const d = new Float32Array(pkg.base.length);
  for (let i = 0; i < m.idx.length; i++) {
    const o = m.idx[i] * 3;
    d[o] = m.d[i * 3] * m.scale; d[o + 1] = m.d[i * 3 + 1] * m.scale; d[o + 2] = m.d[i * 3 + 2] * m.scale;
  }
  return d;
}

// ---------------------------------------------------------------- avatar
const tmpA = new Vector3(), tmpB = new Vector3(), tmpC = new Vector3();
const asU16 = (a: GlbPrimitive['attributes'][string]) => (a.array instanceof Uint16Array ? a.array : Uint16Array.from(a.array));

/** Geometry with float position/normal storage (recomputed on the CPU) plus uv/skin from the GLB. */
function geometryFrom(prim: GlbPrimitive, joints: string, weights: string) {
  const g = new BufferGeometry();
  const n = prim.attributes.POSITION.array.length / 3;
  g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('uv', new BufferAttribute(toFloat(prim.attributes.TEXCOORD_0), 2));
  g.setAttribute('skinIndex', new BufferAttribute(asU16(prim.attributes[joints]), 4));
  g.setAttribute('skinWeight', new BufferAttribute(toFloat(prim.attributes[weights]), 4));
  g.setIndex(new BufferAttribute(prim.index, 1));
  return g;
}

interface ProxyInstance { meta: ProxyMeta; mesh: SkinnedMesh; refs: Uint16Array; refw: Float32Array; offs: Float32Array }

export class HumanAvatar {
  readonly group = new Group();
  private pkg: HumanPackage;
  private body: SkinnedMesh;
  private skeleton: Skeleton;
  private mh: Uint16Array;
  private fullIndex: Uint16Array | Uint32Array;
  private positions: Float32Array;
  private proxies = new Map<string, ProxyInstance>();
  private config: HumanConfig = { ...DEFAULT_HUMAN };
  private exprNames: string[];
  private exprDeltas: Float32Array[];
  private skinMat: MeshStandardMaterial;
  private version = 0;
  textureSize: '1k' | '2k' = '2k';

  constructor(pkg: HumanPackage) {
    this.pkg = pkg;
    const geo = geometryFrom(pkg.body, 'JOINTS_0', 'WEIGHTS_0');
    this.mh = asU16(pkg.body.attributes._MH);
    this.fullIndex = pkg.body.index.slice();
    const bones = pkg.manifest.bones.map((b) => Object.assign(new Bone(), { name: b.name }));
    pkg.manifest.bones.forEach((b, i) => { if (b.parent >= 0) bones[b.parent].add(bones[i]); });
    this.skeleton = new Skeleton(bones);
    this.skinMat = new MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
    this.body = new SkinnedMesh(geo, this.skinMat);
    this.body.name = 'body';
    this.body.frustumCulled = false;
    this.body.add(bones[0]);
    this.group.add(this.body);
    this.positions = new Float32Array(pkg.base.length);
    // expressions: GPU morph targets (body + face proxies)
    this.exprNames = Object.keys(pkg.manifest.expressions).filter((u) => pkg.morphs.has(`expr/${u}`));
    this.exprDeltas = this.exprNames.map((u) => morphDeltas(pkg, `expr/${u}`)!);
    this.attachMorphs(geo, (i, k) => this.mh[i] * 3 + k);
    this.body.updateMorphTargets();
    this.body.morphTargetDictionary = Object.fromEntries(this.exprNames.map((u, i) => [this.alias(u), i]));
  }

  get bones() { return this.skeleton.bones; }
  private alias(unit: string) { return this.pkg.manifest.expressions[unit] ?? unit; }

  /** Expression morph attributes from full-shape deltas, either by direct lookup or via proxy refs. */
  private attachMorphs(geo: BufferGeometry, lookup: (i: number, k: number) => number, refs?: { r: Uint16Array; w: Float32Array }) {
    const n = geo.getAttribute('position').count;
    geo.morphAttributes.position = this.exprDeltas.map((d) => {
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
        arr[i * 3 + k] = refs
          ? refs.w[i * 3] * d[refs.r[i * 3] * 3 + k] + refs.w[i * 3 + 1] * d[refs.r[i * 3 + 1] * 3 + k] + refs.w[i * 3 + 2] * d[refs.r[i * 3 + 2] * 3 + k]
          : d[lookup(i, k)];
      }
      return new BufferAttribute(arr, 3);
    });
    geo.morphTargetsRelative = true;
  }

  /** Apply a full or partial config. Loads any new hair/clothes/textures, then reshapes. */
  async setConfig(patch: Partial<HumanConfig>) {
    const prev = this.config;
    const c = (this.config = { ...prev, ...patch, detail: { ...prev.detail, ...(patch.detail ?? {}) } });
    const v = ++this.version;
    const wanted = new Map<string, string>(); // slot -> proxy id
    wanted.set('eyes', 'eyes-high-poly');
    if (c.eyebrows) wanted.set('eyebrows', `eyebrows-${c.eyebrows}`);
    if (c.eyelashes) wanted.set('eyelashes', `eyelashes-${c.eyelashes}`);
    wanted.set('teeth', 'teeth-teeth_base');
    wanted.set('tongue', 'tongue-tongue01');
    if (c.hair) wanted.set('hair', `hair-${c.hair}`);
    c.clothes.forEach((id) => wanted.set(`clothes:${id}`, `clothes-${id}`));
    const loads = [...wanted.entries()].map(async ([slot, id]) => {
      const cur = this.proxies.get(slot);
      if (cur && `${cur.meta.kind}-${cur.meta.id}` === id) return null;
      return [slot, await this.loadProxy(id)] as const;
    });
    const sizes = this.pkg.manifest.textureSizes;
    const skin = this.texture(`skins/${c.skin}_${this.textureSize}.webp`, this.textureSize === '2k' ? sizes.skin2k : sizes.skin1k);
    const eyes = this.texture(`eyes/${c.eyes}.webp`, sizes.eyes);
    const loaded = await Promise.all(loads);
    const [skinTex, eyeTex] = await Promise.all([skin, eyes]);
    if (v !== this.version) return; // a newer setConfig superseded this one
    for (const slot of [...this.proxies.keys()]) if (!wanted.has(slot)) this.removeProxy(slot);
    for (const entry of loaded) {
      if (!entry || !entry[1]) continue;
      this.removeProxy(entry[0]);
      this.proxies.set(entry[0], entry[1]);
      this.group.add(entry[1].mesh);
    }
    this.skinMat.map = skinTex;
    this.skinMat.color.set(c.skinTint);
    this.skinMat.needsUpdate = true;
    for (const [slot, p] of this.proxies) {
      const m = p.mesh.material as MeshStandardMaterial;
      if (slot === 'hair') m.color.set(c.hairColor);
      if (slot === 'eyebrows') m.color.set(c.eyebrowColor);
      if (slot === 'eyes' && m.map !== eyeTex) { m.map = eyeTex; m.needsUpdate = true; }
    }
    this.reshape();
  }

  getConfig(): HumanConfig { return this.config; }

  /** Expression by ARKit-style name (e.g. 'jawOpen', 'mouthSmile') or MPFB unit name, weight 0..1. */
  setExpression(name: string, weight: number) {
    const unit = this.exprNames.findIndex((u) => u === name || this.alias(u) === name);
    if (unit < 0) return;
    for (const m of [this.body, ...[...this.proxies.values()].map((p) => p.mesh)]) {
      if (m.morphTargetInfluences && unit < m.morphTargetInfluences.length) m.morphTargetInfluences[unit] = weight;
    }
  }
  get expressionNames() { return this.exprNames.map((u) => this.alias(u)); }

  private texture(file: string, size: number): Promise<Texture> {
    const url = `${this.pkg.baseUrl}/${file}`;
    let t = this.pkg.textureCache.get(url);
    if (!t) {
      t = this.pkg.loadTexture(url, size).then((tex) => {
        tex.colorSpace = file.endsWith('_n.webp') ? '' : SRGBColorSpace;
        tex.flipY = false;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        return tex;
      });
      this.pkg.textureCache.set(url, t);
    }
    return t;
  }

  private async loadProxy(fullId: string): Promise<ProxyInstance | null> {
    const meta = this.pkg.manifest.proxies.find((p) => `${p.kind}-${p.id}` === fullId);
    if (!meta) return null;
    let p = this.pkg.proxyCache.get(fullId);
    if (!p) {
      p = this.pkg.fetchBinary(`${this.pkg.baseUrl}/${meta.file}`).then(readGlb);
      this.pkg.proxyCache.set(fullId, p);
    }
    const [prim, map, normalMap] = await Promise.all([
      p,
      meta.texture ? this.texture(meta.texture, meta.textureSize) : null,
      meta.normalTexture ? this.texture(meta.normalTexture, 1024) : null,
    ]);
    const geo = geometryFrom(prim, '_JOINTS', '_WEIGHTS');
    const refs = asU16(prim.attributes._REFS), refw = toFloat(prim.attributes._REFW), offs = toFloat(prim.attributes._OFFS);
    const mat = new MeshStandardMaterial({
      map, normalMap, metalness: 0,
      roughness: meta.kind === 'eyes' ? 0.15 : meta.kind === 'hair' ? 0.55 : 0.8,
      side: meta.doubleSided ? DoubleSide : FrontSide,
    });
    if (meta.kind === 'hair') {
      mat.alphaTest = 0.3;
      mat.alphaToCoverage = true;
    } else if (meta.transparent) {
      mat.transparent = true;
      mat.depthWrite = false;
    }
    const mesh = new SkinnedMesh(geo, mat);
    mesh.name = fullId;
    mesh.frustumCulled = false;
    mesh.renderOrder = meta.transparent ? 2 + meta.zDepth / 100 : 0;
    if (['eyebrows', 'eyelashes', 'teeth', 'tongue'].includes(meta.kind)) {
      this.attachMorphs(geo, () => 0, { r: refs, w: refw });
      mesh.updateMorphTargets();
      mesh.morphTargetDictionary = this.body.morphTargetDictionary;
      mesh.morphTargetInfluences = [...(this.body.morphTargetInfluences ?? [])];
    }
    return { meta, mesh, refs, refw, offs };
  }

  private removeProxy(slot: string) {
    const p = this.proxies.get(slot);
    if (!p) return;
    this.group.remove(p.mesh);
    p.mesh.geometry.dispose();
    (p.mesh.material as Material).dispose();
    this.proxies.delete(slot);
  }

  /** CPU reshape: body, proxies, skeleton, faces hidden under clothes. */
  private reshape() {
    const P = evaluateShape(this.pkg, this.config, this.positions);
    const man = this.pkg.manifest;
    let gy = 0;
    for (const i of man.groundVerts) gy += P[i * 3 + 1];
    gy /= man.groundVerts.length;
    for (let i = 1; i < P.length; i += 3) P[i] -= gy;

    // body positions + seam-aware normals (accumulated per MakeHuman vertex)
    const geo = this.body.geometry;
    const pos = geo.getAttribute('position') as BufferAttribute;
    const mh = this.mh;
    for (let i = 0; i < mh.length; i++) pos.setXYZ(i, P[mh[i] * 3], P[mh[i] * 3 + 1], P[mh[i] * 3 + 2]);
    pos.needsUpdate = true;
    const hidden = new Uint8Array(man.vertexCount);
    for (const p of this.proxies.values()) p.meta.deleteVerts?.forEach(([a, b]) => hidden.fill(1, a, b + 1));
    const full = this.fullIndex;
    const kept: number[] = [];
    const nAcc = new Float32Array(P.length);
    for (let i = 0; i < full.length; i += 3) {
      const a = mh[full[i]], b = mh[full[i + 1]], c = mh[full[i + 2]];
      if (!(hidden[a] || hidden[b] || hidden[c])) kept.push(full[i], full[i + 1], full[i + 2]);
      tmpA.fromArray(P, a * 3); tmpB.fromArray(P, b * 3).sub(tmpA); tmpC.fromArray(P, c * 3).sub(tmpA);
      tmpB.cross(tmpC);
      for (const v of [a, b, c]) { nAcc[v * 3] += tmpB.x; nAcc[v * 3 + 1] += tmpB.y; nAcc[v * 3 + 2] += tmpB.z; }
    }
    geo.setIndex(kept);
    const nor = geo.getAttribute('normal') as BufferAttribute;
    for (let i = 0; i < mh.length; i++) {
      tmpA.fromArray(nAcc, mh[i] * 3).normalize();
      nor.setXYZ(i, tmpA.x, tmpA.y, tmpA.z);
    }
    nor.needsUpdate = true;
    geo.computeBoundingSphere();

    // proxies: barycentric refs + offsets scaled by the body's local proportions
    for (const p of this.proxies.values()) {
      const s = p.meta.scale.map(([a, b, d], k) => Math.abs(P[a * 3 + k] - P[b * 3 + k]) / d);
      const g = p.mesh.geometry;
      const pp = g.getAttribute('position') as BufferAttribute;
      const r = p.refs, w = p.refw, o = p.offs;
      for (let i = 0; i < pp.count; i++) {
        const a = r[i * 3] * 3, b = r[i * 3 + 1] * 3, c = r[i * 3 + 2] * 3;
        const wa = w[i * 3], wb = w[i * 3 + 1], wc = w[i * 3 + 2];
        pp.setXYZ(i,
          wa * P[a] + wb * P[b] + wc * P[c] + o[i * 3] * s[0],
          wa * P[a + 1] + wb * P[b + 1] + wc * P[c + 1] + o[i * 3 + 1] * s[1],
          wa * P[a + 2] + wb * P[b + 2] + wc * P[c + 2] + o[i * 3 + 2] * s[2]);
      }
      pp.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
    }

    // skeleton: heads/tails follow the reshaped joint helpers; +Y points down the bone
    const mean = (idx: number[], out: Vector3) => {
      out.set(0, 0, 0);
      for (const i of idx) { out.x += P[i * 3]; out.y += P[i * 3 + 1]; out.z += P[i * 3 + 2]; }
      return out.divideScalar(idx.length);
    };
    const world = man.bones.map((b) => {
      const h = mean(b.head, new Vector3()), t = mean(b.tail, new Vector3());
      const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), t.sub(h).normalize());
      return new Matrix4().compose(h, q, new Vector3(1, 1, 1));
    });
    const bones = this.skeleton.bones;
    man.bones.forEach((b, i) => {
      const local = b.parent < 0 ? world[i].clone() : world[b.parent].clone().invert().multiply(world[i]);
      local.decompose(bones[i].position, bones[i].quaternion, bones[i].scale);
    });
    this.group.updateMatrixWorld(true);
    this.body.bind(this.skeleton); // recomputes bone inverses for the new rest pose
    for (const p of this.proxies.values()) p.mesh.bind(this.skeleton, this.body.bindMatrix);
  }

  /** Head height and total height (world space at rest), for camera framing. */
  metrics() {
    const head = this.skeleton.bones.find((b) => /Head$/.test(b.name));
    const hp = head ? head.getWorldPosition(new Vector3()) : new Vector3(0, 1.5, 0);
    this.body.geometry.computeBoundingBox();
    const box = this.body.geometry.boundingBox!;
    return { headY: hp.y + 0.1, height: box.max.y };
  }

  dispose() {
    for (const k of [...this.proxies.keys()]) this.removeProxy(k);
    this.body.geometry.dispose();
    this.skinMat.dispose();
  }
}
