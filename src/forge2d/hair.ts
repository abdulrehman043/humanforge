// Hair (v2): layered, lit locks with staggered pointed tips, ombre roots, strands and a glossy sheen.
// Straight / wavy / curly families share one generator; buns, braids and afros are custom silhouettes (hair2.ts).
import { CX, Pt, clamp, darken, lerp, lerpPt, lighten, mirrorPts, n2, rng, sampleSpline, spline, symPath } from './geom';
import type { Ctx } from './types';

export type HairTexture = 'straight' | 'wavy' | 'curly' | 'coily';
export interface HairDef {
  id: string; name: string; texture: HairTexture; length: 'short' | 'medium' | 'long' | 'none';
  tags: string[];
  render: (c: Ctx) => { back: string; front: string };
}

// ------------------------------------------------------------------ helpers
export function resample(pts: Pt[], n: number): Pt[] {
  const dense = sampleSpline(pts, 12, 1 / 6);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = cum[cum.length - 1];
  const out: Pt[] = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    while (j < cum.length - 1 && cum[j] < target) j++;
    const t = (target - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    out.push(lerpPt(dense[j - 1], dense[j], t));
  }
  return out;
}

interface Wave { amp: number; period: number; phase?: number; from?: number; ramp?: number; scallop?: number }
/** Lateral wave / curl displacement along a polyline (fades in below `from`). */
export function waved(pts: Pt[], w: Wave | undefined, side = 1): Pt[] {
  if (!w) return pts;
  const from = w.from ?? 120, ramp = w.ramp ?? 70;
  return pts.map(([x, y], i) => {
    const k = clamp((y - from) / ramp, 0, 1);
    const sx = Math.sin(((y - from) / w.period) * Math.PI * 2 + (w.phase ?? 0));
    let dx = w.amp * k * sx;
    if (w.scallop) dx += w.scallop * k * Math.abs(Math.sin(i * 1.7)) * side;
    return [x + dx * side, y] as Pt;
  });
}

export function hairPalette(c: Ctx) {
  const base = c.hairColor;
  return { root: darken(base, 0.2), base, tip: lighten(base, 0.1), deep: darken(base, 0.34), hi: lighten(base, 0.24), shine: lighten(base, 0.55) };
}

/** Vertical ombre: dark roots, body colour, lighter ends. */
export function hairFill(c: Ctx, y0: number, y1: number) {
  const p = hairPalette(c);
  return c.d.linear(0, y0, 0, y1, [[0, p.root], [0.22, p.root], [0.5, p.base], [1, p.tip]]);
}

export interface Piece { path: string; A?: Pt[]; B?: Pt[]; strandN?: number; sheen?: boolean; blur?: number; scale?: number; shadow?: boolean }

/** Closed band between hairline edge A and outer edge B, ending in a rounded tip. */
export function band(A: Pt[], B: Pt[], tip = 4): string {
  const a = spline(A, false, 1 / 6);
  const bEnd = B[B.length - 1], aEnd = A[A.length - 1];
  const mid: Pt = [(bEnd[0] + aEnd[0]) / 2, Math.max(bEnd[1], aEnd[1]) + tip];
  return a + `Q${n2(mid[0])},${n2(mid[1])} ${n2(bEnd[0])},${n2(bEnd[1])}` + spline([...B].reverse(), false, 1 / 6, false) + 'Z';
}

/** Band with a pointed (feathered) tip: the reference's V-shaped layered ends. */
export function bandPointed(A: Pt[], B: Pt[], tip: number, lean = 0): string {
  const a = spline(A, false, 1 / 6);
  const bEnd = B[B.length - 1], aEnd = A[A.length - 1];
  const apex: Pt = [(aEnd[0] + bEnd[0]) / 2 + lean, Math.max(aEnd[1], bEnd[1]) + tip];
  return a + `Q${n2(aEnd[0])},${n2(aEnd[1] + tip * 0.55)} ${n2(apex[0])},${n2(apex[1])}Q${n2(bEnd[0])},${n2(bEnd[1] + tip * 0.55)} ${n2(bEnd[0])},${n2(bEnd[1])}` + spline([...B].reverse(), false, 1 / 6, false) + 'Z';
}

/** Draw hair pieces: soft contact shadow, lit volume, strands, gloss and highlights. */
export function hairPieces(c: Ctx, pieces: Piece[], opts: { y0: number; y1: number; flat?: boolean } = { y0: 36, y1: 340 }): string {
  const { d, cfg } = c;
  const p = hairPalette(c);
  const fill = hairFill(c, opts.y0, opts.y1);
  const hl = cfg.hair.highlight;
  const hlStyle = cfg.hair.highlightStyle;
  let out = '';
  // soft contact shadows first, then ONE lighting pass over all pieces (union volume), then per-piece detail
  for (const pc of pieces) if (pc.shadow !== false) out += d.shadowOf(pc.path, '#1a1020', 0.24, 1.6, 3, 2.6);
  const litO = { blur: Math.max(...pieces.map((q) => q.blur ?? 5.2)), scale: pieces[0]?.scale ?? 3.6, spec: 0.2 };
  let volume = '';
  const clips: string[] = [];
  for (const pc of pieces) {
    const clip = d.clip(`<path d="${pc.path}"/>`);
    clips.push(clip);
    volume += `<path d="${pc.path}" fill="${fill}"/>`;
    if (hl && hlStyle !== 'streaks') {
      const y0 = hlStyle === 'tips' ? lerp(opts.y0, opts.y1, 0.7) : lerp(opts.y0, opts.y1, 0.34);
      const g = d.linear(0, y0, 0, opts.y1, [[0, hl, 0], [hlStyle === 'tips' ? 0.3 : 0.62, hl, 0.9], [1, hl, 0.95]]);
      volume += `<g clip-path="${clip}"><rect x="0" y="${n2(y0 - 2)}" width="400" height="${n2(opts.y1 - y0 + 14)}" fill="${g}"/></g>`;
    }
  }
  out += d.volume(volume, pieces.map((q) => q.path), litO);
  for (let pi = 0; pi < pieces.length; pi++) {
    const pc = pieces[pi], clip = clips[pi];
    out += `<g clip-path="${clip}">`;
    if (pc.A && pc.B) {
      const n = d.thin ? Math.min(4, pc.strandN ?? 14) : Math.min(11, pc.strandN ?? 11);
      const A = resample(pc.A, 14), B = resample(pc.B, 14);
      const r = rng(Math.round(A[3][0] * 3 + B[5][1]));
      for (let i = 0; i < n; i++) {
        const t = 0.06 + (i / (n - 1)) * 0.88 + (r() - 0.5) * 0.05;
        const l: Pt[] = A.map((a, k) => lerpPt(a, B[k], t));
        const from = Math.floor(r() * 3), to = 11 + Math.floor(r() * 3);
        const col = i % 3 === 0 ? p.hi : p.deep;
        out += `<path d="${spline(l.slice(from, to + 1), false, 1 / 6)}" fill="none" stroke="${col}" stroke-width="${i % 2 ? 1.2 : 0.9}" stroke-linecap="round" opacity="${i % 3 === 0 ? 0.24 : 0.14}"/>`;
      }
      if (hl && hlStyle === 'streaks') {
        for (const t of [0.22, 0.5, 0.78]) {
          const l = A.map((a, k) => lerpPt(a, B[k], t));
          out += `<path d="${spline(l.slice(3), false)}" fill="none" stroke="${hl}" stroke-width="3.6" stroke-linecap="round" opacity=".7"/>`;
        }
      }
      if (pc.sheen !== false) {
        const mid = A.map((a, k) => lerpPt(a, B[k], 0.4)).slice(0, 8);
        out += d.softStroke(spline(mid, false), p.shine, 4.6, 0.42);
      }
    }
    out += `</g>`;
    out += `<path d="${pc.path}" fill="none" stroke="${p.deep}" stroke-width=".9" stroke-linejoin="round" opacity=".34"/>`;
  }
  return out;
}

// ------------------------------------------------------------------ straight / wavy / curly family
interface Fam {
  id: string; name: string; texture: HairTexture; length: HairDef['length']; tags: string[];
  yEnd: number;               // front lock bottom
  backEnd?: number;           // back mass bottom
  vol?: number;               // extra width
  part?: 'center' | 'left' | 'right';
  bangs?: 'none' | 'curtain' | 'full' | 'side';
  tuck?: -1 | 1;              // side tucked behind the ear
  wave?: Wave;
  inward?: number;            // how far the ends curl in (bobs)
  layers?: boolean;
  fringeLen?: number;
}

function famRender(f: Fam) {
  return (c: Ctx) => {
    const g = c.face;
    const vol = (f.vol ?? 0) + 3;
    const partX = f.part === 'right' ? CX + 17 : f.part === 'left' ? CX - 17 : CX;
    const backPieces: Piece[] = [];
    const frontPieces: Piece[] = [];
    const pointy = f.texture === 'straight' && !f.inward && f.length !== 'short';
    const tipLen = f.length === 'long' ? 30 : f.length === 'medium' ? 18 : 6;

    // ---- back mass (the hair behind the head and shoulders)
    const be = f.backEnd ?? f.yEnd + 6;
    const bRight: Pt[] = [[CX, 31], [CX + 30 + vol * 0.3, 34], [CX + 55 + vol * 0.6, 53], [CX + 69 + vol * 0.8, 88], [CX + 75 + vol, 130]];
    const sideX = 76 + vol;
    const steps = Math.max(1, Math.round((be - 130) / 55));
    for (let i = 1; i <= steps; i++) {
      const y = lerp(130, be, i / steps);
      bRight.push([CX + sideX - (f.inward ?? 0) * Math.pow(i / steps, 2.2) * 1.2 - Math.pow(i / steps, 3) * 20, y - (i === steps ? 8 : 0)]);
    }
    let backP: string;
    if (pointy) {
      // jagged, feathered ends
      const end = bRight[bRight.length - 1];
      const tips: Pt[] = [[end[0] - 4, be + 4], [CX + 52, be + 12 + tipLen * 0.4], [CX + 44, be - 12], [CX + 30, be + 8 + tipLen * 0.9], [CX + 18, be - 10], [CX + 6, be + 6 + tipLen * 0.5], [CX, be - 6]];
      const right: Pt[] = [...bRight.slice(0, -1), ...tips];
      const loop: Pt[] = [...right, ...mirrorPts(right.slice(1, -1)).reverse()];
      backP = spline(loop, true, 1 / 8);
    } else {
      bRight.push([CX + 34, be + 3], [CX, be + 4]);
      backP = symPath(bRight, 1 / 6);
      if (f.wave) {
        const wr = waved(bRight.map((p) => p), f.wave, 1);
        const lw = mirrorPts(waved(bRight.slice(1, -1), { ...f.wave, phase: (f.wave.phase ?? 0) + 1.2 }, 1)).reverse();
        backP = spline([...wr, ...lw], true, 1 / 6);
      }
    }
    backPieces.push({ path: backP, blur: 10, scale: 4.4, shadow: false });
    // inner back layer: a slightly shorter, lighter layer gives depth behind the front locks
    if (f.length !== 'short') {
      const inner = symPath([[CX, 40], [CX + 40, 46], [CX + 62, 80], [CX + 66, 140], [CX + 62, be - 30], [CX + 40, be - 22], [CX, be - 26]], 1 / 6);
      backPieces.push({ path: inner, blur: 9, scale: 4, shadow: false });
    }

    // ---- front locks, split into three staggered strips per side
    for (const s of [1, -1] as const) {
      const sPart = partX;
      const sideWide = (y: number) => CX + s * (lerp(70, 73, clamp((y - 125) / 100, 0, 1)) + vol - (f.inward ?? 0) * Math.pow(clamp((y - 150) / (f.yEnd - 150), 0, 1), 2) * 1.1);
      const Bs: Pt[] = [[sPart, 36], [CX + s * 28 + (sPart - CX) * 0.2, 38], [CX + s * (53 + vol * 0.5), 54], [CX + s * (66 + vol * 0.7), 86], [sideWide(125), 125]];
      const tuck = f.tuck === s;
      const yEnd = tuck ? 120 : f.yEnd;
      const nb = Math.max(1, Math.round((yEnd - 125) / 50));
      for (let i = 1; i <= nb; i++) { const y = lerp(125, yEnd, i / nb); Bs.push([sideWide(y), y]); }
      const hl = (y: number, off: number) => CX + s * (g.hw(y) + off);
      const swoop = f.part && f.part !== 'center' && ((f.part === 'right' && s === -1) || (f.part === 'left' && s === 1));
      let As: Pt[];
      if (swoop) As = [[sPart, 50], [sPart - s * 14, 56], [CX - s * 8, 64], [CX + s * 22, 76], [hl(98, -4), 98], [hl(118, -2), 118]];
      else if (f.bangs === 'curtain') As = [[sPart, 58], [CX + s * 15, 70], [CX + s * 27, 90], [CX + s * 35, 110], [hl(130, -3), 130]];
      else As = [[sPart + s * 0.5, 60], [CX + s * 11, 62], [CX + s * 26, 68], [CX + s * 38, 80], [hl(96, -1.5), 96], [hl(114, -1), 114], [hl(130, 0), 130]];
      const nA = Math.max(1, Math.round((yEnd - 130) / 50));
      const inw = f.inward ?? 0;
      const aEdge = (y: number) => CX + s * (g.hw(Math.min(y, 160)) + (y > 150 ? 3 + (y - 150) * 0.1 : 0) - inw * 0.2 * clamp((y - 150) / 160, 0, 1));
      if (tuck) As.push([hl(124, 1), 124]);
      for (let i = 1; i <= nA && !tuck; i++) { const y = lerp(130, yEnd, i / nA); As.push([aEdge(y) + s * (y > 190 ? 1 + (y - 190) * 0.07 * (f.id.includes('long') ? 1 : 0.6) : 0), y - (i === nA ? 4 : 0)]); }
      let A = resample(As, 16), B = resample(Bs, 16);
      if (f.wave) {
        A = waved(A, { ...f.wave, amp: f.wave.amp * 0.8, phase: (f.wave.phase ?? 0) + 0.4 }, s);
        B = waved(B, f.wave, s);
      }
      if (tuck || f.wave || !pointy) {
        frontPieces.push({ path: band(A, B, f.wave ? 3 : f.layers ? 14 : f.length === 'long' ? 11 : f.length === 'medium' ? 7 : 3), A, B });
      } else {
        // three strips with staggered lengths: [outer, middle, inner]; the middle one is longest
        const plan: [number, number, number, number][] = [[0, 0.36, 0.9, tipLen * 0.8], [0.34, 0.68, 1, tipLen], [0.66, 1, 0.84, tipLen * 0.7]];
        for (const [t0, t1, keep, tl] of plan) {
          const n = Math.max(6, Math.round(16 * keep));
          const sa = A.slice(0, n).map((a, k) => lerpPt(a, B[k], t0)), sb = A.slice(0, n).map((a, k) => lerpPt(a, B[k], t1));
          frontPieces.push({ path: bandPointed(sa, sb, tl, s * 3), A: sa, B: sb, strandN: 6, sheen: t0 === 0.34, blur: 4.4, scale: 3.8 });
        }
      }
    }

    // ---- fringe
    let fringe = '';
    if (f.bangs === 'full') {
      const L = f.fringeLen ?? 86;
      const fp = spline([[CX - 52, 100], [CX - 51, 78], [CX - 39, 55], [CX, 42], [CX + 39, 55], [CX + 51, 78], [CX + 52, 100], [CX + 45, L + 4], [CX + 30, L - 1], [CX + 20, L + 3], [CX + 8, L - 1], [CX - 4, L + 3], [CX - 16, L - 1], [CX - 28, L + 2], [CX - 40, L - 2], [CX - 47, L + 4]], true, 1 / 6);
      fringe = hairPieces(c, [{ path: fp, A: [[CX - 40, 52], [CX - 42, 66], [CX - 44, 80], [CX - 44, L]], B: [[CX + 40, 52], [CX + 42, 66], [CX + 44, 80], [CX + 44, L]], strandN: 14, sheen: false }], { y0: 38, y1: 150 });
    } else if (f.bangs === 'side') {
      const sd = f.part === 'left' ? -1 : 1;
      const fp = spline([[CX + sd * 6, 44], [CX - sd * 30, 50], [CX - sd * 51, 76], [CX - sd * 52, 106], [CX - sd * 44, 98], [CX - sd * 24, 80], [CX + sd * 6, 70], [CX + sd * 30, 62], [CX + sd * 44, 74], [CX + sd * 40, 54]], true, 1 / 6);
      fringe = hairPieces(c, [{ path: fp, sheen: false }], { y0: 38, y1: 150 });
    }

    // ---- crown: a rounded, glossy cap that closes the gap between both locks above the forehead
    const crown = spline([[CX - 55, 72], [CX - 47, 46], [CX - 22, 34], [CX, 31], [CX + 22, 34], [CX + 47, 46], [CX + 55, 72], [CX + 30, 58], [CX, 52], [CX - 30, 58]], true, 1 / 6);
    const crownPiece: Piece = { path: crown, sheen: false, blur: 7, scale: 4.6 };
    const front = hairPieces(c, [crownPiece, ...frontPieces], { y0: 34, y1: f.yEnd + 10 }) + fringe;
    const back = hairPieces(c, backPieces, { y0: 32, y1: be + 14 });
    // soft crown highlight band
    const gloss = c.d.softStroke(`M${CX - 46},64Q${CX - 30},38 ${CX},35Q${CX + 30},38 ${CX + 46},64`, hairPalette(c).shine, 4.6, 0.48);
    return { back, front: front + gloss };
  };
}

const FAM: Fam[] = [
  { id: 'long-center',  name: 'Long & sleek',        texture: 'straight', length: 'long',   tags: ['long', 'down'], yEnd: 332, backEnd: 346 },
  { id: 'long-side',    name: 'Long side part',      texture: 'straight', length: 'long',   tags: ['long', 'down'], yEnd: 324, backEnd: 340, part: 'right', tuck: -1 },
  { id: 'long-curtain', name: 'Curtain bangs',       texture: 'straight', length: 'long',   tags: ['long', 'down', 'bangs'], yEnd: 318, backEnd: 334, bangs: 'curtain', layers: true },
  { id: 'medium-straight', name: 'Collarbone cut',   texture: 'straight', length: 'medium', tags: ['medium', 'down'], yEnd: 268, backEnd: 280 },
  { id: 'lob',          name: 'Long bob',            texture: 'straight', length: 'medium', tags: ['medium', 'down'], yEnd: 236, backEnd: 248, part: 'left', inward: 6 },
  { id: 'bob-fringe',   name: 'Blunt bob & fringe',  texture: 'straight', length: 'short',  tags: ['short', 'down', 'bangs'], yEnd: 192, backEnd: 202, bangs: 'full', inward: 8, vol: -4, fringeLen: 82 },
  { id: 'wavy-long',    name: 'Long waves',          texture: 'wavy',     length: 'long',   tags: ['long', 'down', 'wavy'], yEnd: 326, backEnd: 342, vol: 6, wave: { amp: 6, period: 78, from: 130, ramp: 70 }, bangs: 'curtain' },
  { id: 'wavy-medium',  name: 'Wavy shoulder cut',   texture: 'wavy',     length: 'medium', tags: ['medium', 'down', 'wavy'], yEnd: 272, backEnd: 284, vol: 6, wave: { amp: 6.5, period: 58, from: 130, ramp: 60 }, part: 'right' },
  { id: 'wavy-bob',     name: 'Wavy bob',            texture: 'wavy',     length: 'short',  tags: ['short', 'down', 'wavy'], yEnd: 198, backEnd: 208, vol: 8, wave: { amp: 5, period: 46, from: 120, ramp: 50 }, inward: 4, part: 'left' },
  { id: 'curly-long',   name: 'Long curls',          texture: 'curly',    length: 'long',   tags: ['long', 'down', 'curly'], yEnd: 312, backEnd: 328, vol: 16, wave: { amp: 9, period: 44, from: 100, ramp: 40, scallop: 3 }, part: 'right' },
  { id: 'curly-medium', name: 'Bouncy curls',        texture: 'curly',    length: 'medium', tags: ['medium', 'down', 'curly'], yEnd: 262, backEnd: 274, vol: 18, wave: { amp: 9.5, period: 38, from: 100, ramp: 40, scallop: 3.5 } },
];

export const HAIR_FAMILY_DEFS: HairDef[] = FAM.map((f) => ({ id: f.id, name: f.name, texture: f.texture, length: f.length, tags: f.tags, render: famRender(f) }));
