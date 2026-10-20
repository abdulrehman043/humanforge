// Body (v2): landmark table, arm poses and the lit skin figure that clothing is drawn over.
//
// PROPORTION GUIDE (design estimates from visual observation of the "Bitmoji ideas!" collage, not measurements):
//   - the collage characters are about 4.6-5.4 head-heights tall when the head is measured from hair top to chin;
//   - the head is large, the neck short and thin, the shoulders narrow, and the torso is roughly 1.6-1.9 heads long;
//   - the legs are short (about 1.7-2 heads) with wide, baggy trousers that pool on chunky footwear;
//   - hands are chunky and simplified.
// Here: head (hair top -> chin) = 140, torso (shoulder -> crotch) = 220, legs (crotch -> ground) = 244, total ~ 4.6 heads.
import { CX, Pt, clamp, lerp, n2, ribbon, sampleSpline, spline, symPath } from './geom';
import type { Ctx, PoseId } from './types';

/** Named landmarks on the 400x700 canvas (y grows downwards). Garments, shoes and accessories are all authored against these. */
export const LM = {
  chin: 176, neckBase: 198, shoulder: 210, armpit: 252, bust: 248, waist: 318, hip: 384, crotch: 430, knee: 538, ankle: 634, ground: 674,
} as const;
/** Back-compat names used by accessories and the manifest. */
export const SK = { neckTop: 164, neckBase: LM.neckBase, shoulderY: LM.shoulder, bustY: LM.bust, waistY: LM.waist, hipY: LM.hip, crotchY: LM.crotch, kneeY: LM.knee, ankleY: LM.ankle, groundY: LM.ground };

/** Hem heights shared by tops (tuned to the torso landmarks). */
export const HEM = { crop: 298, waist: 316, hip: 372, low: 394, thigh: 430, long: 470 } as const;

/** Torso half-width at y (the bare-skin mannequin). */
const TORSO_HW: [number, number][] = [[198, 15], [208, 40], [214, 55], [236, 51], [254, 45], [286, 40], [318, 38], [352, 44], [384, 52], [412, 52], [430, 50]];
export const torsoHW = (y: number) => {
  if (y <= TORSO_HW[0][0]) return TORSO_HW[0][1];
  for (let i = 1; i < TORSO_HW.length; i++) if (y <= TORSO_HW[i][0]) {
    const [y0, w0] = TORSO_HW[i - 1], [y1, w1] = TORSO_HW[i];
    return lerp(w0, w1, (y - y0) / (y1 - y0));
  }
  return TORSO_HW[TORSO_HW.length - 1][1];
};

/** Leg axis (distance from the centre line) and half-width as a function of y. */
export const legAxis = (y: number) => lerp(25, 31, clamp((y - LM.crotch) / (LM.ankle - LM.crotch), 0, 1));
const LEG_HW: [number, number][] = [[LM.crotch - 4, 26.5], [468, 25.5], [500, 22.5], [LM.knee, 19], [572, 19.6], [606, 16], [LM.ankle, 12.5]];
export const legHW = (y: number) => {
  if (y <= LEG_HW[0][0]) return LEG_HW[0][1];
  for (let i = 1; i < LEG_HW.length; i++) if (y <= LEG_HW[i][0]) {
    const [y0, w0] = LEG_HW[i - 1], [y1, w1] = LEG_HW[i];
    return lerp(w0, w1, (y - y0) / (y1 - y0));
  }
  return LEG_HW[LEG_HW.length - 1][1];
};

// ------------------------------------------------------------------ poses
export interface ArmDef { pts: [Pt, Pt, Pt]; /** point the hand reaches towards; default: along the forearm */ aim?: Pt; hand: 'open' | 'fist' | 'hidden' | 'cover' | 'flat' }
export interface PoseDef { L: ArmDef; R: ArmDef; front: boolean; name: string; /** degrees the head leans (rotation about the neck) */ tilt?: number }
const mir = (a: ArmDef): ArmDef => ({ ...a, pts: a.pts.map(([x, y]) => [2 * CX - x, y]) as [Pt, Pt, Pt], aim: a.aim && [2 * CX - a.aim[0], a.aim[1]] });
const RELAX_L: ArmDef = { pts: [[149, 220], [137, 296], [131, 366]], hand: 'open' };
export const POSES: Record<PoseId, PoseDef> = {
  relaxed: { name: 'Relaxed', front: false, L: RELAX_L, R: mir(RELAX_L) },
  crossed: {
    name: 'Arms crossed', front: true, tilt: -2,
    L: { pts: [[149, 220], [143, 300], [238, 296]], hand: 'hidden' },
    R: { pts: [[251, 220], [257, 308], [164, 284]], hand: 'open', aim: [142, 280] },
  },
  shy: {
    name: 'Hands over mouth', front: true, tilt: 3,
    L: { pts: [[149, 220], [120, 266], [181, 202]], aim: [204, 154], hand: 'cover' },
    R: { pts: [[251, 220], [280, 266], [219, 200]], aim: [197, 158], hand: 'cover' },
  },
  shrug: {
    name: 'Shrug', front: false, tilt: -4,
    L: { pts: [[149, 220], [114, 292], [78, 262]], aim: [62, 238], hand: 'open' },
    R: mir({ pts: [[149, 220], [114, 292], [78, 262]], aim: [62, 238], hand: 'open' }),
  },
  wave: {
    name: 'Wave', front: false, tilt: 3,
    L: RELAX_L,
    R: { pts: [[251, 220], [292, 266], [304, 196]], aim: [309, 160], hand: 'open' },
  },
  hip: {
    name: 'Hand on hip', front: false, tilt: -3,
    L: { pts: [[149, 220], [104, 296], [146, 352]], aim: [166, 372], hand: 'open' },
    R: mir(RELAX_L),
  },
  chin: {
    name: 'Hands under chin', front: true, tilt: 4,
    L: { pts: [[149, 220], [112, 262], [164, 204]], aim: [224, 198], hand: 'flat' },
    R: { pts: [[251, 220], [288, 266], [238, 210]], aim: [176, 204], hand: 'flat' },
  },
};
export const POSE_IDS = Object.keys(POSES) as PoseId[];

export interface Arm {
  def: ArmDef;
  pts: Pt[];       // dense centre line, shoulder -> wrist
  t: number[];     // 0..1 by arc length
  elbowT: number;
  len: number;
  width: (t: number) => number;
  hand: { pos: Pt; angle: number };
}

export function buildArm(def: ArmDef): Arm {
  const [s, e, w] = def.pts;
  const mid1: Pt = [lerp(s[0], e[0], 0.5), lerp(s[1], e[1], 0.5)];
  const mid2: Pt = [lerp(e[0], w[0], 0.5), lerp(e[1], w[1], 0.5)];
  const pts = sampleSpline([s, mid1, e, mid2, w], 6, 0.12);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  const t = cum.map((c) => c / len);
  const elbowT = t[12];
  const width = (u: number) => {
    if (u < elbowT) return lerp(21, 17.5, u / elbowT);
    const v = (u - elbowT) / (1 - elbowT);
    return lerp(17.5, 13.2, Math.pow(v, 0.8)) + 1.2 * Math.sin(v * Math.PI);
  };
  const dx = w[0] - e[0], dy = w[1] - e[1];
  const aimAngle = def.aim ? Math.atan2(def.aim[1] - w[1], def.aim[0] - w[0]) : Math.atan2(dy, dx);
  return { def, pts, t, elbowT, len, width, hand: { pos: w, angle: aimAngle } };
}

/** Ribbon polygon around a sub-range of an arm; `extra` widens it (sleeves). */
export function armRibbon(a: Arm, t0: number, t1: number, extra: number | ((t: number) => number) = 0) {
  const idx: number[] = [];
  a.t.forEach((t, i) => { if (t >= t0 - 1e-6 && t <= t1 + 1e-6) idx.push(i); });
  // long ranges are sampled at every other point (the spline smooths the rest): half the path data
  const keep = idx.length > 10 ? idx.filter((_, k) => k % 2 === 0 || k === idx.length - 1) : idx;
  const pts = keep.map((i) => a.pts[i]);
  const ex = typeof extra === 'number' ? () => extra : extra;
  const wid = keep.map((i) => a.width(a.t[i]) + ex(a.t[i]));
  return { pts, wid, d: ribbon(pts, wid, 0.12) };
}

/** Extra soft shading layered over a lit limb or sleeve: a darker underside. */
export function limbShade(c: Ctx, pts: Pt[], wid: number[], d: string, shade: string, light: string, amt = 1): string {
  const clip = c.d.clip(`<path d="${d}"/>`);
  const mean = wid.reduce((a, b) => a + b, 0) / wid.length;
  const off = mean * 0.3;
  const path = spline(pts, false, 0.12);
  return `<g clip-path="${clip}">` +
    c.d.softStroke(path, shade, mean * 0.4, 0.5 * amt, ` transform="translate(${n2(off)} ${n2(off * 0.4)})"`) +
    c.d.softStroke(path, light, mean * 0.22, 0.5 * amt, ` transform="translate(${n2(-off * 0.85)} ${n2(-off * 0.3)})"`) +
    `</g>`;
}

export function renderArmSkin(c: Ctx, a: Arm): string {
  const { skin, d } = c;
  const r = armRibbon(a, 0, 1);
  return d.volume(`<path d="${r.d}" fill="${skin.base}"/>`, [r.d], { blur: 4.2, scale: 4, spec: 0.12 });
}

/** A chunky, simplified hand (palm, joined fingers, thumb) drawn at the wrist, pointing along `angle`. */
export function renderHand(c: Ctx, a: Arm, mirrored: boolean): string {
  const { skin, d } = c;
  if (a.def.hand === 'hidden') return '';
  const [wx, wy] = a.hand.pos;
  const deg = (a.hand.angle * 180) / Math.PI - 90; // local +y runs along the pointing direction
  const sx = mirrored ? -1 : 1;
  const kind = a.def.hand;
  const L = kind === 'cover' ? 1.1 : kind === 'flat' ? 1.18 : 1;
  const SC = 1.5;
  const pts: Pt[] = kind === 'flat'
    ? [[-6, -1], [-7, 7], [-7, 16], [-6, 24 * L], [-3, 29 * L], [1, 30 * L], [4.6, 27 * L], [6.2, 20 * L], [6.8, 12], [6.4, 4], [5.4, -1]]
    : [[-5.6, -1], [-7, 6], [-6.6, 14], [-5.4, 21 * L], [-3, 26 * L], [0.6, 27.5 * L], [3.8, 25.5 * L], [5.8, 20 * L], [6.7, 12], [6.4, 4], [5.2, -1]];
  const path = spline(pts, true, 0.16);
  let out = `<g transform="translate(${n2(wx)} ${n2(wy)}) rotate(${n2(deg)}) scale(${n2(sx * SC)} ${SC})">`;
  const hg = d.linear(-8, 0, 8, 0, [[0, skin.light], [0.45, skin.base], [1, skin.shade]]);
  out += `<path d="${path}" fill="${hg}"/>`;
  out += `<path d="${spline([[-5.4, 4], [-9.6, 9], [-11, 15.5], [-8.8, 19], [-6.2, 13]], true, 0.18)}" fill="${skin.base}" stroke="${skin.shade}" stroke-width=".5"/>`;
  for (const x of [-2.9, -0.1, 2.7]) out += `<path d="M${x},${n2(15 * L)}V${n2(24 * L)}" stroke="${skin.deep}" stroke-width=".6" stroke-linecap="round" opacity=".5"/>`;
  out += `<path d="M-4.6,13.5Q0,15.4 5,13.5" fill="none" stroke="${skin.deep}" stroke-width=".6" opacity=".3"/>`;
  out += `</g>`;
  return out;
}

// ------------------------------------------------------------------ skin figure
function torsoPoints(): Pt[] {
  const ys = [188, 198, 204, 210, 222, 238, 254, 286, 318, 352, 384, 412, 438];
  const right: Pt[] = ys.map((y) => [CX + (y <= 188 ? 0 : torsoHW(y)), y] as Pt);
  right[right.length - 1] = [CX, 446];
  return right;
}

export function renderLegsSkin(c: Ctx): string {
  const { skin, d } = c;
  let g = '';
  const paths: string[] = [];
  const ys = [LM.crotch - 6, 468, 500, LM.knee, 572, 606, LM.ankle];
  for (const s of [-1, 1] as const) {
    const outer: Pt[] = ys.map((y) => [CX + s * (legAxis(y) + legHW(y)), y]);
    const inner: Pt[] = ys.map((y) => [CX + s * (legAxis(y) - legHW(y)), y]).reverse() as Pt[];
    const path = spline(outer, false) + 'L' + inner[0][0] + ',' + inner[0][1] + spline(inner, false, 1 / 6, false) + 'Z';
    g += `<path d="${path}" fill="${skin.base}"/>`;
    paths.push(path);
  }
  return d.volume(g, paths, { blur: 5, scale: 4.4, spec: 0.12 });
}

export function renderNeckTorsoSkin(c: Ctx): string {
  const { skin, d, face } = c;
  const torso = symPath(torsoPoints(), 1 / 6);
  const neckPts: Pt[] = [[CX, face.chin - 16], [CX + 15, face.chin - 12], [CX + 15.5, 188], [CX + 19, 198], [CX + 32, 206], [CX, 214]];
  const neck = symPath(neckPts);
  let out = d.volume(`<path d="${torso}" fill="${skin.base}"/><path d="${neck}" fill="${skin.base}"/>`, [torso, neck], { blur: 5.5, scale: 4.4, spec: 0.1 });
  const clip = d.clip(`<path d="${neck}"/>`);
  out += `<g clip-path="${clip}">${d.glow(CX + 3, face.chin + 2, 32, 18, skin.deep, 0.6)}</g>`;
  out += `<path d="M${CX - 33},212Q${CX - 17},218 ${CX - 4},214M${CX + 33},212Q${CX + 17},218 ${CX + 4},214" fill="none" stroke="${skin.deep}" stroke-width="1.3" stroke-linecap="round" opacity=".2"/>`;
  return out;
}
