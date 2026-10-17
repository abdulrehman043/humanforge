// Procedural low-poly avatar builder. Every part is generated from three.js
// primitives at runtime, so the library ships zero mesh/texture assets.
// Parts are merged per material "role" -> ~15 draw calls per avatar.
import {
  BufferAttribute, BufferGeometry, CapsuleGeometry, Color, CylinderGeometry, DoubleSide, Euler, Group,
  IcosahedronGeometry, LatheGeometry, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry,
  TorusGeometry, Vector2, Vector3,
} from 'three';
import { AvatarConfig, normalizeConfig } from './config';

export type Role =
  | 'skin' | 'eyeWhite' | 'iris' | 'pupil' | 'lips' | 'mouthInner' | 'brows' | 'hair' | 'facialHair'
  | 'top' | 'bottom' | 'shoes' | 'sole' | 'headwear' | 'glasses';

export interface BuildOptions {
  /** Faceted "low-poly" look (default true). */
  flatShading?: boolean;
  /** Skip everything below the neck (cheaper, for profile bubbles). */
  headOnly?: boolean;
}

export interface AvatarMetrics {
  /** World-space Y of the head centre. */
  headY: number;
  /** Total height in metres (feet at y=0). */
  height: number;
  triangles: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const UP = new Vector3(0, 1, 0);
const FWD = new Vector3(0, 0, 1);
const HALF_PI = Math.PI / 2;

/** Collects primitives grouped by role, baking transforms so they can be merged. */
class Parts {
  private byRole = new Map<Role, BufferGeometry[]>();
  /** Optional parent transform applied after each part's own matrix (used for the head). */
  pre: Matrix4 | null = null;
  add(role: Role, geo: BufferGeometry, m?: Matrix4) {
    if (m) geo.applyMatrix4(m);
    if (this.pre) geo.applyMatrix4(this.pre);
    if (!this.byRole.has(role)) this.byRole.set(role, []);
    this.byRole.get(role)!.push(geo);
  }
  /** Capsule spanning two points. */
  segment(role: Role, a: Vector3, b: Vector3, r: number, radial = 10) {
    const dir = b.clone().sub(a);
    const len = Math.max(1e-4, dir.length());
    const m = new Matrix4().compose(
      a.clone().add(b).multiplyScalar(0.5),
      new Quaternion().setFromUnitVectors(UP, dir.normalize()),
      new Vector3(1, 1, 1),
    );
    this.add(role, new CapsuleGeometry(r, len, 3, radial), m);
  }
  entries() {
    return [...this.byRole.entries()].map(([role, geos]) => [role, mergeGeometries(geos)] as const);
  }
}

function mergeGeometries(geos: BufferGeometry[]): BufferGeometry {
  let vCount = 0, iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array as Float32Array, vo * 3);
    nor.set(g.attributes.normal.array as Float32Array, vo * 3);
    const n = g.attributes.position.count;
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < n; i++) idx[io++] = i + vo;
    vo += n;
    g.dispose();
  }
  // Degenerate pole triangles can leave zero normals; glTF requires unit vectors.
  for (let i = 0; i < nor.length; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]);
    if (l < 1e-6) { nor[i] = 0; nor[i + 1] = 1; nor[i + 2] = 0; }
    else if (Math.abs(l - 1) > 1e-4) { nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l; }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  out.setIndex(new BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

const mat = (pos: Vector3 | [number, number, number], rot?: Euler | Quaternion, scale?: [number, number, number]) =>
  new Matrix4().compose(
    Array.isArray(pos) ? new Vector3(...pos) : pos,
    rot instanceof Euler ? new Quaternion().setFromEuler(rot) : rot ?? new Quaternion(),
    new Vector3(...(scale ?? [1, 1, 1])),
  );

const mix = (a: string, b: string, t: number) => '#' + new Color(a).lerp(new Color(b), t).getHexString();

export function avatarColors(c: AvatarConfig): Record<Role, string> {
  return {
    skin: c.skin,
    eyeWhite: '#f4f1ec',
    iris: c.eyeColor,
    pupil: '#0b0b0b',
    lips: c.lipColor,
    mouthInner: '#4a1c1c',
    brows: mix(c.hairColor, '#000000', 0.25),
    hair: c.hairColor,
    facialHair: c.facialHair === 'stubble' ? mix(c.skin, c.hairColor, 0.35) : c.hairColor,
    top: c.topColor,
    bottom: c.bottomColor,
    shoes: c.shoesColor,
    sole: c.shoes === 'sandals' ? mix(c.shoesColor, '#000000', 0.2) : '#eeeeee',
    headwear: c.headwearColor,
    glasses: c.glassesColor,
  };
}

/** Builds the avatar geometry (no materials) grouped by role. Pure; works in Node/RN/web. */
export function buildAvatarGeometry(input: Partial<AvatarConfig>, opts: BuildOptions = {}) {
  const c = normalizeConfig(input);
  const P = new Parts();

  // ---------- proportions ----------
  const hs = 0.92 + 0.16 * c.height;       // height scale
  const w = 0.85 + 0.3 * c.build;           // width scale
  const chestF = 0.82 + 0.36 * c.chest;
  const hipF = 0.85 + 0.3 * c.hips;
  const footH = 0.05;
  const legLen = 0.78 * hs;
  const hipY = footH + legLen;
  const torsoLen = 0.5 * hs;
  const shoulderY = hipY + torsoLen;

  // head ellipsoid radii
  const rx = lerp(0.086, 0.112, c.headWidth);
  const ry = 0.122;
  const rz = 0.108;
  // Head is modelled at "real" size then scaled up for stylised proportions.
  const HS = 1.3;
  const headY = opts.headOnly ? 0 : shoulderY + 0.035 + ry * HS * 0.95;
  P.pre = mat([0, headY, 0.005], undefined, [HS, HS, HS]);
  const H = new Vector3(); // head-local origin (P.pre places it)
  const jawF = lerp(0.72, 1.0, c.jaw);
  const chinF = lerp(-0.12, 0.12, c.chin);

  /** Head-local deformation shared by skin, hair, beard and feature anchors. */
  const deform = (p: Vector3) => {
    const t = clamp01(-p.y / ry);
    p.x *= lerp(1, jawF, Math.pow(t, 1.4));
    p.z *= lerp(1, 0.9, t * t);
    if (p.y < 0) p.y *= 1 + chinF * t;
    return p;
  };
  /** Point on the face surface (head-local x,y), pushed `out` along the normal. */
  const surface = (x: number, y: number, out = 0) => {
    const ux = x / rx, uy = y / ry;
    const z = rz * Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
    const n = new Vector3(x / (rx * rx), y / (ry * ry), z / (rz * rz)).normalize();
    const p = deform(new Vector3(x, y, z));
    return { p: p.addScaledVector(n, out).add(H), n };
  };
  /** Place a primitive on the face, oriented along the surface normal. */
  const onFace = (role: Role, geo: BufferGeometry, x: number, y: number, out: number, local?: Euler, scale?: [number, number, number]) => {
    const { p, n } = surface(x, y, out);
    const q = new Quaternion().setFromUnitVectors(FWD, n);
    if (local) q.multiply(new Quaternion().setFromEuler(local));
    P.add(role, geo, mat(p, q, scale));
  };
  /** Ellipsoidal shell around the head (hair, beard, hats). */
  const shell = (
    role: Role, k: number, phiStart: number, phiLength: number, thetaStart: number, thetaLength: number,
    o: { segs?: [number, number]; flare?: number; lift?: number; scale?: [number, number, number] } = {},
  ) => {
    const [ws, hsg] = o.segs ?? [24, 12];
    const g = new SphereGeometry(1, ws, hsg, phiStart, phiLength, thetaStart, thetaLength);
    const a = g.attributes.position as BufferAttribute;
    const s = o.scale ?? [1, 1, 1];
    const v = new Vector3();
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i);
      v.set(v.x * rx * k * s[0], v.y * ry * k * s[1], v.z * rz * k * s[2]);
      deform(v);
      if (o.flare && v.y < 0) {
        const f = 1 + o.flare * (-v.y / ry);
        v.x *= f; v.z *= f;
      }
      v.y += o.lift ?? 0;
      a.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    P.add(role, g, mat(H));
  };
  /** Full cap from crown to theta `tf`, plus sides/back to `tb` leaving a face gap of +-gap rad. */
  const hood = (role: Role, k: number, tf: number, tb: number, gap: number, o: Parameters<typeof shell>[6] = {}) => {
    shell(role, k, 0, Math.PI * 2, 0, tf, o);
    shell(role, k, HALF_PI + gap, Math.PI * 2 - 2 * gap, tf - 0.01, tb - tf + 0.01, o);
  };

  // ---------- head ----------
  {
    const g = new SphereGeometry(1, 28, 20, -HALF_PI);
    const a = g.attributes.position as BufferAttribute;
    const v = new Vector3();
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i);
      v.set(v.x * rx, v.y * ry, v.z * rz);
      deform(v);
      a.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    P.add('skin', g, mat(H));
  }

  // ears
  const hijab = c.headwear === 'hijab';
  if (!hijab) {
    const er = lerp(0.018, 0.03, c.earSize);
    for (const sx of [-1, 1]) {
      const p = deform(new Vector3(sx * rx * 0.97, -0.008, -0.006)).add(H);
      P.add('skin', new SphereGeometry(er, 10, 8), mat(p, new Euler(0, sx * 0.35, 0), [0.38, 0.8, 0.55]));
    }
  }

  // eyes
  const re = lerp(0.013, 0.021, c.eyeSize);
  const ex = rx * lerp(0.3, 0.44, c.eyeSpacing);
  const ey = 0.008;
  for (const sx of [-1, 1]) {
    const x = sx * ex;
    onFace('eyeWhite', new SphereGeometry(re, 14, 10), x, ey, -re * 0.12, undefined, [1, 0.82, 0.55]);
    onFace('iris', new SphereGeometry(re * 0.62, 12, 8), x, ey, re * 0.3, undefined, [1, 1, 0.35]);
    onFace('pupil', new SphereGeometry(re * 0.3, 10, 6), x, ey, re * 0.45, undefined, [1, 1, 0.3]);
    // upper lid: a skin-coloured cap over the top of the eyeball softens the stare
    onFace('skin', new SphereGeometry(re * 1.1, 14, 5, 0, Math.PI * 2, 0, 1.2), x, ey, -re * 0.1,
      new Euler(-0.25, 0, 0), [1.04, 0.85, 0.66]);
  }

  // brows
  if (c.brows !== 'none') {
    const br = c.brows === 'thick' ? 0.0062 : 0.0036;
    const by = ey + re + 0.016;
    for (const sx of [-1, 1]) {
      if (c.brows === 'arched') {
        onFace('brows', new CapsuleGeometry(br, 0.016, 2, 6), sx * (ex - 0.008), by, 0.002, new Euler(0, 0, HALF_PI + sx * 0.35));
        onFace('brows', new CapsuleGeometry(br, 0.014, 2, 6), sx * (ex + 0.011), by - 0.001, 0.001, new Euler(0, 0, HALF_PI - sx * 0.5));
      } else {
        onFace('brows', new CapsuleGeometry(br, 0.026, 2, 6), sx * ex, by, 0.002, new Euler(0, 0, HALF_PI - sx * 0.08));
      }
    }
  }

  // nose
  {
    const s = lerp(0.8, 1.25, c.noseSize);
    if (c.nose === 'button') {
      onFace('skin', new SphereGeometry(0.015 * s, 10, 8), 0, -0.03, 0.004, undefined, [1, 0.85, 1]);
    } else if (c.nose === 'straight') {
      onFace('skin', new CapsuleGeometry(0.0085 * s, 0.03 * s, 3, 8), 0, -0.016, 0.004, new Euler(0.45, 0, 0));
      onFace('skin', new SphereGeometry(0.0125 * s, 10, 8), 0, -0.035, 0.008);
    } else {
      onFace('skin', new SphereGeometry(0.014 * s, 12, 8), 0, -0.031, 0.006, undefined, [1.35, 0.85, 0.95]);
      for (const sx of [-1, 1]) onFace('skin', new SphereGeometry(0.008 * s, 8, 6), sx * 0.014 * s, -0.036, -0.003);
    }
  }

  // facial hair (before mouth so the mouth can sit on top)
  let mouthOut = 0.0015;
  if (c.facialHair === 'stubble' || c.facialHair === 'beard') {
    const k = c.facialHair === 'beard' ? 1.06 : 1.012;
    shell('facialHair', k, HALF_PI - 1.5, 3.0, 1.9, Math.PI - 1.9, { segs: [22, 8] });
    mouthOut += rz * (k - 1) + 0.002;
  }
  if (c.facialHair === 'mustache' || c.facialHair === 'goatee' || c.facialHair === 'beard') {
    for (const sx of [-1, 1]) {
      onFace('facialHair', new CapsuleGeometry(0.0055, 0.016, 2, 6), sx * 0.011, -0.05, mouthOut + 0.002, new Euler(0, 0, HALF_PI + sx * 0.3));
    }
  }
  if (c.facialHair === 'goatee') {
    onFace('facialHair', new SphereGeometry(0.016, 10, 8), 0, -0.1, 0.0, undefined, [1, 1.3, 0.8]);
  }

  // mouth
  {
    const mw = lerp(0.016, 0.027, c.mouthWidth);
    const my = -0.066;
    if (c.mouth === 'smile') {
      onFace('lips', new TorusGeometry(mw, 0.0042, 6, 14, Math.PI), 0, my + mw * 0.35, mouthOut, new Euler(0, 0, Math.PI), [1, 0.42, 1]);
    } else if (c.mouth === 'neutral') {
      onFace('lips', new CapsuleGeometry(0.0045, mw * 1.6, 2, 8), 0, my, mouthOut, new Euler(0, 0, HALF_PI));
    } else {
      onFace('mouthInner', new SphereGeometry(mw * 0.85, 14, 8), 0, my - 0.003, mouthOut - 0.003, undefined, [1, 0.55, 0.3]);
      onFace('lips', new TorusGeometry(mw * 0.85, 0.004, 6, 18), 0, my - 0.003, mouthOut, undefined, [1, 0.55, 1]);
    }
  }

  // hair
  const cap = c.headwear === 'cap' || c.headwear === 'beanie' || c.headwear === 'kufi';
  if (!hijab) {
    switch (c.hair) {
      case 'buzz':
        hood('hair', 1.02, 0.98, 1.85, 1.05, { segs: [26, 14] });
        break;
      case 'short':
      case 'sidepart':
      case 'curly':
      case 'ponytail':
      case 'bun':
        hood('hair', 1.07, 0.9, 1.85, 1.12);
        break;
      case 'bob':
        hood('hair', 1.08, 0.82, 2.25, 0.92, { flare: 0.06 });
        break;
      case 'long':
        hood('hair', 1.08, 0.85, 2.05, 0.98);
        break;
      case 'afro':
        hood('hair', 1.42, 0.72, 2.0, 0.95, { segs: [14, 8], lift: 0.02 });
        break;
    }
    if (c.hair === 'sidepart' && !cap) {
      const { p } = surface(-0.03, 0.098, 0.012);
      P.add('hair', new SphereGeometry(0.045, 12, 8), mat(p, new Euler(-0.5, 0, 0.35), [1.5, 0.55, 0.85]));
    }
    if (c.hair === 'curly') {
      // Fibonacci-distributed curls over the scalp.
      const n = 160;
      for (let i = 0; i < n; i++) {
        const yU = 1 - (i / (n - 1)) * 1.4;
        const r = Math.sqrt(Math.max(0, 1 - yU * yU));
        const phi = i * 2.39996;
        const d = new Vector3(Math.cos(phi) * r, yU, Math.sin(phi) * r);
        const theta = Math.acos(d.y);
        const ph = Math.atan2(d.z, -d.x);
        const front = Math.abs(((ph - HALF_PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 1.12;
        if (theta > 1.85 || (front && theta > 0.9) || (cap && theta < 1.2)) continue;
        const p = deform(new Vector3(d.x * rx * 1.08, d.y * ry * 1.08, d.z * rz * 1.08)).add(H);
        P.add('hair', new IcosahedronGeometry(0.015, 0), mat(p, new Euler(i, i * 2, 0)));
      }
    }
    if (c.hair === 'long' && !opts.headOnly) {
      const g = new CylinderGeometry(rx * 1.08, rx * 1.3, 0.3, 16, 3, true, Math.PI - 1.6, 3.2);
      P.add('hair', g, mat([H.x, H.y - 0.13, H.z - 0.008], undefined, [1, 1, rz / rx]));
    }
    if (c.hair === 'ponytail') {
      P.add('hair', new SphereGeometry(0.03, 10, 8), mat([H.x, H.y + 0.03, H.z - rz * 1.08]));
      P.segment('hair', new Vector3(0, H.y + 0.01, H.z - rz * 1.2), new Vector3(0, H.y - 0.15, H.z - rz * 1.45), 0.026);
    }
    if (c.hair === 'bun') {
      P.add('hair', new SphereGeometry(0.048, 12, 10), mat([H.x, H.y + 0.095, H.z - 0.075]));
    }
  }

  // headwear
  if (c.headwear === 'cap') {
    shell('headwear', 1.13, 0, Math.PI * 2, 0, 1.25);
    const y = ry * 1.13 * Math.cos(1.25);
    const brim = new CylinderGeometry(0.075, 0.075, 0.007, 16, 1, false, -1.35, 2.7);
    P.add('headwear', brim, mat([H.x, H.y + y, H.z + rz * 0.95], new Euler(0.18, 0, 0), [1.15, 1, 1.05]));
  } else if (c.headwear === 'beanie') {
    shell('headwear', 1.12, 0, Math.PI * 2, 0, 1.2, { segs: [20, 10] });
    const t = 1.17;
    const band = new TorusGeometry(1, 0.075, 6, 24);
    P.add('headwear', band, mat([H.x, H.y + ry * 1.12 * Math.cos(t), H.z], new Euler(HALF_PI, 0, 0),
      [rx * 1.14 * Math.sin(t), rz * 1.14 * Math.sin(t), 0.1]));
    P.add('headwear', new IcosahedronGeometry(0.026, 1), mat([H.x, H.y + ry * 1.12 + 0.012, H.z]));
  } else if (c.headwear === 'kufi') {
    shell('headwear', 1.085, 0, Math.PI * 2, 0, 0.98, { segs: [20, 8] });
  } else if (hijab) {
    shell('headwear', 1.11, 0, Math.PI * 2, 0, 0.92);
    shell('headwear', 1.11, HALF_PI + 0.82, Math.PI * 2 - 1.64, 0.91, 2.42 - 0.91);
    shell('headwear', 1.11, 0, Math.PI * 2, 2.4, Math.PI - 2.4, { segs: [24, 4] });
  }

  // glasses
  if (c.glasses !== 'none') {
    const out = re * 0.75 + 0.007;
    const lr = re * 1.6;
    for (const sx of [-1, 1]) {
      const x = sx * ex;
      if (c.glasses === 'round') onFace('glasses', new TorusGeometry(lr, 0.0024, 5, 20), x, ey, out);
      else onFace('glasses', new TorusGeometry(lr * 1.15, 0.0024, 4, 4), x, ey, out, new Euler(0, 0, Math.PI / 4), [1.2, 0.85, 1]);
      const edge = surface(sx * (ex + lr * 1.05), ey, out).p;
      const ear = deform(new Vector3(sx * rx * 1.02, ey, -0.01)).add(H);
      P.segment('glasses', edge, ear, 0.0022, 5);
    }
    P.segment('glasses', surface(-(ex - lr), ey + 0.004, out).p, surface(ex - lr, ey + 0.004, out).p, 0.0022, 5);
  }

  P.pre = null;
  if (opts.headOnly) {
    P.segment('skin', new Vector3(0, -0.24, -0.01), new Vector3(0, -ry * HS * 0.55, -0.01), 0.05);
    return finish(P, c, { headY, height: headY + ry * HS * 1.2 });
  }

  // ---------- body ----------
  const isDress = c.top === 'dress';
  const longTop = c.top === 'kurta' || isDress;
  const sleeveFull = c.top !== 'tank' && c.top !== 'tshirt';
  const hipR = 0.15 * w * hipF;
  const waistR = 0.122 * w * lerp(0.92, 1.12, c.build);
  const chestR = 0.152 * w * chestF;
  const shoulderR = 0.168 * w;
  const neckR = 0.048;

  // torso profile r(y) relative to hipY
  const prof: [number, number][] = [
    [-0.07, 0.0001], [-0.06, hipR * 0.8], [0.0, hipR], [0.16 * hs, waistR],
    [0.31 * hs, chestR], [0.43 * hs, shoulderR], [torsoLen - 0.005, neckR * 1.7], [torsoLen, 0.0001],
  ];
  const r = (y: number) => {
    for (let i = 1; i < prof.length; i++) {
      if (y <= prof[i][0]) {
        const [y0, r0] = prof[i - 1], [y1, r1] = prof[i];
        return lerp(r0, r1, (y - y0) / (y1 - y0));
      }
    }
    return prof[prof.length - 1][1];
  };
  const band = (role: Role, y0: number, y1: number, fn: (y: number) => number, depth = 0.62, steps = 8) => {
    const pts: Vector2[] = [];
    for (let i = 0; i <= steps; i++) {
      const y = lerp(y0, y1, i / steps);
      pts.push(new Vector2(Math.max(1e-4, fn(y)), y));
    }
    P.add(role, new LatheGeometry(pts, 20), mat([0, hipY, 0], undefined, [1, 1, depth]));
  };
  const cut = 0.1 * hs;
  band(longTop ? 'top' : 'bottom', -0.07, cut, r, 0.62, 5);
  band('top', cut, torsoLen, r, 0.62, 10);

  // neck
  P.segment('skin', new Vector3(0, shoulderY - 0.04, -0.005), new Vector3(0, headY - ry * HS * 0.55, -0.01), neckR, 12);

  // legs
  const legX = 0.085 * w * Math.sqrt(hipF);
  const kneeY = footH + legLen * 0.5;
  const thighR = 0.064 * w * Math.sqrt(hipF), shinR = 0.05 * w;
  const pants = c.bottom === 'pants' && !isDress;
  for (const sx of [-1, 1]) {
    const hip = new Vector3(sx * legX, hipY - 0.02, 0);
    const knee = new Vector3(sx * legX * 0.92, kneeY, 0.005);
    const ankle = new Vector3(sx * legX * 0.88, footH + 0.03, -0.005);
    P.segment(pants ? 'bottom' : 'skin', hip, knee, thighR);
    P.segment(pants ? 'bottom' : 'skin', knee, ankle, shinR);
    if (c.bottom === 'shorts' && !isDress) {
      P.segment('bottom', hip, hip.clone().lerp(knee, 0.75), thighR + 0.008);
    }
    // feet
    const fx = sx * legX * 0.88;
    if (c.shoes === 'sandals') {
      P.add('skin', new SphereGeometry(0.045, 10, 8), mat([fx, 0.03, 0.035], undefined, [0.8, 0.5, 1.6]));
      P.add('sole', new CylinderGeometry(0.045, 0.045, 0.012, 12), mat([fx, 0.006, 0.035], undefined, [0.85, 1, 1.7]));
      P.segment('shoes', new Vector3(fx - 0.03, 0.035, 0.05), new Vector3(fx + 0.03, 0.035, 0.05), 0.005, 5);
    } else {
      P.add('shoes', new SphereGeometry(0.05, 12, 8), mat([fx, 0.035, 0.03], undefined, [0.85, 0.6, 1.6]));
      P.add('sole', new CylinderGeometry(0.05, 0.05, 0.014, 12), mat([fx, 0.007, 0.03], undefined, [0.85, 1, 1.65]));
      if (c.shoes === 'boots') P.segment('shoes', new Vector3(fx, 0.04, 0), new Vector3(fx, 0.17, 0), shinR * 1.18);
    }
  }

  // skirts / tunics
  const skirtTo = (yWorld: number, role: Role, r0: number, flare: number) =>
    band(role, cut * 0.4, yWorld - hipY, (y) => lerp(r0, r0 * flare, (cut * 0.4 - y) / (cut * 0.4 - (yWorld - hipY))), 0.8, 6);
  if (isDress) skirtTo(footH + 0.12, 'top', hipR * 1.04, 1.45);
  else if (c.top === 'kurta') skirtTo(kneeY - 0.02, 'top', hipR * 1.05, 1.25);
  if (!isDress && c.bottom === 'skirt' && c.top !== 'kurta') skirtTo(kneeY - 0.03, 'bottom', hipR * 1.04, 1.35);
  if (!isDress && c.bottom === 'longskirt') skirtTo(footH + 0.1, 'bottom', hipR * 1.04, 1.4);

  // arms
  for (const sx of [-1, 1]) {
    const S = new Vector3(sx * shoulderR * 0.9, shoulderY - 0.065, -0.005);
    const E = S.clone().add(new Vector3(sx * 0.045, -0.27 * hs, -0.015));
    const W = E.clone().add(new Vector3(sx * 0.02, -0.23 * hs, 0.03));
    const ur = 0.041 * w, fr = 0.034 * w;
    const sleeveRole: Role = c.top === 'tank' ? 'skin' : 'top';
    P.add(sleeveRole, new SphereGeometry(ur * 1.04, 10, 8), mat(S));
    P.segment(sleeveFull ? 'top' : 'skin', S, E, ur);
    P.segment(sleeveFull ? 'top' : 'skin', E, W, fr);
    if (c.top === 'tshirt') P.segment('top', S, S.clone().lerp(E, 0.5), ur + 0.007);
    P.add('skin', new SphereGeometry(0.036, 10, 8), mat(W.clone().add(new Vector3(sx * 0.004, -0.045, 0.004)), undefined, [0.65, 1.15, 0.95]));
  }

  // garment details
  if (c.top === 'hoodie') {
    P.add('top', new TorusGeometry(0.07, 0.026, 8, 18), mat([0, shoulderY + 0.005, -0.04], new Euler(HALF_PI - 0.35, 0, 0), [1, 0.8, 1]));
  }
  if (longTop) {
    P.add('top', new CylinderGeometry(neckR * 1.15, neckR * 1.3, 0.03, 14, 1, true), mat([0, shoulderY - 0.005, -0.005]));
  }
  if (hijab) {
    band('headwear', torsoLen - 0.2, torsoLen + 0.08, (y) => {
      const t = clamp01((torsoLen + 0.08 - y) / 0.2);
      return lerp(0.085, shoulderR * 1.4, t * t * (3 - 2 * t));
    }, 0.62, 10);
  }

  const totalH = headY + ry * HS * 1.15 + (c.hair === 'afro' && !hijab ? 0.08 : 0);
  return finish(P, c, { headY, height: totalH });
}

function finish(P: Parts, c: AvatarConfig, m: { headY: number; height: number }) {
  const colors = avatarColors(c);
  const parts = P.entries().map(([role, geometry]) => ({ role, geometry, color: colors[role] }));
  const triangles = parts.reduce((s, p) => s + (p.geometry.index!.count / 3), 0);
  return { config: c, parts, metrics: { ...m, triangles } as AvatarMetrics };
}

export type AvatarGeometry = ReturnType<typeof buildAvatarGeometry>;

/** Build a ready-to-render THREE.Group. Call `disposeAvatar` when done. */
export function buildAvatar(config: Partial<AvatarConfig>, opts: BuildOptions = {}): Group {
  const built = buildAvatarGeometry(config, opts);
  const group = new Group();
  group.name = 'avatar';
  for (const { role, geometry, color } of built.parts) {
    const material = new MeshStandardMaterial({
      color,
      roughness: role === 'glasses' || role === 'pupil' || role === 'iris' ? 0.35 : 0.85,
      metalness: 0,
      flatShading: opts.flatShading ?? true,
      side: DoubleSide,
    });
    material.name = role;
    const mesh = new Mesh(geometry, material);
    mesh.name = role;
    group.add(mesh);
  }
  group.userData = { metrics: built.metrics, config: built.config };
  return group;
}

export function disposeAvatar(group: Group) {
  group.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as MeshStandardMaterial).dispose();
    }
  });
}
