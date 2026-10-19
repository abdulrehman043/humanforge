// Head, face features and hair for the cartoon avatar. Every function takes a yaw (radians;
// 0 = front, >0 = turned to the viewer's right) and returns SVG for one or more sub-layers:
//   tint   -> white shapes, recolored at runtime (Image tintColor) by a color slot
//   detail -> shading / lines in final colors (black/white with alpha), never recolored
import { HEAD, Pt, clamp, ellipsePts, f, headOutline, headPoint, lerp, smooth, smoothPath } from './geom';

export type ColorSlot = 'skin' | 'hair' | 'brow' | 'eye' | 'lip' | 'top' | 'bottom' | 'outfit' | 'shoes' | 'headwear' | 'facialHair';
export interface SubLayer { kind: 'tint' | 'detail'; slot?: ColorSlot; svg: string }

// one counter for every module instance (tsx can load this file as both ESM and CJS)
const g = globalThis as { __cartoonUid?: number };
export const id = (p: string) => `${p}${(g.__cartoonUid = (g.__cartoonUid ?? 0) + 1)}`;
const WHITE = '#fff';

/** Clip-path + soft shading helpers shared by parts. */
export function shade(shapeD: string, yaw: number, opts: { dark?: number; light?: number; spread?: number } = {}) {
  const c = id('c'), g = id('g'), h = id('h');
  const dark = opts.dark ?? 0.22, light = opts.light ?? 0.16;
  // light comes from the front-left; the far side and the bottom fall into soft shadow
  const sx = clamp(0.5 - Math.sin(yaw) * 0.5);
  return `<defs><clipPath id="${c}"><path d="${shapeD}"/></clipPath>
<linearGradient id="${g}" x1="${f(sx)}" y1="0" x2="${f(1 - sx * 0.2)}" y2="1"><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${dark}"/></linearGradient>
<radialGradient id="${h}" cx="0.36" cy="0.3" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="${light}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<g clip-path="url(#${c})"><path d="${shapeD}" fill="url(#${g})"/><path d="${shapeD}" fill="url(#${h})"/></g>`;
}

// ---------------------------------------------------------------- head & ears
export function head(yaw: number): SubLayer[] {
  const d = smoothPath(headOutline(yaw));
  const c = id('c');
  // cheek blush on the visible cheeks
  const blush = [-0.62, 0.62].map((u) => headPoint(u, -0.32, yaw)).filter((p) => p.facing > 0.15)
    .map((p) => `<ellipse cx="${f(p.x)}" cy="${f(p.y)}" rx="${f(17 * clamp(p.facing + 0.2))}" ry="11" fill="#ff6a6a" fill-opacity="0.16"/>`).join('');
  return [
    { kind: 'tint', slot: 'skin', svg: `<path d="${d}" fill="${WHITE}"/>` },
    { kind: 'detail', svg: shade(d, yaw, { dark: 0.2 }) + `<defs><clipPath id="${c}"><path d="${d}"/></clipPath></defs><g clip-path="url(#${c})" filter="url(#blur6)">${blush}</g>` },
  ];
}

/** Ears: behind the head outline in the front view, on top of it when the head turns. */
export function ears(yaw: number, scale = 1): { back: SubLayer[]; front: SubLayer[] } {
  const back: string[] = [], front: string[] = [];
  for (const side of [-1, 1]) {
    const p = headPoint(side * Math.PI / 2, -0.06, yaw, 0.97);
    if (p.z < -20) continue; // far ear hidden behind the head
    const w = 15 * scale * clamp(Math.abs(Math.sin(side * Math.PI / 2 + yaw)) * 0.6 + 0.45, 0.45, 1);
    const ex = p.x + (yaw === 0 ? side * 4 : 0);
    const d = smoothPath(ellipsePts(ex, p.y, w, 23 * scale, 20));
    const inner = `<path d="${smoothPath(ellipsePts(ex + side * 1.5 * (yaw === 0 ? 1 : 0), p.y + 2, w * 0.55, 14 * scale, 16))}" fill="#000" fill-opacity="0.13"/>`;
    (yaw === 0 ? back : front).push(`<path d="${d}" fill="${WHITE}"/>|${inner}`);
  }
  const split = (arr: string[]): SubLayer[] => arr.length ? [
    { kind: 'tint', slot: 'skin', svg: arr.map((s) => s.split('|')[0]).join('') },
    { kind: 'detail', svg: arr.map((s) => s.split('|')[1]).join('') },
  ] : [];
  return { back: split(back), front: split(front) };
}

// ---------------------------------------------------------------- eyes
export const EYE_STYLES = ['round', 'almond', 'lashes', 'soft', 'narrow'] as const;
export function eyes(yaw: number, style: string): SubLayer[] {
  const whites: string[] = [], iris: string[] = [], over: string[] = [];
  const cfg = {
    round: { rx: 15, ry: 18, lid: 3.4, lash: 0, tilt: 0 },
    almond: { rx: 17, ry: 14, lid: 3.6, lash: 0, tilt: 0.12 },
    lashes: { rx: 16, ry: 17, lid: 4.2, lash: 3, tilt: 0.06 },
    soft: { rx: 15, ry: 15, lid: 3, lash: 1, tilt: -0.05 },
    narrow: { rx: 16, ry: 11, lid: 3.8, lash: 0, tilt: 0.04 },
  }[style] ?? { rx: 15, ry: 18, lid: 3.4, lash: 0, tilt: 0 };
  for (const side of [-1, 1]) {
    const p = headPoint(side * 0.42, -0.1, yaw);
    if (p.facing < 0.12) continue;
    const fx = clamp(p.facing * 1.05, 0.25, 1);
    const rx = cfg.rx * fx, ry = cfg.ry;
    const tilt = cfg.tilt * side;
    const shape = ellipsePts(p.x, p.y, rx, ry, 28, tilt).map(([x, y]): Pt => [x, y > p.y ? p.y + (y - p.y) * 0.92 : y]);
    const d = smoothPath(shape);
    const c = id('c');
    whites.push(`<path d="${d}" fill="#fbfbfb"/><path d="${d}" fill="none" stroke="#000" stroke-opacity="0.12" stroke-width="1.2"/>`);
    const look = Math.sin(yaw) * rx * 0.35;
    const ir = Math.min(cfg.ry, cfg.rx) * 0.74;
    iris.push(`<defs><clipPath id="${c}"><path d="${d}"/></clipPath></defs><g clip-path="url(#${c})"><ellipse cx="${f(p.x + look)}" cy="${f(p.y + 1)}" rx="${f(ir * fx)}" ry="${f(ir)}" fill="${WHITE}"/></g>`);
    const c2 = id('c');
    // pupil, iris ring, catch lights, upper lid line (+ lashes)
    const top = shape.filter(([, y]) => y <= p.y + 1).sort((a, b) => a[0] - b[0]);
    const lidPts: Pt[] = [[top[0][0] - side * 0, top[0][1]], ...top, [top[top.length - 1][0], top[top.length - 1][1]]];
    const outer: Pt = side < 0 ? lidPts[0] : lidPts[lidPts.length - 1];
    const lashes = Array.from({ length: cfg.lash }, (_, i) => {
      const t = 0.62 + i * 0.13;
      const q = lidPts[Math.round((side < 0 ? 1 - t : t) * (lidPts.length - 1))];
      return `<path d="M${f(q[0])} ${f(q[1])} q${f(side * 4)} ${-6} ${f(side * 8)} ${-7}" stroke="#1d1414" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
    }).join('');
    over.push(`<defs><clipPath id="${c2}"><path d="${d}"/></clipPath></defs><g clip-path="url(#${c2})">
<ellipse cx="${f(p.x + look)}" cy="${f(p.y + 1)}" rx="${f(ir * fx)}" ry="${f(ir)}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="2"/>
<ellipse cx="${f(p.x + look)}" cy="${f(p.y + 1)}" rx="${f(ir * fx)}" ry="${f(ir)}" fill="url(#irisShade)"/>
<ellipse cx="${f(p.x + look)}" cy="${f(p.y + 1.5)}" rx="${f(ir * 0.46 * fx)}" ry="${f(ir * 0.46)}" fill="#120c0c"/>
<rect x="${f(p.x - rx - 2)}" y="${f(p.y - ry - 2)}" width="${f(rx * 2 + 4)}" height="${f(ry * 0.55)}" fill="#000" fill-opacity="0.1"/></g>
<circle cx="${f(p.x + look - ir * 0.32 * fx)}" cy="${f(p.y - ir * 0.32)}" r="${f(ir * 0.24)}" fill="#fff"/>
<circle cx="${f(p.x + look + ir * 0.3 * fx)}" cy="${f(p.y + ir * 0.3)}" r="${f(ir * 0.11)}" fill="#fff" fill-opacity="0.85"/>
<path d="${smoothPath(lidPts, false)}" fill="none" stroke="#1d1414" stroke-width="${cfg.lid}" stroke-linecap="round"/>
<path d="M${f(outer[0])} ${f(outer[1])} l${f(side * 3.5)} ${f(-2.5)}" stroke="#1d1414" stroke-width="${f(cfg.lid * 0.9)}" stroke-linecap="round"/>${lashes}`);
  }
  return [
    { kind: 'detail', svg: whites.join('') },
    { kind: 'tint', slot: 'eye', svg: iris.join('') },
    { kind: 'detail', svg: over.join('') },
  ];
}

// ---------------------------------------------------------------- brows
export const BROW_STYLES = ['soft', 'straight', 'arched', 'thick', 'thin'] as const;
export function brows(yaw: number, style: string): SubLayer[] {
  const cfg = { soft: { w: 5.5, arch: 4, len: 30 }, straight: { w: 6, arch: 1, len: 32 }, arched: { w: 5, arch: 8, len: 32 },
    thick: { w: 8.5, arch: 3, len: 33 }, thin: { w: 3.4, arch: 5, len: 30 } }[style] ?? { w: 5.5, arch: 4, len: 30 };
  const out: string[] = [];
  for (const side of [-1, 1]) {
    const pts: Pt[] = [];
    let vis = true;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const u = side * lerp(0.2, 0.68, t);
      const v = 0.14 + Math.sin(t * Math.PI) * cfg.arch * 0.006 - t * 0.03;
      const p = headPoint(u, v, yaw, 1.005);
      if (p.facing < 0.05) { vis = false; }
      pts.push([p.x, p.y]);
    }
    if (!vis && pts.length < 3) continue;
    const visible = pts.filter((_, i) => headPoint(side * lerp(0.2, 0.68, i / 8), 0.14, yaw).facing > 0.05);
    if (visible.length < 3) continue;
    // tapered stroke: thick at the inner end, thin at the tail
    const top: Pt[] = [], bot: Pt[] = [];
    visible.forEach((p, i) => {
      const t = i / (visible.length - 1);
      const w = cfg.w * lerp(1, 0.45, t) * (1 - 0.15 * Math.abs(Math.sin(yaw)));
      top.push([p[0], p[1] - w / 2]); bot.push([p[0], p[1] + w / 2]);
    });
    out.push(`<path d="${smoothPath([...top, ...bot.reverse()])}" fill="${WHITE}"/>`);
  }
  return [{ kind: 'tint', slot: 'brow', svg: out.join('') }];
}

// ---------------------------------------------------------------- nose
export const NOSE_STYLES = ['button', 'soft', 'pointed', 'wide'] as const;
export function nose(yaw: number, style: string): SubLayer[] {
  const cfg = { button: { size: 1, tip: 7 }, soft: { size: 1.1, tip: 9 }, pointed: { size: 1.05, tip: 14 }, wide: { size: 1.3, tip: 8 } }[style] ?? { size: 1, tip: 8 };
  const p = headPoint(0, -0.34, yaw);
  const s = Math.sin(yaw);
  const tint: string[] = [], det: string[] = [];
  if (Math.abs(s) > 0.3) {
    // the nose tip sticks out past the cheek as the head turns
    const out = cfg.tip * s;
    const tipX = p.x + out, baseX = p.x - 4 * Math.sign(s);
    const d = smoothPath([[baseX, p.y - 22], [tipX * 0.55 + baseX * 0.45, p.y - 8], [tipX, p.y + 2], [tipX - 3 * Math.sign(s), p.y + 9], [baseX, p.y + 9]]);
    tint.push(`<path d="${d}" fill="${WHITE}"/>`);
    det.push(`<path d="M${f(tipX - 9 * Math.sign(s))} ${f(p.y + 8)} q${f(3 * Math.sign(s))} 2 ${f(6 * Math.sign(s))} 0" stroke="#000" stroke-opacity="0.28" stroke-width="2" fill="none" stroke-linecap="round"/>`);
  } else {
    const w = 9 * cfg.size;
    det.push(`<path d="M${f(p.x - w)} ${f(p.y + 4)} q${f(w)} 7 ${f(w * 2)} 0" stroke="#000" stroke-opacity="0.22" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<ellipse cx="${f(p.x + 2 * s)}" cy="${f(p.y - 4)}" rx="${f(5 * cfg.size)}" ry="7" fill="#fff" fill-opacity="0.22"/>`);
  }
  return [...(tint.length ? [{ kind: 'tint' as const, slot: 'skin' as const, svg: tint.join('') }] : []), { kind: 'detail', svg: det.join('') }];
}

// ---------------------------------------------------------------- mouth
export const MOUTH_STYLES = ['smile', 'grin', 'neutral', 'open', 'smirk'] as const;
export function mouth(yaw: number, style: string): SubLayer[] {
  const p = headPoint(0, -0.56, yaw);
  const s = Math.sin(yaw);
  const fx = clamp(Math.cos(yaw) * 0.9 + 0.25, 0.3, 1);
  const half = 15 * fx;
  const cx = p.x + s * 3;
  const lip: string[] = [], det: string[] = [];
  const L: Pt = [cx - half, p.y], R: Pt = [cx + half, p.y];
  switch (style) {
    case 'grin':
    case 'open': {
      const open = style === 'grin' ? 9 : 13;
      const d = smoothPath([L, [cx - half * 0.5, p.y - 2], [cx, p.y - 1], [cx + half * 0.5, p.y - 2], R, [cx + half * 0.55, p.y + open * 0.8], [cx, p.y + open], [cx - half * 0.55, p.y + open * 0.8]]);
      det.push(`<path d="${d}" fill="#5a1f22"/>`);
      if (style === 'grin') det.push(`<path d="M${f(cx - half * 0.8)} ${f(p.y + 0.5)} Q${f(cx)} ${f(p.y + 5)} ${f(cx + half * 0.8)} ${f(p.y + 0.5)} L${f(cx + half * 0.7)} ${f(p.y - 0.5)} L${f(cx - half * 0.7)} ${f(p.y - 0.5)}Z" fill="#fff"/>`);
      else det.push(`<ellipse cx="${f(cx)}" cy="${f(p.y + open * 0.7)}" rx="${f(half * 0.45)}" ry="${f(open * 0.25)}" fill="#e2666e"/>`);
      lip.push(`<path d="M${f(cx - half * 0.6)} ${f(p.y + open + 1)} Q${f(cx)} ${f(p.y + open + 5)} ${f(cx + half * 0.6)} ${f(p.y + open + 1)} Q${f(cx)} ${f(p.y + open + 2)} ${f(cx - half * 0.6)} ${f(p.y + open + 1)}Z" fill="${WHITE}"/>`);
      break;
    }
    default: {
      const curve = style === 'neutral' ? 1 : style === 'smirk' ? 4 : 6;
      const tiltR = style === 'smirk' ? -4 : 0;
      // lips (tinted) + mouth line
      const upper = smoothPath([[L[0], L[1]], [cx - half * 0.45, p.y - 4], [cx, p.y - 2.5], [cx + half * 0.45, p.y - 4], [R[0], R[1] + tiltR], [cx, p.y + curve * 0.4]]);
      const lower = smoothPath([[L[0] + 3, L[1] + 1], [cx, p.y + curve * 0.5 + 8], [R[0] - 3, R[1] + 1 + tiltR], [cx, p.y + curve * 0.5 + 1]]);
      lip.push(`<path d="${upper}" fill="${WHITE}" fill-opacity="0.85"/><path d="${lower}" fill="${WHITE}"/>`);
      det.push(`<path d="M${f(L[0])} ${f(L[1] - 0.5)} Q${f(cx)} ${f(p.y + curve * 0.9)} ${f(R[0])} ${f(R[1] - 0.5 + tiltR)}" stroke="#5a1f22" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<ellipse cx="${f(cx)}" cy="${f(p.y + curve * 0.5 + 4.5)}" rx="${f(half * 0.35)}" ry="1.8" fill="#fff" fill-opacity="0.35"/>`);
    }
  }
  return [{ kind: 'tint', slot: 'lip', svg: lip.join('') }, { kind: 'detail', svg: det.join('') }];
}

// ---------------------------------------------------------------- hair
export interface HairStyle {
  id: string;
  fit: 'female' | 'male' | 'unisex';
  /** latitude of the front hairline at longitude u (|u| <= pi/2) */
  hairline: (u: number) => number;
  /** cap scale over the head */
  volume: number;
  /** extra height on top (puffy styles) */
  lift?: number;
  /** canvas y where the hair hanging behind ends (undefined = short) */
  length?: number;
  /** half-width of the hanging hair at its end */
  width?: number;
  /** side locks framing the face down to this y */
  locks?: number;
  /** bumpy outline (curls) amplitude */
  curls?: number;
  bun?: boolean;
  ponytail?: boolean;
  /** u of the parting line, if any */
  part?: number;
}

const fringe = (depth: number, n: number, base: number) => (u: number) => base - depth * Math.abs(Math.sin(u * n));
export const HAIR_STYLES: HairStyle[] = [
  { id: 'long_straight', fit: 'female', volume: 1.08, hairline: (u) => 0.42 - 0.12 * Math.cos(u * 1.6) + 0.18 * smooth(0.0, 0.25, Math.abs(u + 0.1)) * 0, length: 470, width: 112, locks: 380, part: -0.1 },
  { id: 'long_wavy', fit: 'female', volume: 1.1, lift: 4, hairline: (u) => 0.4 - 0.1 * Math.cos(u * 1.5), length: 455, width: 122, locks: 370, curls: 3, part: 0.15 },
  { id: 'bangs_long', fit: 'female', volume: 1.08, hairline: fringe(0.05, 7, 0.24), length: 460, width: 108, locks: 360 },
  { id: 'bob', fit: 'female', volume: 1.1, hairline: (u) => 0.36 - 0.1 * Math.cos(u * 1.5), length: 262, width: 116, locks: 262, part: -0.25 },
  { id: 'bob_bangs', fit: 'female', volume: 1.1, hairline: fringe(0.04, 8, 0.22), length: 258, width: 114, locks: 258 },
  { id: 'ponytail', fit: 'female', volume: 1.06, hairline: (u) => 0.46 - 0.08 * Math.cos(u * 1.4), ponytail: true },
  { id: 'bun', fit: 'female', volume: 1.06, hairline: (u) => 0.48 - 0.08 * Math.cos(u * 1.4), bun: true },
  { id: 'curly_long', fit: 'female', volume: 1.18, lift: 8, hairline: (u) => 0.36 - 0.08 * Math.cos(u * 1.4), length: 430, width: 132, locks: 340, curls: 7 },
  { id: 'short_crop', fit: 'male', volume: 1.05, lift: 2, hairline: (u) => 0.5 - 0.08 * Math.cos(u * 2) },
  { id: 'side_part', fit: 'male', volume: 1.07, lift: 6, hairline: (u) => 0.48 - 0.07 * Math.cos(u * 2) + (u < -0.2 ? 0.04 : 0), part: -0.35 },
  { id: 'quiff', fit: 'male', volume: 1.07, lift: 16, hairline: (u) => 0.5 - 0.06 * Math.cos(u * 2) },
  { id: 'buzz', fit: 'male', volume: 1.02, hairline: (u) => 0.52 - 0.06 * Math.cos(u * 2) },
  { id: 'curly_short', fit: 'unisex', volume: 1.12, lift: 8, hairline: (u) => 0.45 - 0.06 * Math.cos(u * 2), curls: 6 },
  { id: 'afro', fit: 'unisex', volume: 1.34, lift: 26, hairline: (u) => 0.4 - 0.06 * Math.cos(u * 2), curls: 9 },
];

/** Point on the cap silhouette at outline angle t (0 = top, +pi/2 = right, -pi/2 = left). */
function capAt(st: HairStyle, yaw: number, t: number, extra = 0): Pt {
  const { cx, cy, a, b, c } = HEAD;
  const s = st.volume + extra;
  const A = Math.sqrt((a * Math.cos(yaw)) ** 2 + (c * Math.sin(yaw)) ** 2) * s;
  let x = cx + Math.sin(t) * A, y = cy - Math.cos(t) * b * s;
  const up = clamp(Math.cos(t));
  y -= (st.lift ?? 0) * up * up;
  if (st.curls) {
    const r = st.curls * (0.5 + 0.5 * Math.sin(t * 22));
    const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy) || 1;
    x += (dx / len) * r; y += (dy / len) * r;
  }
  return [x, y];
}
function capArc(st: HairStyle, yaw: number, from: number, to: number, extra = 0, n = 48): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => capAt(st, yaw, lerp(from, to, i / n), extra));
}
/** Full cap outline: upper arc plus a rounded bottom at the nape (never reaches the chin). */
function capOutline(st: HairStyle, yaw: number, extra = 0): Pt[] {
  const { cx, cy } = HEAD;
  const s = Math.sin(yaw);
  // the back of the head (left when turned right) is covered down to the nape; the face side stops at the temple
  const arc = capArc(st, yaw, -Math.PI / 2 - 0.1 - 0.7 * s, Math.PI / 2 + 0.1 - 0.45 * s, extra);
  // close behind the head: the nape sits behind the neck, shifted away from the face
  return [...arc, [cx - s * 40 + 30, cy + 78], [cx - s * 40 - 30, cy + 78]];
}

/** Hanging hair behind the head and shoulders (long styles) or the back of a short cut. */
function backShape(st: HairStyle, yaw: number): string {
  if (!st.length) return smoothPath(capOutline(st, yaw, 0.02));
  const { cx, cy } = HEAD;
  const s = Math.sin(yaw);
  const shift = -s * 34; // hair falls behind the head, away from the face
  const w = st.width ?? 110, len = st.length;
  const wave = st.curls ? st.curls * 1.4 : 0;
  const arc = capArc(st, yaw, -Math.PI / 2 - 0.2, Math.PI / 2 + 0.2, 0.02);
  const ws = w * (Math.abs(Math.cos(yaw)) * 0.72 + 0.34);
  const bottom: Pt[] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    bottom.push([cx + shift + lerp(ws, -ws, t), len + (wave ? Math.sin(t * Math.PI * 6) * wave : (i % 2 ? 7 : 0)) - 10 * Math.sin(t * Math.PI)]);
  }
  const r = arc[arc.length - 1], l = arc[0];
  const pts: Pt[] = [
    ...arc,
    [lerp(r[0], cx + shift + ws, 0.5) + 4, lerp(r[1], len, 0.35)],
    ...bottom,
    [lerp(l[0], cx + shift - ws, 0.5) - 4, lerp(l[1], len, 0.35)],
  ];
  return smoothPath(pts);
}

export function hairBack(yaw: number, st: HairStyle): SubLayer[] {
  const parts: string[] = [];
  const shapes: string[] = [];
  const main = backShape(st, yaw);
  shapes.push(main);
  const s = Math.sin(yaw);
  if (st.ponytail) {
    const root = headPoint(Math.PI, 0.25, yaw, 1.05);
    const x = root.x - s * 18, y = root.y;
    const pt = smoothPath([[x - 14, y - 10], [x + 14, y - 10], [x + 22 - s * 10, y + 60], [x + 8 - s * 20, y + 150], [x - 6 - s * 20, y + 155], [x - 20 - s * 10, y + 60]]);
    shapes.push(pt);
  }
  if (st.bun) {
    const p = headPoint(Math.PI * 0.85, 0.75, yaw, 1.1);
    shapes.push(smoothPath(ellipsePts(p.x - s * 6, p.y - 22, 34, 30, 24)));
  }
  for (const d of shapes) parts.push(`<path d="${d}" fill="${WHITE}"/>`);
  const all = shapes.join(' ');
  return [
    { kind: 'tint', slot: 'hair', svg: parts.join('') },
    { kind: 'detail', svg: shade(all, yaw, { dark: 0.34, light: 0.05 }) },
  ];
}

export function hairFront(yaw: number, st: HairStyle): SubLayer[] {
  const { cy } = HEAD;
  const capD = smoothPath(capOutline(st, yaw));
  // region above the projected hairline (visible part only), extended up and out
  const line: Pt[] = [];
  for (let i = 0; i <= 60; i++) {
    const u = lerp(-Math.PI, Math.PI, i / 60);
    const au = Math.abs(u);
    // behind the ears the hairline drops to the nape
    const v = au <= Math.PI / 2 ? st.hairline(u) : lerp(st.hairline(Math.sign(u) * Math.PI / 2), -0.62, smooth(Math.PI / 2 + 0.05, Math.PI / 2 + 0.55, au));
    const p = headPoint(u, v, yaw, 1.01);
    // visible points only, and never folding back (keeps the clip polygon simple)
    if (p.facing > 0.01 && (!line.length || p.x > line[line.length - 1][0])) line.push([p.x, p.y]);
  }
  if (line.length < 2) return [];
  const l0 = line[0], l1 = line[line.length - 1];
  const above: Pt[] = [[l0[0] - 160, l0[1] + 30], ...line, [l1[0] + 160, l1[1] + 30], [l1[0] + 160, cy - 260], [l0[0] - 160, cy - 260]];
  const c = id('c');
  const shapes: string[] = [`<defs><clipPath id="${c}"><path d="${poly(above)}"/></clipPath></defs><path d="${capD}" fill="${WHITE}" clip-path="url(#${c})"/>`];
  const shadeShapes: string[] = [];
  // side locks framing the face (long styles)
  if (st.locks) {
    for (const side of [-1, 1]) {
      const top = headPoint(side * 1.3, 0.3, yaw, st.volume);
      const mid = headPoint(side * 1.42, -0.35, yaw, st.volume * 1.02);
      if (top.facing < 0.05 || Math.abs(Math.sin(yaw)) > 0.9) continue;
      const wv = st.curls ? st.curls : 2;
      const w = 22 * clamp(Math.abs(Math.cos(side * 1.2 + yaw)) + 0.35, 0.35, 1);
      const out = side * (yaw === 0 ? 1 : Math.sign(Math.cos(side * 1.2 + yaw)) * side);
      const d = smoothPath([
        [top.x - w * 0.8, top.y], [top.x + w * 0.8, top.y - 4],
        [mid.x + w * 0.7 * out + wv, mid.y], [mid.x + w * 0.5 * out, st.locks - 10], [mid.x, st.locks],
        [mid.x - w * 0.6 * out, st.locks - 14], [mid.x - w * 0.45 * out - wv, mid.y + 10],
      ]);
      shapes.push(`<path d="${d}" fill="${WHITE}"/>`);
      shadeShapes.push(d);
    }
  }
  const tintSvg = shapes.join('');
  // shading: darker toward the hairline, a glossy sheen band on top, a few strand lines
  const g = id('g'), c2 = id('c'), sh = id('s');
  const sheenTop = cy - HEAD.b * st.volume - (st.lift ?? 0) + 30;
  const capClip = `<path d="${capD}" clip-path="url(#${c})"/>${shadeShapes.map((d) => `<path d="${d}"/>`).join('')}`;
  const strands = st.curls ? '' : Array.from({ length: 5 }, (_, i) => {
    const u = lerp(-0.9, 0.9, i / 4) + (st.part ?? 0) * 0.3;
    const a = headPoint(u * 0.6 + (st.part ?? 0), 0.95, yaw, st.volume * 1.01), b = headPoint(u, st.hairline(u) + 0.05, yaw, st.volume * 1.01);
    if (a.facing < 0.1 || b.facing < 0.1) return '';
    return `<path d="M${f(a.x)} ${f(a.y)} Q${f((a.x + b.x) / 2 + 6)} ${f((a.y + b.y) / 2)} ${f(b.x)} ${f(b.y)}" stroke="#000" stroke-opacity="0.12" stroke-width="2" fill="none"/>`;
  }).join('');
  const partLine = st.part !== undefined ? (() => {
    const a = headPoint(st.part, 0.98, yaw, st.volume * 1.01), b = headPoint(st.part, st.hairline(st.part) + 0.02, yaw, st.volume * 1.01);
    return a.facing > 0.1 ? `<path d="M${f(a.x)} ${f(a.y)} L${f(b.x)} ${f(b.y)}" stroke="#000" stroke-opacity="0.2" stroke-width="2.4"/>` : '';
  })() : '';
  const det = `<defs><clipPath id="${c2}">${capClip}</clipPath>
<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></linearGradient>
<linearGradient id="${sh}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<g clip-path="url(#${c2})">
<rect x="0" y="${f(cy - 40)}" width="400" height="460" fill="url(#${g})"/>
<path d="M${f(HEAD.cx - 80 + Math.sin(yaw) * 20)} ${f(sheenTop + 8)} Q${f(HEAD.cx + Math.sin(yaw) * 30)} ${f(sheenTop - 14)} ${f(HEAD.cx + 80 + Math.sin(yaw) * 20)} ${f(sheenTop + 8)}" stroke="url(#${sh})" stroke-width="12" fill="none" stroke-linecap="round"/>
${strands}${partLine}
${shade(capD, yaw, { dark: 0.22, light: 0.0 })}</g>`;
  return [{ kind: 'tint', slot: 'hair', svg: tintSvg }, { kind: 'detail', svg: det }];
}

const poly = (pts: Pt[]) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L') + 'Z';

// ---------------------------------------------------------------- facial hair & glasses
export const FACIAL_HAIR = ['stubble', 'mustache', 'goatee', 'beard', 'full_beard'] as const;
export function facialHair(yaw: number, style: string): SubLayer[] {
  const out = headOutline(yaw, 1.005, 1, 72);
  const { cy } = HEAD;
  const jaw = (from: number) => out.filter(([, y]) => y > cy + from);
  const m = headPoint(0, -0.5, yaw);
  const s = Math.sin(yaw), fx = clamp(Math.cos(yaw) * 0.9 + 0.25, 0.3, 1);
  const must = smoothPath([[m.x - 20 * fx, m.y - 1], [m.x - 8 * fx, m.y - 9], [m.x + s * 2, m.y - 6], [m.x + 8 * fx, m.y - 9], [m.x + 20 * fx, m.y - 1], [m.x + 10 * fx, m.y - 3], [m.x, m.y - 2], [m.x - 10 * fx, m.y - 3]]);
  const chin = smoothPath([[m.x - 12 * fx, m.y + 9], [m.x + 12 * fx, m.y + 9], [m.x + 10 * fx, m.y + 30], [m.x, m.y + 36], [m.x - 10 * fx, m.y + 30]]);
  const ring = (from: number, thick: number) => {
    const j = jaw(from);
    if (j.length < 3) return '';
    const inner = j.map(([x, y]): Pt => [m.x + (x - m.x) * 0.82, y - thick * smooth(cy + from, cy + 104, y)]).reverse();
    return smoothPath([...j, ...inner]);
  };
  let tint = '', det = '';
  switch (style) {
    case 'stubble': det = `<g filter="url(#blur3)"><path d="${ring(28, 22)}" fill="#000" fill-opacity="0.08"/><path d="${must}" fill="#000" fill-opacity="0.07"/></g>`; break;
    case 'mustache': tint = `<path d="${must}" fill="${WHITE}"/>`; break;
    case 'goatee': tint = `<path d="${must}" fill="${WHITE}"/><path d="${chin}" fill="${WHITE}"/>`; break;
    case 'beard': tint = `<path d="${ring(30, 26)}" fill="${WHITE}"/><path d="${must}" fill="${WHITE}"/>`; break;
    case 'full_beard': tint = `<path d="${ring(5, 40)}" fill="${WHITE}"/><path d="${must}" fill="${WHITE}"/><path d="${chin}" fill="${WHITE}"/>`; break;
  }
  const layers: SubLayer[] = [];
  if (tint) layers.push({ kind: 'tint', slot: 'facialHair', svg: tint }, { kind: 'detail', svg: `<g opacity="0.5">${shade(ring(30, 26) || must, yaw, { dark: 0.3, light: 0 })}</g>` });
  if (det) layers.push({ kind: 'detail', svg: det });
  return layers;
}

export const GLASSES = ['round', 'square'] as const;
export function glasses(yaw: number, style: string): SubLayer[] {
  const parts: string[] = [];
  const centers: { x: number; y: number; fx: number }[] = [];
  for (const side of [-1, 1]) {
    const p = headPoint(side * 0.42, -0.1, yaw, 1.08);
    if (p.facing < 0.1) continue;
    const fx = clamp(p.facing * 1.05, 0.25, 1);
    centers.push({ x: p.x, y: p.y, fx });
    const w = 22 * fx, h = style === 'round' ? 21 : 17;
    parts.push(style === 'round'
      ? `<ellipse cx="${f(p.x)}" cy="${f(p.y + 1)}" rx="${f(w)}" ry="${h}" fill="#fff" fill-opacity="0.12" stroke="#22201f" stroke-width="3.2"/>`
      : `<rect x="${f(p.x - w)}" y="${f(p.y - h + 2)}" width="${f(w * 2)}" height="${h * 2 - 2}" rx="5" fill="#fff" fill-opacity="0.12" stroke="#22201f" stroke-width="3.6"/>`);
    // temple arm toward the ear when the head turns
    if (Math.abs(Math.sin(yaw)) > 0.3 && side * Math.sin(yaw) < 0) {
      const e = headPoint(side * Math.PI / 2, -0.04, yaw, 1.0);
      parts.push(`<path d="M${f(p.x - w * Math.sign(Math.sin(yaw)))} ${f(p.y - 6)} L${f(e.x)} ${f(e.y - 6)}" stroke="#22201f" stroke-width="3"/>`);
    }
  }
  if (centers.length === 2) parts.push(`<path d="M${f(centers[0].x + 22 * centers[0].fx)} ${f(centers[0].y - 3)} Q${f((centers[0].x + centers[1].x) / 2)} ${f(centers[0].y - 9)} ${f(centers[1].x - 22 * centers[1].fx)} ${f(centers[1].y - 3)}" stroke="#22201f" stroke-width="3" fill="none"/>`);
  return [{ kind: 'detail', svg: parts.join('') }];
}
