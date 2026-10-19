// Chibi body and clothing for the cartoon avatar. Shapes come from a simple 3D body (elliptic
// torso, cylinder limbs) projected per yaw, split into depth bands so turning works with layers:
//   back  = far arm / far leg (behind the torso)
//   mid   = neck, torso, legs
//   front = near arm (in front of the torso; both arms in the front view)
import { Pt, clamp, f, lerp, smooth, smoothPath } from './geom';
import { SubLayer, id, shade } from './head';

export type Build = 'female' | 'male';
export type Band = 'back' | 'mid' | 'front';
const CX = 200;
const WHITE = '#fff';

/** Torso cross-section by height: half-width, front depth, back depth. */
function torsoAt(y: number, build: Build) {
  const m = build === 'male';
  // y: 282 shoulders .. 432 crotch
  const t = clamp((y - 282) / 150);
  const shoulder = m ? 66 : 58, waist = m ? 52 : 42, hip = m ? 52 : 54;
  let w = t < 0.45 ? lerp(shoulder, waist, smooth(0, 0.45, t)) : lerp(waist, hip, smooth(0.45, 0.9, t));
  // round, sloping shoulders: from the neck (y 282) out to the shoulder width by y 304
  if (y < 304) { const k = clamp((y - 280) / 24); w = lerp(20, shoulder, Math.sqrt(1 - (1 - k) ** 2)); }
  const bust = m ? 0 : 9 * Math.exp(-(((y - 330) / 18) ** 2));
  return { w, front: 30 + bust + (m ? 2 : 0), back: 28 };
}

/** Silhouette of the torso between y0 and y1 at a yaw, inflated by `pad`. */
export function torsoShape(yaw: number, build: Build, y0: number, y1: number, pad = 0, flare = 0): Pt[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const left: Pt[] = [], right: Pt[] = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const y = lerp(y0, y1, i / n);
    const t = torsoAt(y, build);
    const extra = pad + flare * (i / n) ** 1.5;
    const xr = Math.sqrt((t.w * c) ** 2 + (t.front * s) ** 2) + extra;
    const xl = Math.sqrt((t.w * c) ** 2 + (t.back * s) ** 2) + extra;
    right.push([CX + xr, y]);
    left.push([CX - xl, y]);
  }
  return [...right, ...left.reverse()];
}

interface Limb { pts: [number, number, number][]; r: number[] }
/** Arm / leg chains in body space (x outward, y down, z forward), for side -1 (left) / +1 (right). */
function arm(side: number, build: Build): Limb {
  const m = build === 'male';
  const sx = m ? 70 : 62;
  return {
    pts: [[side * sx, 296, 0], [side * (sx + 12), 368, 2], [side * (sx + 17), 438, 8], [side * (sx + 18), 458, 10]],
    r: m ? [15, 12.5, 10.5, 12] : [13, 11, 9.5, 11],
  };
}
function leg(side: number, build: Build): Limb {
  const m = build === 'male';
  return { pts: [[side * 25, 420, 0], [side * 26, 505, 2], [side * 24, 580, 0]], r: m ? [22, 16, 12] : [22, 15, 11] };
}
function project([x, y, z]: [number, number, number], yaw: number): { x: number; y: number; z: number } {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: CX + x * c + z * s, y, z: -x * s + z * c };
}

/** Outline of a limb chain between fractions a..b of its length, inflated by pad (end caps rounded). */
export function limbShape(l: Limb, yaw: number, a = 0, b = 1, pad = 0, flareEnd = 0): Pt[] {
  const P = l.pts.map((p) => project(p, yaw));
  // resample along the chain
  const seg = P.slice(1).map((p, i) => Math.hypot(p.x - P[i].x, p.y - P[i].y));
  const total = seg.reduce((x, y) => x + y, 0);
  const at = (t: number) => {
    let d = t * total;
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] || i === seg.length - 1) {
        const k = clamp(d / seg[i]);
        return { x: lerp(P[i].x, P[i + 1].x, k), y: lerp(P[i].y, P[i + 1].y, k), r: lerp(l.r[i], l.r[i + 1], k) };
      }
      d -= seg[i];
    }
    return { x: P[P.length - 1].x, y: P[P.length - 1].y, r: l.r[l.r.length - 1] };
  };
  const n = 12, L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = lerp(a, b, i / n);
    const p = at(t), q = at(Math.min(1, t + 0.02)), o = at(Math.max(0, t - 0.02));
    const dx = q.x - o.x, dy = q.y - o.y, len = Math.hypot(dx, dy) || 1;
    const r = p.r + pad + flareEnd * (i / n) ** 2;
    L.push([p.x - (dy / len) * r, p.y + (dx / len) * r]);
    R.push([p.x + (dy / len) * r, p.y - (dx / len) * r]);
  }
  const end = at(b), start = at(a);
  return [...L, [end.x, end.y + (end.r + pad) * 0.6], ...R.reverse(), [start.x, start.y - (start.r + pad) * 0.3]];
}

/** Which band each limb falls in at this yaw (front view: arms in front, legs mid). */
function limbBand(side: number, yaw: number, kind: 'arm' | 'leg'): Band {
  if (Math.abs(yaw) < 0.2) return kind === 'arm' ? 'front' : 'mid';
  const near = side * Math.sin(yaw) < 0; // turned right -> the left side faces the viewer
  return near ? (kind === 'arm' ? 'front' : 'mid') : 'back';
}

type Bands = Record<Band, { tint: string[]; detail: string[]; shapes: string[] }>;
const emptyBands = (): Bands => ({ back: { tint: [], detail: [], shapes: [] }, mid: { tint: [], detail: [], shapes: [] }, front: { tint: [], detail: [], shapes: [] } });
function toLayers(b: Bands, slot: SubLayer['slot'], yaw: number, extraDetail: Partial<Record<Band, string>> = {}, dark = 0.24): Record<Band, SubLayer[]> {
  const out = {} as Record<Band, SubLayer[]>;
  for (const k of ['back', 'mid', 'front'] as Band[]) {
    const v = b[k];
    if (!v.tint.length) { out[k] = []; continue; }
    const all = v.shapes.join(' ');
    out[k] = [
      { kind: 'tint', slot, svg: v.tint.join('') },
      { kind: 'detail', svg: shade(all, yaw, { dark: k === 'back' ? dark + 0.12 : dark, light: 0.08 }) + v.detail.join('') + (extraDetail[k] ?? '') },
    ];
  }
  return out;
}
const add = (b: Bands, band: Band, d: string) => { b[band].tint.push(`<path d="${d}" fill="${WHITE}"/>`); b[band].shapes.push(d); };

// ---------------------------------------------------------------- body (skin)
export function bodySkin(yaw: number, build: Build): Record<Band, SubLayer[]> {
  const b = emptyBands();
  // neck
  const nc = CX + Math.sin(yaw) * 6;
  add(b, 'mid', smoothPath([[nc - 17, 240], [nc + 17, 240], [nc + 18, 296], [nc - 18, 296]]));
  add(b, 'mid', smoothPath(torsoShape(yaw, build, 284, 436)));
  for (const side of [-1, 1]) {
    for (const kind of ['arm', 'leg'] as const) {
      const band = limbBand(side, yaw, kind);
      const l = kind === 'arm' ? arm(side, build) : leg(side, build);
      add(b, band, smoothPath(limbShape(l, yaw, kind === 'arm' ? 0.07 : 0)));
      if (kind === 'arm') {
        // mitten hand
        const h = project(l.pts[3], yaw);
        add(b, band, smoothPath(ellipsePts2(h.x + side * 1.5 * Math.cos(yaw), h.y + 8, 11, 14)));
      }
    }
  }
  // neck shadow under the chin
  const neckShadow = `<ellipse cx="${f(nc)}" cy="252" rx="22" ry="14" fill="#000" fill-opacity="0.16" filter="url(#blur3)"/>`;
  return toLayers(b, 'skin', yaw, { mid: neckShadow }, 0.2);
}
function ellipsePts2(cx: number, cy: number, rx: number, ry: number): Pt[] {
  return Array.from({ length: 16 }, (_, i) => { const t = (i / 16) * Math.PI * 2; return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry] as Pt; });
}

// ---------------------------------------------------------------- clothing
export interface Garment {
  id: string;
  slot: 'top' | 'bottom' | 'outfit' | 'shoes' | 'headwear';
  fit: 'female' | 'male' | 'unisex';
  /** pretty default color */
  color: string;
  /** hides the hair (hijab), hides top+bottom (outfit) */
  hidesHair?: boolean;
  modest?: boolean;
  draw(yaw: number, build: Build): Record<Band, SubLayer[]>;
}

/** Top/robe body: torso from neckline to hem (+ flare), sleeves to `sleeve` (0..1 of the arm). */
function topLike(yaw: number, build: Build, o: { neck: number; hem: number; sleeve: number; pad?: number; flare?: number; sleevePad?: number; sleeveFlare?: number }) {
  const b = emptyBands();
  const torso = torsoShape(yaw, build, o.neck, o.hem, o.pad ?? 3, o.flare ?? 0);
  add(b, 'mid', smoothPath(torso));
  if (o.sleeve > 0) {
    for (const side of [-1, 1]) {
      const band = limbBand(side, yaw, 'arm');
      add(b, band, smoothPath(limbShape(arm(side, build), yaw, 0.0, o.sleeve, o.sleevePad ?? 3.5, o.sleeveFlare ?? 0)));
    }
  }
  return b;
}
function hemLine(yaw: number, build: Build, y: number, pad: number, flare = 0) {
  const t = torsoShape(yaw, build, y - 1, y, pad, flare);
  const xs = t.map((p) => p[0]);
  return `<path d="M${f(Math.min(...xs) + 3)} ${f(y - 3)} L${f(Math.max(...xs) - 3)} ${f(y - 3)}" stroke="#000" stroke-opacity="0.18" stroke-width="2"/>`;
}
function neckline(yaw: number, kind: 'crew' | 'v' | 'collar' | 'high') {
  const nc = CX + Math.sin(yaw) * 8, fx = Math.max(0.35, Math.cos(yaw));
  switch (kind) {
    case 'v': return `<path d="M${f(nc - 16 * fx)} 286 L${f(nc)} 312 L${f(nc + 16 * fx)} 286" fill="#fff" fill-opacity="0" stroke="#000" stroke-opacity="0.22" stroke-width="2.5"/>`;
    case 'collar': return `<path d="M${f(nc - 20 * fx)} 284 L${f(nc - 4 * fx)} 300 L${f(nc - 22 * fx)} 304Z M${f(nc + 20 * fx)} 284 L${f(nc + 4 * fx)} 300 L${f(nc + 22 * fx)} 304Z" fill="#fff" fill-opacity="0.85" stroke="#000" stroke-opacity="0.2" stroke-width="1.5"/>`;
    case 'high': return '';
    default: return `<path d="M${f(nc - 18 * fx)} 287 Q${f(nc)} 300 ${f(nc + 18 * fx)} 287" fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="3"/>`;
  }
}

/** Cut-out of the neck/chest skin for open necklines: drawn as skin over the garment. */
function neckSkin(yaw: number, kind: 'crew' | 'v') {
  const nc = CX + Math.sin(yaw) * 8, fx = Math.max(0.35, Math.cos(yaw));
  return kind === 'v'
    ? `M${f(nc - 16 * fx)} 284 L${f(nc + 16 * fx)} 284 L${f(nc)} 311Z`
    : `M${f(nc - 18 * fx)} 284 Q${f(nc)} 300 ${f(nc + 18 * fx)} 284Z`;
}

function topGarment(id_: string, fit: Garment['fit'], color: string, o: Parameters<typeof topLike>[2] & { neckline: 'crew' | 'v' | 'collar' | 'high'; extra?: (yaw: number, build: Build) => string; stripes?: boolean }, more: Partial<Garment> = {}): Garment {
  return {
    id: id_, slot: 'top', fit, color, ...more,
    draw(yaw, build) {
      const b = topLike(yaw, build, o);
      const det = neckline(yaw, o.neckline) + hemLine(yaw, build, o.hem, o.pad ?? 3, o.flare ?? 0) + (o.extra?.(yaw, build) ?? '');
      const out = toLayers(b, 'top', yaw, { mid: det });
      return out;
    },
  };
}

export const GARMENTS: Garment[] = [
  // tops
  topGarment('tshirt', 'unisex', '#3f7fd6', { neck: 284, hem: 418, sleeve: 0.3, neckline: 'crew' }),
  topGarment('longsleeve', 'unisex', '#e8e4dc', { neck: 284, hem: 420, sleeve: 0.9, neckline: 'crew' }, { modest: true }),
  topGarment('vneck', 'female', '#d9667a', { neck: 284, hem: 416, sleeve: 0.32, neckline: 'v' }),
  topGarment('blouse', 'female', '#f2efe6', { neck: 284, hem: 424, sleeve: 0.92, pad: 5, flare: 8, sleevePad: 5, sleeveFlare: 4, neckline: 'collar' }, { modest: true }),
  topGarment('shirt', 'male', '#9cc3e6', { neck: 284, hem: 428, sleeve: 0.92, neckline: 'collar',
    extra: (yaw) => Math.abs(yaw) < 1 ? [300, 330, 360, 390].map((y) => `<circle cx="${f(CX + Math.sin(yaw) * 26)}" cy="${y}" r="2.2" fill="#000" fill-opacity="0.25"/>`).join('') : '' }, { modest: true }),
  topGarment('hoodie', 'unisex', '#5c6b7a', { neck: 280, hem: 430, sleeve: 0.95, pad: 7, sleevePad: 6, neckline: 'high',
    extra: (yaw) => Math.abs(yaw) < 1.2 ? `<path d="M${f(CX - 30 * Math.cos(yaw) + Math.sin(yaw) * 26)} 390 h${f(60 * Math.cos(yaw))} l-6 30 h${f(-48 * Math.cos(yaw))}z" fill="#000" fill-opacity="0.1"/><path d="M${f(CX - 10 + Math.sin(yaw) * 28)} 292 l0 34 M${f(CX + 10 + Math.sin(yaw) * 28)} 292 l0 30" stroke="#fff" stroke-opacity="0.8" stroke-width="2" stroke-linecap="round"/>` : '' }, { modest: true }),
  topGarment('kurta', 'unisex', '#c9a227', { neck: 284, hem: 500, sleeve: 0.9, pad: 6, flare: 14, neckline: 'high' }, { modest: true }),
  topGarment('cardigan', 'female', '#e6c34a', { neck: 284, hem: 430, sleeve: 0.92, pad: 6, sleevePad: 5, neckline: 'v',
    extra: (yaw) => Math.abs(yaw) < 1 ? `<path d="M${f(CX + Math.sin(yaw) * 28)} 312 L${f(CX + Math.sin(yaw) * 28)} 428" stroke="#000" stroke-opacity="0.2" stroke-width="2"/>` : '' }, { modest: true }),
  // bottoms
  ...(['jeans', 'trousers', 'shorts', 'skirt', 'long_skirt'] as const).map((k): Garment => ({
    id: k, slot: 'bottom', fit: k.includes('skirt') ? 'female' : 'unisex', modest: k === 'jeans' || k === 'trousers' || k === 'long_skirt',
    color: { jeans: '#3d5a8a', trousers: '#3b3b44', shorts: '#c7b48a', skirt: '#7b4a8c', long_skirt: '#2f4f4f' }[k],
    draw(yaw, build) {
      const b = emptyBands();
      if (k.includes('skirt')) {
        const hem = k === 'skirt' ? 500 : 584;
        add(b, 'mid', smoothPath(torsoShape(yaw, build, 404, hem, 4, k === 'skirt' ? 26 : 34)));
      } else {
        add(b, 'mid', smoothPath(torsoShape(yaw, build, 404, 440, 3)));
        const len = k === 'shorts' ? 0.42 : 0.98;
        for (const side of [-1, 1]) add(b, limbBand(side, yaw, 'leg'), smoothPath(limbShape(leg(side, build), yaw, -0.03, len, k === 'jeans' ? 2.5 : 3.5)));
      }
      const det = k === 'jeans' && Math.abs(yaw) < 1.2 ? `<path d="M${f(CX + Math.sin(yaw) * 24)} 408 l0 26" stroke="#fff" stroke-opacity="0.25" stroke-width="1.6"/>` : '';
      return toLayers(b, 'bottom', yaw, { mid: hemLine(yaw, build, 406, 3) + det });
    },
  })),
  // one-piece outfits
  {
    id: 'abaya', slot: 'outfit', fit: 'female', color: '#1f1f24', modest: true,
    draw(yaw, build) {
      const b = topLike(yaw, build, { neck: 280, hem: 596, sleeve: 1.0, pad: 9, flare: 40, sleevePad: 6, sleeveFlare: 10 });
      const fc = CX + Math.sin(yaw) * 30 * (build === 'female' ? 1 : 1);
      const trim = Math.abs(yaw) < 1.2 ? `<path d="M${f(fc)} 300 L${f(fc + Math.sin(yaw) * 6)} 594" stroke="#c8a85a" stroke-opacity="0.75" stroke-width="2.5"/>` : '';
      return toLayers(b, 'outfit', yaw, { mid: trim }, 0.3);
    },
  },
  {
    id: 'jalabiya', slot: 'outfit', fit: 'unisex', color: '#f1ede4', modest: true,
    draw(yaw, build) {
      const b = topLike(yaw, build, { neck: 282, hem: 590, sleeve: 0.97, pad: 8, flare: 26, sleevePad: 5, sleeveFlare: 6 });
      const fc = CX + Math.sin(yaw) * 30;
      const placket = Math.abs(yaw) < 1.2 ? `<path d="M${f(fc)} 286 L${f(fc)} 340" stroke="#000" stroke-opacity="0.18" stroke-width="2"/>${[300, 314, 328].map((y) => `<circle cx="${f(fc)}" cy="${y}" r="1.8" fill="#000" fill-opacity="0.22"/>`).join('')}` : '';
      return toLayers(b, 'outfit', yaw, { mid: placket }, 0.2);
    },
  },
  {
    id: 'maxi_dress', slot: 'outfit', fit: 'female', color: '#b04a5a', modest: true,
    draw(yaw, build) {
      const b = topLike(yaw, build, { neck: 284, hem: 590, sleeve: 0.92, pad: 4, flare: 46, sleevePad: 4, sleeveFlare: 3 });
      return toLayers(b, 'outfit', yaw, { mid: neckline(yaw, 'crew') + hemLine(yaw, build, 404, 4) }, 0.24);
    },
  },
  {
    id: 'dress', slot: 'outfit', fit: 'female', color: '#e07a3f',
    draw(yaw, build) {
      const b = topLike(yaw, build, { neck: 286, hem: 502, sleeve: 0.28, pad: 3, flare: 34 });
      return toLayers(b, 'outfit', yaw, { mid: neckline(yaw, 'crew') + hemLine(yaw, build, 400, 3) }, 0.24);
    },
  },
  // shoes
  ...(['sneakers', 'boots', 'flats', 'sandals'] as const).map((k): Garment => ({
    id: k, slot: 'shoes', fit: 'unisex', color: { sneakers: '#f4f4f4', boots: '#5a3a28', flats: '#2b2b2b', sandals: '#a8754a' }[k],
    draw(yaw, build) {
      const b = emptyBands();
      const det: Record<Band, string[]> = { back: [], mid: [], front: [] };
      for (const side of [-1, 1]) {
        const band = limbBand(side, yaw, 'leg');
        const a = project(leg(side, build).pts[2], yaw);
        const fwd = Math.sin(yaw) * 16; // toes point toward the face side
        const len = 15 + Math.abs(Math.sin(yaw)) * 9;
        const top = k === 'boots' ? 540 : k === 'sandals' ? 588 : 580;
        const d = smoothPath([[a.x - len * 0.7 + fwd * 0.2, top], [a.x + len * 0.7 + fwd * 0.4, top], [a.x + len + fwd, 598], [a.x + len * 0.9 + fwd, 610], [a.x - len * 0.95 + fwd * 0.2, 610], [a.x - len - 1 + fwd * 0.1, 598]]);
        add(b, band, d);
        det[band].push(`<path d="M${f(a.x - len - 1 + fwd * 0.1)} 606 L${f(a.x + len * 0.95 + fwd)} 606" stroke="#000" stroke-opacity="0.35" stroke-width="4" stroke-linecap="round"/>`);
        if (k === 'sneakers') det[band].push(`<path d="M${f(a.x - 6 + fwd * 0.5)} 588 l10 0 M${f(a.x - 5 + fwd * 0.5)} 593 l10 0" stroke="#000" stroke-opacity="0.25" stroke-width="1.6"/>`);
        if (k === 'sandals') det[band].push(`<path d="M${f(a.x - len * 0.6 + fwd * 0.3)} 594 L${f(a.x + len * 0.6 + fwd * 0.6)} 594" stroke="#000" stroke-opacity="0.3" stroke-width="3"/>`);
      }
      return toLayers(b, 'shoes', yaw, { back: det.back.join(''), mid: det.mid.join(''), front: det.front.join('') }, 0.2);
    },
  })),
];

// ---------------------------------------------------------------- headwear (drawn over the head, hides hair)
import { HEAD, headOutline } from './geom';
export interface Headwear { id: string; fit: 'female' | 'male' | 'unisex'; color: string; hidesHair: boolean; modest?: boolean; draw(yaw: number, build: Build): SubLayer[] }

function faceOpening(yaw: number, scale = 1): string {
  const { cx, cy } = HEAD;
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const fx = cx + s * 54, rx = (72 * c + 30 * Math.abs(s)) * scale, ry = 92 * scale;
  return smoothPath(Array.from({ length: 28 }, (_, i) => {
    const t = (i / 28) * Math.PI * 2;
    const y = cy + 6 + Math.sin(t) * ry;
    const below = Math.max(0, Math.sin(t));
    return [fx + Math.cos(t) * rx * (1 - 0.25 * below * below), y] as Pt;
  }));
}

function hijabLike(yaw: number, build: Build, o: { capScale: number; drapeTo: number; drapePad: number; drapeFlare: number; open: number }): SubLayer[] {
  const s = Math.sin(yaw);
  const cap = smoothPath(headOutline(yaw, o.capScale, 0.3));
  const drape = smoothPath(torsoShape(yaw, build, 250, o.drapeTo, o.drapePad, o.drapeFlare));
  const neck = smoothPath([[CX - 44 + s * 20, 210], [CX + 44 + s * 30, 210], [CX + 52 + s * 30, 270], [CX - 52 + s * 10, 270]]);
  // the face opening never reaches past the head outline (else the background shows through)
  const headClip = id('c');
  const opening = faceOpening(yaw, o.open);
  const holeDefs = `<clipPath id="${headClip}"><path d="${smoothPath(headOutline(yaw, 0.985, 1))}"/></clipPath>`;
  const hole = `<path d="${opening}" fill="black" clip-path="url(#${headClip})"/>`;
  const m = id('m');
  const masked = (inner: string) => `<defs>${holeDefs}<mask id="${m}" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="640"><rect width="400" height="640" fill="white"/>${hole}</mask></defs><g mask="url(#${m})">${inner}</g>`;
  const all = `${cap} ${drape} ${neck}`;
  const m2 = id('m');
  return [
    { kind: 'tint', slot: 'headwear', svg: masked(`<path d="${cap}" fill="${WHITE}"/><path d="${drape}" fill="${WHITE}"/><path d="${neck}" fill="${WHITE}"/>`) },
    { kind: 'detail', svg: `<defs><mask id="${m2}" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="640"><rect width="400" height="640" fill="white"/>${hole}</mask></defs><g mask="url(#${m2})">${shade(all, yaw, { dark: 0.3, light: 0.12 })}
<path d="${opening}" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="7" clip-path="url(#${headClip})"/>
<path d="M${f(CX - 46 + s * 26)} ${f(o.drapeTo - 40)} Q${f(CX + s * 36)} ${f(o.drapeTo - 20)} ${f(CX + 46 + s * 26)} ${f(o.drapeTo - 40)}" fill="none" stroke="#000" stroke-opacity="0.12" stroke-width="3"/></g>` },
  ];
}

/** Head outline points above y, ordered left to right (headOutline starts at the top, so filtering splits it). */
function topArc(yaw: number, scale: number, yCut: number): Pt[] {
  const pts = headOutline(yaw, scale, 0, 96).filter(([, y]) => y < yCut);
  const i = pts.reduce((best, p, k) => (p[0] < pts[best][0] ? k : best), 0);
  const ordered = [...pts.slice(i), ...pts.slice(0, i)];
  return ordered[0][0] < ordered[ordered.length - 1][0] ? ordered : ordered.reverse();
}

export const HEADWEAR: Headwear[] = [
  { id: 'hijab', fit: 'female', color: '#3b4a6b', hidesHair: true, modest: true, draw: (yaw, build) => hijabLike(yaw, build, { capScale: 1.14, drapeTo: 372, drapePad: 14, drapeFlare: 22, open: 1 }) },
  { id: 'amira', fit: 'female', color: '#d9c7b0', hidesHair: true, modest: true, draw: (yaw, build) => hijabLike(yaw, build, { capScale: 1.11, drapeTo: 322, drapePad: 8, drapeFlare: 8, open: 0.97 }) },
  {
    id: 'kufi', fit: 'male', color: '#f2f0ea', hidesHair: false,
    draw(yaw) {
      const top = topArc(yaw, 1.07, HEAD.cy - 52);
      const d = smoothPath([...top, [top[top.length - 1][0], HEAD.cy - 50], [top[0][0], HEAD.cy - 50]]);
      return [{ kind: 'tint', slot: 'headwear', svg: `<path d="${d}" fill="${WHITE}"/>` }, { kind: 'detail', svg: shade(d, yaw, { dark: 0.2 }) + `<path d="M${f(top[0][0])} ${f(HEAD.cy - 52)} L${f(top[top.length - 1][0])} ${f(HEAD.cy - 52)}" stroke="#000" stroke-opacity="0.2" stroke-width="3"/>` }];
    },
  },
  {
    id: 'beanie', fit: 'unisex', color: '#b83b3b', hidesHair: false,
    draw(yaw) {
      const top = topArc(yaw, 1.13, HEAD.cy - 30);
      const d = smoothPath([...top, [top[top.length - 1][0], HEAD.cy - 26], [top[0][0], HEAD.cy - 26]]);
      const band = `<path d="M${f(top[0][0])} ${f(HEAD.cy - 46)} L${f(top[top.length - 1][0])} ${f(HEAD.cy - 46)} L${f(top[top.length - 1][0])} ${f(HEAD.cy - 26)} L${f(top[0][0])} ${f(HEAD.cy - 26)}Z" fill="#000" fill-opacity="0.12"/>`;
      return [{ kind: 'tint', slot: 'headwear', svg: `<path d="${d}" fill="${WHITE}"/>` }, { kind: 'detail', svg: shade(d, yaw, { dark: 0.22 }) + band }];
    },
  },
];
