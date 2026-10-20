// Bottoms (v2): baggy, lit trousers and jeans, shorts and skirts, authored against the body landmarks.
// Legs are lit as one inflated volume; wide cuts pool in wrinkles at the hem and sit over chunky footwear.
import { CX, Pt, darken, lerp, lighten, luma, n2, spline, symPath } from './geom';
import { LM, legAxis, torsoHW } from './body';
import type { Ctx } from './types';
import { Texture, edge, fabricGrad, folds, shadeBlob, stitch, textureOverlay } from './garment';

export interface BottomDef {
  id: string; name: string; kind: 'pants' | 'shorts' | 'skirt';
  rise: number;                   // y of the waistband top
  hem: number;
  legs?: [number, number][];      // [y, half-width around the leg axis]
  skirt?: { hip: number; hemHW: number; curve: number };
  texture?: Texture; denim?: boolean; pleats?: number; cuff?: boolean; crease?: boolean; sheen?: boolean; slit?: boolean; baggy?: boolean;
  tags?: string[];
}

const R = LM.waist + 2; // default waistband top for mid-rise garments
export const BOTTOMS: BottomDef[] = [
  { id: 'wide-jeans', name: 'Wide-leg jeans', kind: 'pants', rise: R, hem: 652, denim: true, texture: 'denim', baggy: true,
    legs: [[430, 29], [480, 31.5], [540, 33], [600, 34.5], [652, 36]], tags: ['pants', 'wide'] },
  { id: 'straight-jeans', name: 'Straight jeans', kind: 'pants', rise: R + 2, hem: 642, denim: true, texture: 'denim', baggy: true,
    legs: [[430, 28], [480, 27.5], [540, 26.5], [600, 26], [642, 26]], tags: ['pants'] },
  { id: 'skinny-jeans', name: 'Skinny jeans', kind: 'pants', rise: R + 2, hem: 636, denim: true, texture: 'denim',
    legs: [[430, 27.5], [480, 24.5], [538, 20.5], [600, 19.4], [636, 15.6]], tags: ['pants', 'slim'] },
  { id: 'flare-jeans', name: 'Flared jeans', kind: 'pants', rise: R + 4, hem: 654, denim: true, texture: 'denim', baggy: true,
    legs: [[430, 27.5], [480, 25.5], [538, 22.5], [590, 27], [654, 39]], tags: ['pants', 'wide'] },
  { id: 'trousers', name: 'Tailored trousers', kind: 'pants', rise: R - 8, hem: 652, crease: true, baggy: true,
    legs: [[430, 29], [480, 30], [540, 30.5], [600, 31], [652, 32]], tags: ['pants', 'formal'] },
  { id: 'leggings', name: 'Leggings', kind: 'pants', rise: R, hem: 636, sheen: true,
    legs: [[430, 27], [480, 24.5], [538, 19.6], [600, 18], [636, 13.8]], tags: ['pants', 'slim'] },
  { id: 'joggers', name: 'Joggers', kind: 'pants', rise: R + 2, hem: 640, cuff: true, texture: 'rib', baggy: true,
    legs: [[430, 29.5], [480, 31], [540, 28], [600, 24.5], [630, 21.5], [640, 19.5]], tags: ['pants'] },
  { id: 'culottes', name: 'Culottes', kind: 'pants', rise: R - 8, hem: 590, crease: true, baggy: true,
    legs: [[430, 29], [480, 32.5], [540, 35], [590, 36.5]], tags: ['pants', 'wide'] },
  { id: 'shalwar', name: 'Shalwar', kind: 'pants', rise: R + 2, hem: 650, cuff: true, baggy: true,
    legs: [[430, 33], [480, 36], [540, 32], [600, 26], [636, 21.5], [650, 19.5]], tags: ['pants', 'traditional'] },
  { id: 'denim-shorts', name: 'Denim shorts', kind: 'shorts', rise: R + 4, hem: 496, denim: true, texture: 'denim',
    legs: [[430, 29], [470, 30], [496, 31]], tags: ['short'] },
  { id: 'bike-shorts', name: 'Bike shorts', kind: 'shorts', rise: R, hem: 506, sheen: true,
    legs: [[430, 27], [470, 25.5], [506, 25]], tags: ['short'] },
  { id: 'mini-skirt', name: 'Mini skirt', kind: 'skirt', rise: R + 2, hem: 486, pleats: 0, skirt: { hip: 57, hemHW: 68, curve: 4 }, tags: ['skirt', 'short'] },
  { id: 'denim-skirt', name: 'Denim skirt', kind: 'skirt', rise: R + 2, hem: 510, denim: true, texture: 'denim', skirt: { hip: 56, hemHW: 64, curve: 3 }, tags: ['skirt', 'short'] },
  { id: 'pencil-skirt', name: 'Pencil skirt', kind: 'skirt', rise: R - 8, hem: 582, slit: true, skirt: { hip: 55, hemHW: 48, curve: 3 }, tags: ['skirt', 'formal'] },
  { id: 'pleated-skirt', name: 'Pleated midi', kind: 'skirt', rise: R - 2, hem: 598, pleats: 14, texture: 'pleat', skirt: { hip: 57, hemHW: 82, curve: 5 }, tags: ['skirt', 'midi'] },
  { id: 'maxi-skirt', name: 'Flowy maxi skirt', kind: 'skirt', rise: R - 2, hem: 654, pleats: 7, skirt: { hip: 57, hemHW: 100, curve: 7 }, tags: ['skirt', 'long', 'modest'] },
];
export const BOTTOM_BY_ID = Object.fromEntries(BOTTOMS.map((b) => [b.id, b]));

const pw = (y: number) => torsoHW(y) + 3;

function legProfile(def: BottomDef, y: number): number {
  const p = def.legs!;
  if (y <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (y <= p[i][0]) return lerp(p[i - 1][1], p[i][1], (y - p[i - 1][0]) / (p[i][0] - p[i - 1][0]));
  return p[p.length - 1][1];
}

function pelvisPath(def: BottomDef) {
  const wt = def.rise;
  const right: Pt[] = [[CX, wt - 1.5], [CX + pw(wt) * 0.5, wt], [CX + pw(wt), wt + 1], [CX + pw(wt + 30), wt + 30], [CX + pw(LM.hip), LM.hip], [CX + pw(LM.crotch) + 1, LM.crotch], [CX + 26, LM.crotch + 12], [CX, LM.crotch + 14]];
  return symPath(right, 1 / 6);
}

function legPath(def: BottomDef, s: 1 | -1) {
  const ys: number[] = [];
  [LM.hip + 4, ...def.legs!.map((p) => p[0]), def.hem].forEach((y) => { if (y <= def.hem && !ys.includes(y)) ys.push(y); });
  ys.sort((a, b) => a - b);
  const outer: Pt[] = ys.map((y) => [CX + s * (legAxis(y) + legProfile(def, y)), y]);
  const inner: Pt[] = ys.map((y) => [CX + s * Math.max(1.4, legAxis(y) - legProfile(def, y)), y]).reverse() as Pt[];
  const hemY = def.hem + (def.kind === 'pants' && !def.cuff ? 2 : 1);
  return spline(outer, false, 1 / 6) + `L${n2(inner[0][0])},${n2(hemY)}` + spline(inner, false, 1 / 6, false) + 'Z';
}

function skirtPath(def: BottomDef) {
  const sk = def.skirt!;
  const wt = def.rise;
  const span = def.hem - LM.hip;
  const right: Pt[] = [[CX, wt - 1.5], [CX + pw(wt), wt + 1], [CX + pw(wt + 30), wt + 30], [CX + sk.hip, LM.hip],
    [CX + lerp(sk.hip, sk.hemHW, 0.45), LM.hip + span * 0.5], [CX + sk.hemHW, def.hem], [CX + sk.hemHW * 0.55, def.hem + sk.curve * 0.9], [CX, def.hem + sk.curve]];
  return symPath(right, 1 / 6);
}

export function renderBottom(c: Ctx, def: BottomDef, color: string): string {
  const dark = luma(color) < 0.4;
  const stroke = edge(color);
  const lineC = def.denim ? (dark ? lighten(color, 0.28) : lighten(color, 0.2)) : (dark ? lighten(color, 0.2) : darken(color, 0.2));
  const fill = fabricGrad(c, color);
  const wt = def.rise;
  let out = '';
  const shapes: string[] = [];
  if (def.kind === 'skirt') shapes.push(skirtPath(def));
  else shapes.push(pelvisPath(def), legPath(def, -1), legPath(def, 1));
  const clip = c.d.clip(shapes.map((s) => `<path d="${s}"/>`).join(''));
  const bulk = def.baggy ? 1.3 : def.kind === 'skirt' ? 1.2 : 1;
  const litO = { blur: 6.5 * bulk, scale: 5.2 * bulk, spec: def.sheen ? 0.55 : luma(color) > 0.6 ? 0.1 : 0.2 };
  // outline underneath (only the outer half shows, so shapes that overlap have no seams)
  for (const s of shapes) out += `<path d="${s}" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round" opacity=".85"/>`;
  out += c.d.volume(shapes.map((s) => `<path d="${s}" fill="${fill}"/>`).join('') + textureOverlay(c, def.texture ?? 'plain', color, clip, CX - 110, wt - 4, 220, def.hem - wt + 12), shapes, litO);

  const g = (inner: string) => `<g clip-path="${clip}">${inner}</g>`;
  const ax560 = (s: number) => CX + s * legAxis(LM.knee);
  if (def.kind === 'skirt') {
    const sk = def.skirt!;
    const lines: Pt[][] = [];
    const n = def.pleats && def.pleats > 0 ? def.pleats : 5;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      lines.push([[CX + t * 76, wt + 24], [CX + t * (sk.hip * 1.2 + sk.hemHW) * 0.9, lerp(LM.hip, def.hem, 0.5)], [CX + t * sk.hemHW * 2.05, def.hem - 3]]);
    }
    out += folds(c, lines, color, clip, def.pleats ? 1.2 : 0.8);
    out += g(shadeBlob(c, CX, def.hem + 3, sk.hemHW, 7, darken(color, 0.34), 0.35, 4) + shadeBlob(c, CX + 42, LM.hip + 10, 24, 50, darken(color, 0.3), 0.18, 8));
    if (def.slit) out += `<path d="M${CX},${def.hem - 50}V${def.hem + 2}" stroke="${darken(color, 0.4)}" stroke-width="1.1" opacity=".6"/>`;
    out += g(`<path d="M${CX - sk.hemHW - 4},${def.hem - 5}Q${CX},${def.hem - 5 + sk.curve * 1.2} ${CX + sk.hemHW + 4},${def.hem - 5}" fill="none" stroke="${darken(color, 0.28)}" stroke-width="1" opacity=".5"/>`);
  } else {
    for (const s of [-1, 1] as const) {
      const ax = ax560(s);
      const hwm = legProfile(def, LM.knee);
      out += g(shadeBlob(c, ax + s * 8, LM.crotch + 4, 14, 22, darken(color, 0.34), 0.22, 6));
      if (def.kind === 'pants' && !def.sheen) {
        const hwL = legProfile(def, 600);
        const k = def.baggy ? 1 : 0.7;
        out += folds(c, [[[ax - hwL * 0.35, LM.hip + 30], [ax - hwL * 0.3, LM.knee], [ax - hwL * 0.4, def.hem - 18]], [[ax + hwL * 0.45, LM.hip + 40], [ax + hwL * 0.4, LM.knee + 40], [ax + hwL * 0.5, def.hem - 12]]], color, clip, k);
        // knee crease and hem pooling (fabric gathers over the footwear)
        if (def.hem > 600) out += g(`<path d="M${n2(ax - hwm * 0.8)},${LM.knee - 2}q${n2(hwm * 0.8)},5 ${n2(hwm * 1.6)},0M${n2(ax - hwm * 0.7)},${LM.knee + 6}q${n2(hwm * 0.7)},4 ${n2(hwm * 1.4)},0" fill="none" stroke="${darken(color, 0.34)}" stroke-width="1.1" opacity=".26"/>`);
        if (def.baggy && def.hem >= 640) for (let i = 0; i < 4; i++) {
          const y = def.hem - 6 - i * 8;
          const hw = legProfile(def, y);
          out += g(`<path d="M${n2(ax - hw)},${y}Q${n2(ax - hw * 0.2)},${y + 5} ${n2(ax + hw * 0.1)},${y + 1}T${n2(ax + hw)},${y}" fill="none" stroke="${darken(color, 0.34)}" stroke-width="1.2" opacity="${n2(0.36 - i * 0.07)}"/><path d="M${n2(ax - hw)},${y + 1.6}Q${n2(ax)},${y + 6.5} ${n2(ax + hw)},${y + 1.6}" fill="none" stroke="${lighten(color, 0.2)}" stroke-width="1" opacity="${n2(0.22 - i * 0.04)}"/>`);
        }
      }
      if (def.sheen) out += g(c.d.softStroke(`M${n2(ax - 8 * s)},${LM.hip + 6}Q${n2(ax - 11 * s)},${LM.knee} ${n2(ax - 6 * s)},${LM.ankle - 20}`, '#fff', 3, 0.3));
      if (def.crease) out += `<path d="M${n2(ax - s * 1)},${LM.hip + 16}V${def.hem - 4}" stroke="${darken(color, 0.32)}" stroke-width="1" opacity=".5"/><path d="M${n2(ax - s * 1 - 1.4)},${LM.hip + 16}V${def.hem - 4}" stroke="${lighten(color, 0.25)}" stroke-width=".8" opacity=".5"/>`;
      if (def.cuff) {
        const yc = def.hem - 15;
        const hw = legProfile(def, yc) + 1.4;
        const r = `<rect x="${n2(ax - hw)}" y="${yc}" width="${n2(hw * 2)}" height="16" rx="3.4"/>`;
        out += r.replace('<rect', `<rect fill="${darken(color, 0.06)}"`) + r.replace('<rect', `<rect fill="none" stroke="${stroke}" stroke-width="1"`) + textureOverlay(c, 'rib', color, c.d.clip(r), ax - hw, yc, hw * 2, 16);
      }
    }
    out += `<path d="M${CX},${LM.crotch + 4}V${Math.min(def.hem, LM.knee - 30)}" stroke="${darken(color, 0.4)}" stroke-width="1.2" opacity=".5"/>`;
  }

  // waistband and detailing
  const bandH = 10;
  const bandW = pw(wt) + 1.2;
  const band = `M${CX - bandW},${wt}Q${CX},${wt + 3.5} ${CX + bandW},${wt}L${CX + pw(wt + bandH) + 1.3},${wt + bandH}Q${CX},${wt + bandH + 3.5} ${CX - pw(wt + bandH) - 1.3},${wt + bandH}Z`;
  out += `<path d="${band}" fill="${darken(color, def.denim ? 0.04 : 0.02)}"/><path d="${band}" fill="none" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>`;
  if (def.denim) {
    out += stitch(`M${CX - bandW + 2},${wt + 2}Q${CX},${wt + 5.5} ${CX + bandW - 2},${wt + 2}`, lineC, 0.7, 0.8);
    out += `<circle cx="${CX}" cy="${wt + bandH * 0.55 + 1.2}" r="2.4" fill="#c9ccd3" stroke="#7d8088" stroke-width=".6"/>`;
    for (const s of [-1, 1] as const) for (const k of [0.45, 0.8]) out += `<rect x="${n2(CX + s * bandW * k - 1)}" y="${wt - 0.5}" width="2.2" height="${bandH + 1.5}" fill="${darken(color, 0.08)}" stroke="${stroke}" stroke-width=".5" opacity=".9"/>`;
  } else if (def.kind === 'pants' && def.crease) {
    out += `<rect x="${CX - 5}" y="${wt - 0.5}" width="10" height="${bandH + 1}" fill="${darken(color, 0.12)}" opacity=".6"/><circle cx="${CX}" cy="${wt + 5}" r="1.8" fill="#d8cdb8" stroke="#8a7f66" stroke-width=".5"/>`;
  }
  if (def.denim && def.kind !== 'skirt') {
    for (const s of [-1, 1] as const) {
      const p0: Pt = [CX + s * 34, wt + bandH];
      out += stitch(`M${p0[0]},${p0[1]}Q${n2(CX + s * 26)},${wt + bandH + 24} ${n2(CX + s * 18)},${wt + bandH + 38}`, lineC, 0.5, 0.8);
      const ax = ax560(s), hw = legProfile(def, LM.knee);
      out += stitch(`M${n2(ax + s * (hw - 1.2))},${wt + 40}Q${n2(ax + s * (hw - 0.6))},${LM.knee} ${n2(ax + s * (hw - 0.4))},${def.hem - 4}`, lineC, 0.5, 0.8);
      // whiskers and knee fade
      out += `<path d="M${n2(CX + s * 14)},${wt + 16}q${s * 10},3 ${s * 18},${-1}M${n2(CX + s * 12)},${wt + 21}q${s * 9},3 ${s * 16},0M${n2(CX + s * 12)},${wt + 26}q${s * 8},2 ${s * 14},0" stroke="${lighten(color, 0.2)}" stroke-width="1.4" stroke-linecap="round" opacity=".32" fill="none"/>`;
    }
    out += stitch(`M${CX},${wt + bandH}V${wt + 44}`, lineC, 0.5, 0.8);
    out += `<path d="M${CX + 1},${wt + bandH + 1}Q${CX + 7},${wt + 32} ${CX + 1},${wt + 42}" fill="none" stroke="${darken(color, 0.3)}" stroke-width=".8" opacity=".5"/>`;
    if (luma(color) > 0.25) out += g(c.d.glow(CX - 28, LM.crotch + 40, 22, 38, lighten(color, 0.14), 0.4) + c.d.glow(CX + 28, LM.crotch + 40, 22, 38, lighten(color, 0.1), 0.3) + c.d.glow(CX - 30, LM.knee + 6, 22, 20, lighten(color, 0.18), 0.34) + c.d.glow(CX + 30, LM.knee + 6, 22, 20, lighten(color, 0.14), 0.3));
  }
  if (def.kind === 'skirt' && def.denim) {
    out += stitch(`M${CX},${wt + bandH}V${def.hem - 6}`, lineC, 0.55, 0.8);
    for (let i = 0; i < 4; i++) out += `<circle cx="${CX}" cy="${n2(lerp(wt + 24, def.hem - 24, i / 3))}" r="1.9" fill="#c9ccd3" stroke="#7d8088" stroke-width=".5"/>`;
  }
  return out;
}

export const bottomIds = BOTTOMS.map((b) => b.id);
