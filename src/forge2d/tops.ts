// Tops and outerwear (v2): one parametric torso + sleeve builder with volumetric (lit) fabric.
// Dimensional look: each garment is an inflated, lit shape; puffers are built from separately lit quilted cells;
// sleeves bunch at the elbow and cuff; folds, seams and trims are drawn on top of the lit volume.
import { CX, Pt, darken, lerp, lighten, luma, mirrorPts, n2, spline } from './geom';
import type { Ctx } from './types';
import { Arm, HEM, LM, armRibbon, limbShade } from './body';
import { Texture, accentOf, edge, fabricGrad, folds, shadeBlob, stitch, textureOverlay } from './garment';

type Fit = 'fitted' | 'loose' | 'boxy' | 'over';
type Neck = 'crew' | 'v' | 'scoop' | 'turtle' | 'square' | 'boat' | 'collar' | 'henley' | 'hood' | 'lapel' | 'mock' | 'cami';
type Sleeve = 'none' | 'cap' | 'short' | 'three' | 'long';

export interface TopDef {
  id: string; name: string;
  outer?: boolean;
  hem: number; fit: Fit; neck: Neck; sleeve: Sleeve; slack?: number; flare?: number;
  texture?: Texture; cuff?: 'none' | 'rib' | 'band'; hemBand?: boolean;
  open?: number;            // gap at the hem for open-front outerwear
  zip?: boolean; pocket?: 'kangaroo' | 'chest' | 'welt'; buttons?: number; strings?: boolean;
  sleeveTexture?: Texture; tags?: string[];
  dress?: boolean; belt?: boolean; wrap?: boolean; lower?: string; drape?: boolean;
  trim?: { neck?: boolean; yoke?: boolean; cuff?: boolean; hem?: boolean };
  /** quilted puffer cells */
  puff?: boolean;
  /** knotted / tied hem (a crop shirt tied at the waist) */
  knot?: boolean;
}

export const TOPS: TopDef[] = [
  { id: 'tee',         name: 'Fitted tee',       hem: HEM.hip + 6,  fit: 'fitted', neck: 'crew',   sleeve: 'short' },
  { id: 'crop-tee',    name: 'Crop tee',         hem: HEM.crop + 4, fit: 'fitted', neck: 'crew',   sleeve: 'short' },
  { id: 'long-sleeve', name: 'Long-sleeve tee',  hem: HEM.hip + 10, fit: 'fitted', neck: 'crew',   sleeve: 'long', slack: 3.4 },
  { id: 'crop-long',   name: 'Cropped long-sleeve', hem: HEM.crop, fit: 'fitted', neck: 'boat',   sleeve: 'long', slack: 3, tags: [] },
  { id: 'tank',        name: 'Ribbed tank',      hem: HEM.hip - 6,  fit: 'fitted', neck: 'scoop',  sleeve: 'none', texture: 'rib' },
  { id: 'cami',        name: 'Satin cami',       hem: HEM.hip - 18, fit: 'fitted', neck: 'cami',   sleeve: 'none', tags: ['straps'] },
  { id: 'square-crop', name: 'Square-neck crop', hem: HEM.crop - 2, fit: 'fitted', neck: 'square', sleeve: 'long', texture: 'rib', slack: 3 },
  { id: 'turtleneck',  name: 'Turtleneck',       hem: HEM.hip + 12, fit: 'fitted', neck: 'turtle', sleeve: 'long', texture: 'rib', cuff: 'rib', hemBand: true, tags: ['high-neck'] },
  { id: 'sweater',     name: 'Knit sweater',     hem: HEM.low + 6,  fit: 'loose',  neck: 'crew',   sleeve: 'long', slack: 8, texture: 'knit', cuff: 'rib', hemBand: true },
  { id: 'cable-knit',  name: 'Cable knit',       hem: HEM.thigh,    fit: 'over',   neck: 'crew',   sleeve: 'long', slack: 11, texture: 'cable', cuff: 'rib', hemBand: true },
  { id: 'hoodie',      name: 'Hoodie',           hem: HEM.low + 12, fit: 'loose',  neck: 'hood',   sleeve: 'long', slack: 8, pocket: 'kangaroo', strings: true, cuff: 'rib', hemBand: true, tags: ['hood'] },
  { id: 'crop-hoodie', name: 'Cropped hoodie',   hem: HEM.waist + 22, fit: 'boxy', neck: 'hood',   sleeve: 'long', slack: 8, strings: true, cuff: 'rib', hemBand: true, tags: ['hood'] },
  { id: 'breton',      name: 'Striped tee',      hem: HEM.hip + 8,  fit: 'fitted', neck: 'boat',   sleeve: 'three', texture: 'stripe', slack: 3 },
  { id: 'blouse',      name: 'Flowy blouse',     hem: HEM.low,      fit: 'loose',  neck: 'v',      sleeve: 'three', slack: 8, flare: 8 },
  { id: 'shirt',       name: 'Button shirt',     hem: HEM.low + 6,  fit: 'boxy',   neck: 'collar', sleeve: 'long', slack: 6, buttons: 6, cuff: 'band' },
  { id: 'knot-shirt',  name: 'Knotted shirt',    hem: HEM.waist + 10, fit: 'boxy', neck: 'collar', sleeve: 'short', slack: 7, buttons: 4, knot: true },
  { id: 'henley',      name: 'Henley',           hem: HEM.hip + 12, fit: 'fitted', neck: 'henley', sleeve: 'long', texture: 'rib', buttons: 3, cuff: 'rib' },
  { id: 'polo',        name: 'Knit polo',        hem: HEM.hip + 6,  fit: 'fitted', neck: 'collar', sleeve: 'short', texture: 'rib', buttons: 2 },
];

export const OUTER: TopDef[] = [
  { id: 'puffer-crop', name: 'Cropped puffer',  outer: true, hem: HEM.hip + 2, fit: 'boxy',  neck: 'mock',  sleeve: 'long', slack: 10, puff: true, zip: true, cuff: 'rib', hemBand: true, tags: ['high-neck', 'bulky'] },
  { id: 'puffer-long', name: 'Long puffer',     outer: true, hem: 540,          fit: 'boxy',  neck: 'mock',  sleeve: 'long', slack: 11, flare: 12, puff: true, zip: true, cuff: 'rib', tags: ['high-neck', 'bulky', 'long'] },
  { id: 'puffer-vest', name: 'Puffer vest',     outer: true, hem: HEM.hip + 10, fit: 'boxy',  neck: 'mock',  sleeve: 'none', puff: true, zip: true, tags: ['high-neck'] },
  { id: 'denim-jacket',name: 'Denim jacket',    outer: true, hem: HEM.hip + 4, fit: 'boxy',  neck: 'collar',sleeve: 'long', slack: 7, texture: 'denim', open: 10, cuff: 'band', pocket: 'chest' },
  { id: 'blazer',      name: 'Blazer',          outer: true, hem: HEM.low + 12, fit: 'fitted',neck: 'lapel', sleeve: 'long', slack: 5, open: 18, cuff: 'none', pocket: 'welt', tags: ['formal'] },
  { id: 'cardigan',    name: 'Open cardigan',   outer: true, hem: HEM.thigh + 6, fit: 'loose', neck: 'v',     sleeve: 'long', slack: 9, texture: 'knit', open: 12, cuff: 'rib', hemBand: true },
  { id: 'bomber',      name: 'Bomber jacket',   outer: true, hem: HEM.hip + 2, fit: 'boxy',  neck: 'mock',  sleeve: 'long', slack: 9, zip: true, cuff: 'rib', hemBand: true },
  { id: 'zip-hoodie',  name: 'Zip hoodie',      outer: true, hem: HEM.low + 14, fit: 'loose', neck: 'hood',  sleeve: 'long', slack: 8, open: 6, pocket: 'kangaroo', strings: true, cuff: 'rib', hemBand: true, tags: ['hood'] },
  { id: 'long-coat',   name: 'Long coat',       outer: true, hem: 590,          fit: 'fitted',neck: 'lapel', sleeve: 'long', slack: 6, flare: 20, open: 24, cuff: 'none', tags: ['formal', 'long'] },
];

export const TOP_BY_ID = Object.fromEntries([...TOPS, ...OUTER].map((t) => [t.id, t]));
export const regTop = (d: TopDef) => { TOP_BY_ID[d.id] = d; };

const N0 = LM.neckBase;
const FIT: Record<Fit, [number, number][]> = {
  fitted: [[LM.armpit, 46], [LM.waist, 37], [LM.hip, 47]],
  loose:  [[LM.armpit, 52], [LM.waist, 49], [LM.hip, 54]],
  boxy:   [[LM.armpit, 54], [LM.waist, 53], [LM.hip, 56]],
  over:   [[LM.armpit, 59], [LM.waist, 60], [LM.hip, 63]],
};
export const hwAt = (def: TopDef, y: number) => {
  const a = FIT[def.fit];
  const flare = def.flare ?? 0;
  if (y <= a[0][0]) return a[0][1] - 0.25 * (a[0][0] - y);
  for (let i = 1; i < a.length; i++) if (y <= a[i][0]) return lerp(a[i - 1][1], a[i][1], (y - a[i - 1][0]) / (a[i][0] - a[i - 1][0]));
  return a[a.length - 1][1] + flare * ((y - LM.hip) / 100);
};

const NECK: Record<Neck, { nw: number; depth: number }> = {
  crew: { nw: 20, depth: 11 }, v: { nw: 17, depth: 34 }, scoop: { nw: 25, depth: 22 }, turtle: { nw: 16, depth: 4 },
  square: { nw: 26, depth: 22 }, boat: { nw: 38, depth: 6 }, collar: { nw: 18, depth: 15 }, henley: { nw: 19.5, depth: 12 },
  hood: { nw: 22, depth: 9 }, lapel: { nw: 17, depth: 40 }, mock: { nw: 16.5, depth: 2 }, cami: { nw: 25, depth: 30 },
};
const SLEEVE_T: Record<Sleeve, number> = { none: 0, cap: 0.12, short: 0.33, three: 0.76, long: 0.985 };

function envelopePts(def: TopDef): Pt[] {
  const sleeveless = def.sleeve === 'none';
  const nk = NECK[def.neck];
  const S: Pt = sleeveless ? [CX + 41, LM.shoulder + 2] : def.fit === 'over' ? [CX + 63, LM.shoulder + 8] : [CX + 58, LM.shoulder + 3];
  const pts: Pt[] = [[CX + nk.nw, N0 + (def.neck === 'boat' ? 4 : 0)]];
  if (!sleeveless) pts.push([CX + lerp(nk.nw, S[0] - CX, 0.55), def.neck === 'boat' ? N0 + 7 : N0 + 3]);
  pts.push(S);
  const ys: number[] = [];
  for (let y = LM.armpit; y < def.hem - 14; y += 26) ys.push(y);
  ys.push(def.hem);
  ys.forEach((y) => pts.push([CX + hwAt(def, y), y]));
  return pts;
}

function neckPath(def: TopDef, left: Pt, right: Pt): string {
  const nk = NECK[def.neck];
  const by = N0 + nk.depth;
  switch (def.neck) {
    case 'v': case 'lapel': return `L${n2(CX)},${n2(by)}L${right[0]},${right[1]}`;
    case 'cami': return `Q${CX},${n2(by + 4)} ${right[0]},${right[1]}`;
    case 'square': return `L${n2(left[0])},${n2(by)}L${n2(right[0])},${n2(by)}L${right[0]},${right[1]}`;
    case 'boat': return `Q${CX},${n2(by + 2)} ${right[0]},${right[1]}`;
    default: return `C${n2(left[0] + nk.nw * 0.2)},${n2(by + 1)} ${n2(right[0] - nk.nw * 0.2)},${n2(by + 1)} ${right[0]},${right[1]}`;
  }
}

/** Whole-torso silhouette (closed). */
function torsoShape(def: TopDef): string {
  const R = envelopePts(def);
  const hemC = def.hem + (def.hemBand ? 0 : 5);
  const last = R[R.length - 1];
  const leftNeck = mirrorPts([R[0]])[0];
  const full: Pt[] = [...R, [CX + (last[0] - CX) * 0.4, hemC], [CX, hemC + 1], [CX - (last[0] - CX) * 0.4, hemC], ...mirrorPts(R.slice(1)).reverse(), leftNeck];
  return spline(full, false, 1 / 7) + neckPath(def, leftNeck, R[0]) + 'Z';
}

/** Right front panel of an open jacket; side=-1 mirrors it. */
function panelShape(def: TopDef, side: 1 | -1): string {
  const R = envelopePts(def);
  const gap = def.open ?? 0;
  const g0 = def.neck === 'lapel' ? 6 : 3;
  const nk = NECK[def.neck];
  const inner: Pt[] = [];
  const ys = [N0 + nk.depth, LM.bust + 6, LM.waist - 6, def.hem];
  ys.forEach((y, i) => inner.push([CX + lerp(g0, gap / 2 + 1, i / (ys.length - 1)), y + (i === ys.length - 1 ? 2 : 0)]));
  const lastR = R[R.length - 1];
  const pts: Pt[] = [...R.slice(0, -1), [lastR[0], def.hem + 2]];
  const p = side === 1 ? pts : mirrorPts(pts);
  const inn = side === 1 ? inner : mirrorPts(inner);
  const top: Pt = side === 1 ? [CX + g0, N0 + 2] : [CX - g0, N0 + 2];
  const chain = spline(p, false, 1 / 7);
  const back = spline([...inn].reverse(), false, 1 / 7, false);
  return `${chain}L${n2(inn[inn.length - 1][0])},${n2(inn[inn.length - 1][1])}${back}L${n2(top[0])},${n2(top[1])}Z`;
}

/** One lit "cell" of a puffer (rounded band between two heights following the silhouette). */
function puffCell(def: TopDef, y0: number, y1: number, side: 0 | 1 | -1, gapIn: number): string {
  const hw0 = hwAt(def, y0) - 0.6, hw1 = hwAt(def, y1) - 0.6;
  const bulge = 3.4;
  const gx = side === 0 ? 0 : gapIn;
  const x0 = side === 0 ? -hw0 : side === 1 ? gx : -hw0, x1 = side === 0 ? hw0 : side === 1 ? hw0 : -gx;
  const xa = side === -1 ? -hw0 : x0, xb = side === -1 ? -gx : x1;
  const bx0 = side === -1 ? -hw1 : side === 1 ? gx : -hw1, bx1 = side === -1 ? -gx : hw1;
  const top = `M${n2(CX + xa)},${n2(y0 + 1)}Q${n2(CX + (xa + xb) / 2)},${n2(y0 - 1.2)} ${n2(CX + xb)},${n2(y0 + 1)}`;
  const right = `Q${n2(CX + xb + (side === -1 ? -1 : 2.6))},${n2((y0 + y1) / 2)} ${n2(CX + bx1)},${n2(y1 - 1)}`;
  const bottom = `Q${n2(CX + (bx0 + bx1) / 2)},${n2(y1 + bulge)} ${n2(CX + bx0)},${n2(y1 - 1)}`;
  const left = `Q${n2(CX + xa - (side === -1 ? 2.6 : -1))},${n2((y0 + y1) / 2)} ${n2(CX + xa)},${n2(y0 + 1)}Z`;
  return top + right + bottom + left;
}

export function renderTopTorso(c: Ctx, def: TopDef, color: string): string {
  const acc = accentOf(color);
  const stroke = edge(color);
  const open = !!def.open;
  const shapes = open ? [panelShape(def, 1), panelShape(def, -1)] : [torsoShape(def)];
  const clip = c.d.clip(shapes.map((s) => `<path d="${s}"/>`).join(''));
  const maxHW = hwAt(def, def.hem) + 4;
  const fill = fabricGrad(c, color, CX - Math.max(62, maxHW), CX + Math.max(62, maxHW));
  const y0 = N0 - 4, hgt = def.hem - N0 + 12;
  const bulk = def.fit === 'over' || def.puff ? 1.35 : def.fit === 'boxy' || def.fit === 'loose' ? 1.15 : 1;
  let out = '';
  if (def.neck === 'hood') out += renderCowl(c, color);
  // soft contact shadow on whatever is underneath
  if (def.outer || def.dress) for (const s of shapes) out += c.d.shadowOf(s, '#1a1020', 0.2, 2, 4, 3.4);

  if (def.puff) {
    // dark seam colour underneath, then every cell lit in ONE pass (the gaps become grooves in the height map)
    for (const s of shapes) out += `<path d="${s}" fill="${darken(color, 0.22)}" stroke="${stroke}" stroke-width="1.1" stroke-linejoin="round"/>`;
    const cellH = 24;
    const top = N0 + 10;
    const litO = { blur: 4.6, scale: 5 * bulk, spec: 0.25 };
    let cells = '';
    const cellPaths: string[] = [];
    for (let y = top; y < def.hem - 4; y += cellH) {
      const y1 = Math.min(y + cellH, def.hem);
      const sides = open || def.zip ? [1, -1] as const : [0] as const;
      for (const sd of sides) {
        const gapIn = open ? (def.open ?? 0) / 2 + 1 : 1.4;
        const cp = puffCell(def, y, y1, sd, gapIn);
        cellPaths.push(cp);
        cells += `<path d="${cp}" fill="${fill}"/>`;
      }
    }
    // all cells share one lighting pass: the gaps between them become grooves in the height map
    out += c.d.volume(`<g clip-path="${clip}">${cells}</g>`, cellPaths, litO);
    out += `<g clip-path="${clip}"><rect x="${CX - 100}" y="${top - 8}" width="200" height="${def.hem - top + 16}" fill="${c.d.pattern(6, 6, `<circle cx="1" cy="1" r=".5" fill="${lighten(color, 0.25)}" opacity=".35"/>`)}" opacity=".5"/></g>`;
  } else {
    const litO = { blur: 6 * bulk, scale: 4 * bulk, spec: luma(color) > 0.6 ? 0.12 : 0.22 };
    out += c.d.volume(shapes.map((s) => `<path d="${s}" fill="${fill}"/>`).join('') +
      textureOverlay(c, def.texture ?? 'plain', color, clip, CX - maxHW - 6, y0, maxHW * 2 + 12, hgt, def.texture === 'stripe' ? '#f3f0ea' : undefined), shapes, litO);
    for (const s of shapes) out += `<path d="${s}" fill="none" stroke="${stroke}" stroke-width="1" stroke-linejoin="round" opacity=".8"/>`;
  }
  // folds + soft shading
  const fl: Pt[][] = [
    [[CX - 32, LM.armpit + 10], [CX - 28, LM.waist], [CX - 33, def.hem - 6]],
    [[CX + 30, LM.armpit + 6], [CX + 32, LM.waist + 2], [CX + 35, def.hem - 8]],
    [[CX - 9, LM.waist - 20], [CX - 6, LM.waist + 10], [CX - 10, def.hem - 6]],
  ];
  if (def.hem > LM.waist + 6 && !def.puff) out += folds(c, fl, color, clip, def.fit === 'fitted' ? 0.5 : 0.95);
  out += `<g clip-path="${clip}">` +
    shadeBlob(c, CX + 48, LM.armpit + 12, 11, 26, darken(color, 0.34), 0.28, 4) +
    shadeBlob(c, CX, def.hem + 2, 58, 8, darken(color, 0.3), 0.28, 4) +
    (def.fit === 'fitted' && !open && !def.puff ? shadeBlob(c, CX - 14, LM.bust + 8, 11, 9, lighten(color, 0.24), 0.3, 4) + shadeBlob(c, CX + 15, LM.bust + 10, 11, 9, lighten(color, 0.12), 0.16, 4) + shadeBlob(c, CX, LM.bust + 30, 27, 5, darken(color, 0.34), 0.16, 4) : '') +
    `</g>`;
  if (def.hemBand) {
    const hw = hwAt(def, def.hem);
    out += `<g clip-path="${clip}"><rect x="${CX - 80}" y="${def.hem - 9}" width="160" height="18" fill="${darken(color, 0.03)}" opacity=".95"/>` +
      textureOverlay(c, 'rib', color, clip, CX - hw - 4, def.hem - 9, hw * 2 + 8, 18) +
      `<path d="M${CX - 80},${def.hem - 9}H${CX + 80}" stroke="${darken(color, 0.3)}" stroke-width=".9" opacity=".6"/></g>`;
  }
  if (def.knot) {
    // shirt tied in a knot at the front: two tails and a twisted bundle
    const ky = def.hem - 12;
    out += `<g><path d="M${CX - 4},${ky}Q${CX - 22},${ky + 6} ${CX - 24},${ky + 22}Q${CX - 10},${ky + 14} ${CX - 2},${ky + 6}Z" fill="${fill}" stroke="${stroke}" stroke-width=".9"/><path d="M${CX + 4},${ky}Q${CX + 22},${ky + 4} ${CX + 26},${ky + 20}Q${CX + 12},${ky + 14} ${CX + 2},${ky + 6}Z" fill="${fill}" stroke="${stroke}" stroke-width=".9"/><ellipse cx="${CX}" cy="${ky + 2}" rx="7" ry="6" fill="${darken(color, 0.04)}" stroke="${stroke}" stroke-width=".9"/><path d="M${CX - 4},${ky - 1}Q${CX},${ky + 3} ${CX + 4},${ky}" stroke="${darken(color, 0.34)}" fill="none" stroke-width="1"/></g>`;
  }
  out += details(c, def, color, acc, clip, open);
  out += extras(c, def, color, clip);
  return out;
}

export const trimColor = (color: string) => (luma(color) < 0.5 ? '#dbb757' : darken(color, 0.28));
const trimPattern = (c: Ctx, col: string, bg: string) => c.d.pattern(8, 8, `<rect width="8" height="8" fill="${bg}"/><path d="M4,.8L7.2,4L4,7.2L.8,4Z" fill="${col}" opacity=".95"/><path d="M4,2.6L5.4,4L4,5.4L2.6,4Z" fill="${bg}"/>`);

/** Belts, wraps, embroidered trims and slits for dresses and tunics. */
function extras(c: Ctx, def: TopDef, color: string, clip: string): string {
  let out = '';
  const dk = darken(color, 0.3);
  const wy = LM.waist - 14;
  if (def.belt) {
    const w = hwAt(def, LM.waist) + 1.5;
    const bc = luma(color) > 0.6 ? darken(color, 0.3) : lighten(color, 0.16);
    out += `<g clip-path="${clip}"><path d="M${CX - w},${wy - 1}Q${CX},${wy + 4} ${CX + w},${wy - 1}V${wy + 11}Q${CX},${wy + 16} ${CX - w},${wy + 11}Z" fill="${bc}" stroke="${darken(bc, 0.3)}" stroke-width=".8"/></g><rect x="${CX - 5}" y="${wy + 1}" width="10" height="9" rx="2" fill="#dcc27a" stroke="#9a7f3a" stroke-width=".7"/><rect x="${CX - 2.6}" y="${wy + 3.2}" width="5.2" height="4.6" rx="1" fill="none" stroke="#9a7f3a" stroke-width=".7"/>`;
  }
  if (def.wrap) {
    out += `<g clip-path="${clip}"><path d="M${CX + 17},${N0 + 2}L${CX - 36},${LM.waist}" stroke="${dk}" stroke-width="1.6" opacity=".6" fill="none"/><path d="M${CX - 17},${N0 + 4}L${CX + 30},${LM.waist}" stroke="${dk}" stroke-width="1.2" opacity=".35" fill="none"/><path d="M${CX + 17},${N0 + 2}L${CX - 36},${LM.waist}L${CX - 5},${LM.waist + 4}L${CX + 26},${LM.bust - 8}Z" fill="${darken(color, 0.06)}" opacity=".5"/><path d="M${CX - 33},${LM.waist}L${CX - 24},${def.hem}" stroke="${dk}" stroke-width="1.2" opacity=".5" fill="none"/></g>`;
  }
  if (def.trim) {
    const gold = trimColor(color);
    const bg = darken(color, 0.1);
    const pat = trimPattern(c, gold, bg);
    if (def.trim.yoke) out += `<g clip-path="${clip}"><path d="M${CX - 9},${N0}V${LM.bust + 36}L${CX},${LM.bust + 44}L${CX + 9},${LM.bust + 36}V${N0}Z" fill="${pat}" stroke="${darken(gold, 0.2)}" stroke-width=".7"/><path d="M${CX - 30},${N0 + 10}Q${CX},${N0 + 30} ${CX + 30},${N0 + 10}" fill="none" stroke="${gold}" stroke-width="2.4"/></g>`;
    if (def.trim.hem) out += `<g clip-path="${clip}"><rect x="${CX - 140}" y="${def.hem - 16}" width="280" height="22" fill="${pat}"/><path d="M${CX - 140},${def.hem - 16}H${CX + 140}" stroke="${gold}" stroke-width="1.6"/></g>`;
  }
  return out;
}

function renderCowl(c: Ctx, color: string): string {
  const outer = spline([[CX - 38, N0], [CX - 36, N0 + 22], [CX - 17, N0 + 41], [CX, N0 + 44], [CX + 17, N0 + 41], [CX + 36, N0 + 22], [CX + 38, N0]], false);
  const inner = spline([[CX + 23, N0], [CX + 17, N0 + 22], [CX, N0 + 29], [CX - 17, N0 + 22], [CX - 23, N0]], false, 1 / 6, false);
  const cowl = `${outer}L${CX + 23},${N0}${inner}Z`;
  return c.d.volume(`<path d="${cowl}" fill="${fabricGrad(c, darken(color, 0.04))}"/>`, [cowl], { blur: 3.4, scale: 5, spec: 0.2 }) + `<path d="${cowl}" fill="none" stroke="${edge(color)}" stroke-width="1"/>`;
}

function details(c: Ctx, def: TopDef, color: string, acc: string, clip: string, open: boolean): string {
  const st = darken(color, 0.32);
  let out = '';
  const nk = NECK[def.neck];
  const dark = luma(color) < 0.45;
  const line = dark ? lighten(color, 0.22) : darken(color, 0.26);
  switch (def.neck) {
    case 'crew': case 'henley': case 'scoop': case 'square': case 'boat': case 'cami': {
      const L: Pt = [CX - nk.nw, N0], R: Pt = [CX + nk.nw, N0];
      const np = `M${L[0]},${L[1]}` + neckPath(def, L, R).replace(/Z$/, '');
      out += `<path d="${np}" fill="none" stroke="${darken(color, 0.1)}" stroke-width="${def.neck === 'cami' ? 1.2 : 3.6}" stroke-linecap="round" opacity=".95"/>`;
      if (def.neck !== 'cami') out += `<path d="${np}" fill="none" stroke="${st}" stroke-width=".8" opacity=".5" transform="translate(0 2)"/>`;
      break;
    }
    case 'turtle': case 'mock': {
      const top = def.neck === 'mock' ? N0 - 22 : N0 - 28;
      const col = spline([[CX - 20, N0 + 2], [CX - 19.5, N0 - 10], [CX - 17, top], [CX + 17, top], [CX + 19.5, N0 - 10], [CX + 20, N0 + 2]], false, 1 / 6);
      const band = `${col}C${CX + 12},${N0 + 12} ${CX - 12},${N0 + 12} ${CX - 20},${N0 + 2}Z`;
      out += `<path d="${band}" fill="${fabricGrad(c, color, CX - 22, CX + 22)}"/><path d="${band}" fill="none" stroke="${edge(color)}" stroke-width="1.1" stroke-linejoin="round"/>`;
      out += textureOverlay(c, def.puff ? 'plain' : 'rib', color, c.d.clip(`<path d="${band}"/>`), CX - 24, top - 4, 48, 50);
      out += `<path d="M${CX - 19},${top + 8}Q${CX},${top + 12} ${CX + 19},${top + 8}" fill="none" stroke="${st}" stroke-width=".9" opacity=".5"/>`;
      break;
    }
    case 'collar': case 'lapel': {
      const lap = def.neck === 'lapel';
      for (const s of [-1, 1] as const) {
        const pts: Pt[] = lap
          ? [[CX + s * 3, N0 + 31], [CX + s * 9, N0 + 9], [CX + s * 21, N0 - 4], [CX + s * 31, N0 + 14], [CX + s * 22, N0 + 35], [CX + s * 10, N0 + 49]]
          : [[CX + s * 2, N0 + 17], [CX + s * 6, N0 + 3], [CX + s * 17, N0 - 5], [CX + s * 27, N0 + 11], [CX + s * 16, N0 + 21]];
        const p = spline(pts, true, 1 / 6);
        out += `<path d="${p}" fill="${fabricGrad(c, lighten(color, 0.04), CX - 30, CX + 30)}"/><path d="${p}" fill="none" stroke="${edge(color)}" stroke-width="1.1" stroke-linejoin="round"/>`;
      }
      out += `<path d="M${CX - 14},${N0 - 4}Q${CX},${N0 + 5} ${CX + 14},${N0 - 4}" fill="none" stroke="${st}" stroke-width="1" opacity=".5"/>`;
      break;
    }
    case 'hood': {
      if (def.strings) for (const s of [-1, 1] as const) out += `<path d="M${CX + s * 8},${N0 + 30}Q${CX + s * 9},${N0 + 54} ${CX + s * 7},${N0 + 74}" fill="none" stroke="${lighten(color, 0.3)}" stroke-width="1.8" stroke-linecap="round"/><circle cx="${CX + s * 7}" cy="${N0 + 75}" r="1.8" fill="${lighten(color, 0.3)}"/>`;
      break;
    }
    case 'v': {
      if (def.outer) break;
      out += `<path d="M${CX - 17},${N0}L${CX},${N0 + nk.depth}L${CX + 17},${N0}" fill="none" stroke="${darken(color, 0.1)}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
      break;
    }
  }
  const cy0 = def.neck === 'lapel' ? N0 + 48 : N0 + nk.depth;
  if (def.zip) {
    out += `<path d="M${CX},${def.neck === 'mock' ? N0 + 10 : cy0}V${def.hem}" stroke="${darken(color, 0.34)}" stroke-width="1.6"/><path d="M${CX},${cy0}V${def.hem}" stroke="${lighten(color, 0.3)}" stroke-width=".8" stroke-dasharray="1.2 1.2"/><rect x="${CX - 2.4}" y="${cy0 + 1}" width="4.8" height="7" rx="1.4" fill="#cdd1d8" stroke="#8c9097" stroke-width=".6"/>`;
  } else if (def.buttons && !def.knot) {
    const n = def.buttons;
    const y1 = def.neck === 'collar' && !def.outer ? N0 + 20 : cy0 + 6;
    const y2 = def.neck === 'henley' || (def.neck === 'collar' && def.hem < LM.hip) ? y1 + 12 * n : def.hem - 14;
    out += `<path d="M${CX},${y1 - 6}V${Math.min(y2 + 6, def.hem)}" stroke="${line}" stroke-width=".9" opacity=".5"/>`;
    out += `<rect x="${CX - 5}" y="${y1 - 6}" width="10" height="${Math.min(y2 + 6, def.hem) - y1 + 6}" fill="${darken(color, 0.04)}" opacity=".35"/>`;
    for (let i = 0; i < n; i++) {
      const y = lerp(y1, y2, n === 1 ? 0 : i / (n - 1));
      out += `<circle cx="${CX}" cy="${n2(y)}" r="1.9" fill="${dark ? '#e8e2d6' : '#f3efe6'}" stroke="${darken(color, 0.35)}" stroke-width=".6"/>`;
    }
  } else if (def.buttons && def.knot) {
    for (let i = 0; i < def.buttons; i++) out += `<circle cx="${CX}" cy="${N0 + 24 + i * 12}" r="1.9" fill="#f3efe6" stroke="${darken(color, 0.35)}" stroke-width=".6"/>`;
  } else if (!open && (def.neck === 'collar' || def.neck === 'lapel')) {
    out += `<path d="M${CX},${N0 + 17}V${def.hem}" stroke="${st}" stroke-width=".8" opacity=".45"/>`;
  }
  if (open) {
    const gap = def.open ?? 0;
    for (const s of [-1, 1] as const) out += `<path d="M${CX + s * 3},${def.neck === 'lapel' ? N0 + 47 : N0 + 2 + nk.depth}L${CX + s * (gap / 2 + 1)},${def.hem + 1}" fill="none" stroke="${darken(color, 0.34)}" stroke-width="1.1" opacity=".5"/>`;
  }
  if (def.pocket === 'kangaroo') {
    const p = `M${CX - 35},${def.hem - 44}L${CX + 35},${def.hem - 44}L${CX + 41},${def.hem - 9}L${CX - 41},${def.hem - 9}Z`;
    out += `<path d="${p}" fill="${darken(color, 0.03)}" opacity=".45" stroke="${st}" stroke-width=".9" stroke-linejoin="round"/>` + stitch(`M${CX - 33},${def.hem - 42}L${CX + 33},${def.hem - 42}`, line, 0.4);
    out += `<path d="M${CX - 34},${def.hem - 40}L${CX - 31},${def.hem - 12}M${CX + 34},${def.hem - 40}L${CX + 31},${def.hem - 12}" stroke="${st}" stroke-width="1.1" opacity=".5" fill="none"/>`;
  } else if (def.pocket === 'chest') {
    for (const s of [-1, 1] as const) {
      const x = CX + s * 26, py = LM.bust + 2;
      out += `<path d="M${x - 9},${py}h18v18l-9,6l-9,-6Z" fill="${darken(color, 0.02)}" opacity=".5" stroke="${st}" stroke-width=".9"/>` + stitch(`M${x - 7},${py + 2}h14v15l-7,5l-7,-5Z`, line, 0.5, 0.7);
    }
  } else if (def.pocket === 'welt') {
    for (const s of [-1, 1] as const) out += `<path d="M${CX + s * 31},${def.hem - 38}l${s * 10},3" stroke="${st}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`;
  }
  out += `<path d="M${CX - 56},${LM.shoulder + 6}Q${CX - 46},${LM.armpit} ${CX - hwAt(def, LM.waist) + 1},${LM.waist}M${CX + 56},${LM.shoulder + 6}Q${CX + 46},${LM.armpit} ${CX + hwAt(def, LM.waist) - 1},${LM.waist}" fill="none" stroke="${st}" stroke-width=".8" opacity=".26"/>`;
  void clip;
  return out;
}

/** Sleeve over an arm, in the garment's colours; puffer sleeves are separately lit tubes. */
export function renderSleeve(c: Ctx, def: TopDef, color: string, arm: Arm): string {
  const tEnd = SLEEVE_T[def.sleeve];
  if (tEnd <= 0) return '';
  const slack = def.slack ?? (def.fit === 'fitted' ? 3.4 : 6);
  const flare = def.flare && def.sleeve === 'three' ? def.flare : 0;
  const extra = (t: number) => slack + flare * Math.pow(t / tEnd, 3) + (def.fit === 'over' ? 1.5 : 0);
  const stroke = edge(color);
  let out = '';
  if (def.puff) {
    const n = 5;
    const litO = { blur: 3.8, scale: 4.6, spec: 0.22 };
    let fills = '', lines = '';
    const segPaths: string[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = (tEnd * i) / n, t1 = (tEnd * (i + 1)) / n;
      const r = armRibbon(arm, t0 + 0.006, t1 - 0.006, (t) => extra(t) + 1.4);
      segPaths.push(r.d);
      fills += `<path d="${r.d}" fill="${fabricGrad(c, color, 0, 400)}"/>`;
      lines += `<path d="${r.d}" fill="none" stroke="${stroke}" stroke-width=".9" opacity=".6"/>`;
    }
    out += `<path d="${armRibbon(arm, 0, tEnd, (t) => extra(t) + 1.4).d}" fill="${darken(color, 0.22)}"/>${c.d.volume(fills, segPaths, litO)}${lines}`;
  } else {
    const r = armRibbon(arm, 0, tEnd, extra);
    const clip = c.d.clip(`<path d="${r.d}"/>`);
    out += c.d.volume(`<path d="${r.d}" fill="${fabricGrad(c, color, 0, 400)}"/>${textureOverlay(c, def.sleeveTexture ?? def.texture ?? 'plain', color, clip, 0, 0, 400, 560, def.texture === 'stripe' ? '#f3f0ea' : undefined)}`, [r.d], { blur: 4.4 + slack * 0.14, scale: 3.6, spec: luma(color) > 0.6 ? 0.1 : 0.2 });
    out += `<path d="${r.d}" fill="none" stroke="${stroke}" stroke-width="1" stroke-linejoin="round" opacity=".8"/>`;
    out += limbShade(c, r.pts, r.wid, r.d, darken(color, 0.34), lighten(color, 0.2), 1.1);
  }
  // elbow creases and bunched fabric above the cuff for loose sleeves
  if (slack > 5 && tEnd > 0.6) {
    const e = arm.pts[12];
    out += `<path d="M${n2(e[0] - 8)},${n2(e[1] - 3)}q8,3.4 16,0M${n2(e[0] - 7)},${n2(e[1] + 4)}q7,2.6 14,0" fill="none" stroke="${darken(color, 0.34)}" stroke-width="1.1" stroke-linecap="round" opacity=".3"/>`;
    if (tEnd > 0.9 && def.cuff && def.cuff !== 'none') {
      for (let k = 0; k < 3; k++) {
        const i = arm.t.findIndex((t) => t >= 0.84 + k * 0.035);
        const p = arm.pts[Math.max(0, i)], w = arm.width(arm.t[Math.max(0, i)]) + slack;
        const a = arm.pts[Math.min(arm.pts.length - 1, Math.max(0, i) + 1)];
        const ang = Math.atan2(a[1] - p[1], a[0] - p[0]) + Math.PI / 2;
        const dx = Math.cos(ang) * w * 0.5, dy = Math.sin(ang) * w * 0.5;
        out += `<path d="M${n2(p[0] - dx)},${n2(p[1] - dy)}Q${n2(p[0] + Math.cos(ang - Math.PI / 2) * 2)},${n2(p[1] + Math.sin(ang - Math.PI / 2) * 2)} ${n2(p[0] + dx)},${n2(p[1] + dy)}" fill="none" stroke="${darken(color, 0.34)}" stroke-width="1" opacity="${n2(0.28 - k * 0.06)}"/>`;
      }
    }
  }
  const cuff = def.cuff ?? 'none';
  if (cuff !== 'none' && tEnd >= 0.9) {
    const rc = armRibbon(arm, tEnd - 0.085, tEnd, (t) => extra(t) * (cuff === 'rib' ? 0.45 : 0.6) + 0.6);
    out += `<path d="${rc.d}" fill="${darken(color, 0.05)}"/><path d="${rc.d}" fill="none" stroke="${stroke}" stroke-width="1"/>`;
    out += textureOverlay(c, cuff === 'rib' ? 'rib' : 'plain', color, c.d.clip(`<path d="${rc.d}"/>`), 0, 0, 400, 560);
  }
  if (def.trim?.cuff && tEnd >= 0.9) {
    const gold = trimColor(color);
    const rc = armRibbon(arm, tEnd - 0.1, tEnd, (t) => extra(t) + 0.3);
    out += `<path d="${rc.d}" fill="${trimPattern(c, gold, darken(color, 0.1))}" stroke="${gold}" stroke-width=".9"/>`;
  }
  void accentOf;
  return out;
}

export const topIds = TOPS.map((t) => t.id);
export const outerIds = OUTER.map((t) => t.id);
