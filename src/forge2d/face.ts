// Face: shape profiles, expression table and the eye / brow / nose / mouth templates.
// Every feature is positioned from FaceGeom anchors, so any shape x feature x expression stays aligned.
import { CX, Pt, clamp, darken, lighten, mix, n2, polyline, ribbon, rng, sampleSpline, spline, symLoop, tone, lerp, rot } from './geom';
import type { Ctx, ExpressionId, FaceShapeId } from './types';

// ------------------------------------------------------------------ shapes
// right half, top centre -> chin centre, as [half-width, y]
const PROFILES: Record<FaceShapeId, [number, number][]> = {
  oval:    [[0, 46], [23, 50], [40, 62], [49, 82], [52, 104], [50, 126], [43, 146], [31, 160], [16, 169], [0, 172]],
  round:   [[0, 49], [24, 52], [41, 64], [50, 83], [52, 106], [50, 128], [44, 147], [32, 161], [16, 170], [0, 173]],
  heart:   [[0, 46], [22, 50], [39, 61], [49, 80], [51, 100], [47, 121], [37, 142], [23, 160], [9, 174], [0, 178]],
  square:  [[0, 47], [21, 51], [37, 62], [46, 81], [49, 104], [49, 128], [47, 148], [41, 164], [25, 173], [0, 175]],
  long:    [[0, 42], [20, 46], [35, 58], [43, 80], [45, 104], [44, 130], [38, 152], [26, 170], [12, 181], [0, 184]],
  diamond: [[0, 46], [20, 50], [34, 62], [46, 84], [50, 106], [45, 128], [36, 148], [24, 164], [11, 174], [0, 178]],
};
export const FACE_SHAPES: FaceShapeId[] = ['oval', 'round', 'heart', 'square', 'long', 'diamond'];

export interface FaceGeom {
  shape: FaceShapeId;
  right: Pt[];        // absolute right-half profile
  loop: Pt[];         // closed symmetric outline points
  path: string;       // closed outline path
  top: number; chin: number; H: number;
  eyeY: number; browY: number; noseY: number; mouthY: number; gap: number;
  hw: (y: number) => number;
}

export function buildFace(shape: FaceShapeId): FaceGeom {
  const right: Pt[] = PROFILES[shape].map(([hw, y]) => [CX + hw, y]);
  const loop = symLoop(right);
  const dense = sampleSpline(right, 10);
  const top = right[0][1], chin = right[right.length - 1][1], H = chin - top;
  const hw = (y: number) => {
    if (y <= top) return 0;
    if (y >= chin) return 0;
    for (let i = 1; i < dense.length; i++) {
      if (dense[i][1] >= y) {
        const a = dense[i - 1], b = dense[i];
        const t = (y - a[1]) / (b[1] - a[1] || 1);
        return lerp(a[0], b[0], t) - CX;
      }
    }
    return 0;
  };
  const eyeY = top + H * 0.5;
  return {
    shape, right, loop, path: spline(loop, true), top, chin, H,
    eyeY, browY: eyeY - H * 0.14, noseY: top + H * 0.69, mouthY: top + H * 0.8,
    gap: 11 * (hw(eyeY) / 49),
    hw,
  };
}

// ------------------------------------------------------------------ expressions
export interface Expr {
  browLift: number;   // px (positive = up)
  browTilt: number;   // positive: inner ends up (sad/worried); negative: inner ends down (confident/angry)
  browAsym: number;   // extra lift on the right brow
  eyeOpen: number;    // scales the lid opening
  squint: number;     // lower lid pushed up (smile eyes)
  smile: number;      // -1..1 corner lift
  open: number;       // 0..1 mouth opening
  teeth: boolean;
  smirk: number;      // right corner extra lift
  look: Pt;           // pupil offset
  blush: number;      // extra blush
  mouthW: number;     // width scale
}
export const EXPRESSIONS: Record<ExpressionId, Expr> = {
  neutral:    { browLift: 0.5, browTilt: 0.15, browAsym: 0, eyeOpen: 1, squint: 0.05, smile: 0.3, open: 0, teeth: false, smirk: 0, look: [0, 0], blush: 0, mouthW: 1 },
  happy:      { browLift: 1.2, browTilt: 0.1, browAsym: 0, eyeOpen: 0.95, squint: 0.35, smile: 0.85, open: 0, teeth: false, smirk: 0, look: [0, 0], blush: 0.3, mouthW: 1.08 },
  excited:    { browLift: 3.5, browTilt: 0.2, browAsym: 0, eyeOpen: 1.12, squint: 0.15, smile: 1, open: 0.8, teeth: true, smirk: 0, look: [0, -0.2], blush: 0.45, mouthW: 1.2 },
  thoughtful: { browLift: 1, browTilt: 0.15, browAsym: 2.2, eyeOpen: 0.92, squint: 0, smile: 0.05, open: 0, teeth: false, smirk: 0.35, look: [3.2, -2.4], blush: 0, mouthW: 0.82 },
  confident:  { browLift: 1, browTilt: 0.05, browAsym: 1.4, eyeOpen: 0.86, squint: 0.1, smile: 0.5, open: 0, teeth: false, smirk: 1.1, look: [0, 0], blush: 0.1, mouthW: 1 },
  sad:        { browLift: 0.5, browTilt: 1.5, browAsym: 0, eyeOpen: 0.88, squint: 0, smile: -0.7, open: 0, teeth: false, smirk: 0, look: [0, 1.2], blush: 0.05, mouthW: 0.85 },
  surprised:  { browLift: 5.5, browTilt: 0.3, browAsym: 0, eyeOpen: 1.22, squint: 0, smile: 0, open: 0.95, teeth: false, smirk: 0, look: [0, 0], blush: 0.15, mouthW: 0.62 },
};
export const EXPRESSION_IDS = Object.keys(EXPRESSIONS) as ExpressionId[];

// ------------------------------------------------------------------ eyes
interface EyeStyle { w: number; h: number; tilt: number; iris: number; lid: number; wing: number; lash: number; crease: boolean; sleepy: number; name: string }
export const EYE_STYLES: Record<string, EyeStyle> = {
  almond:   { name: 'Almond',   w: 19,   h: 7.6, tilt: 1.8, iris: 1,    lid: 2.4, wing: 0,   lash: 4.2, crease: true,  sleepy: 0.05 },
  soft:     { name: 'Soft round', w: 17.5, h: 8.8, tilt: 0.2, iris: 1.04, lid: 2.2, wing: 0,   lash: 3.8, crease: true,  sleepy: 0 },
  cat:      { name: 'Winged',   w: 20,   h: 7,   tilt: 3.2, iris: 0.96, lid: 2.8, wing: 5.5, lash: 4.6, crease: true,  sleepy: 0.08 },
  hooded:   { name: 'Hooded',   w: 19,   h: 7,   tilt: 0.6, iris: 1,    lid: 2.6, wing: 0,   lash: 3.6, crease: false, sleepy: 0.32 },
  doe:      { name: 'Doe',      w: 18,   h: 9,   tilt: -0.4, iris: 1.08, lid: 2.4, wing: 0,   lash: 5,   crease: true,  sleepy: 0 },
  upturned: { name: 'Upturned', w: 20,   h: 7.2, tilt: 3.8, iris: 0.98, lid: 2.4, wing: 2.2, lash: 4.4, crease: true,  sleepy: 0.04 },
  wide:     { name: 'Wide-set', w: 21,   h: 8.2, tilt: 1.2, iris: 1.02, lid: 2.3, wing: 0,   lash: 4,   crease: true,  sleepy: 0 },
  mono:     { name: 'Monolid',  w: 19.5, h: 6.4, tilt: 1.4, iris: 0.96, lid: 2.6, wing: 1.2, lash: 3.4, crease: false, sleepy: 0.18 },
};
export const EYE_IDS = Object.keys(EYE_STYLES);

const LINER = '#2a1b18';

export function renderEyes(c: Ctx): string {
  const { d, cfg, skin, face } = c;
  const st = EYE_STYLES[cfg.face.eyes] ?? EYE_STYLES.almond;
  const ex = EXPRESSIONS[cfg.expression];
  const open = clamp(ex.eyeOpen, 0.5, 1.3) * (1 - st.sleepy);
  const w = st.w * 1.3, tilt = st.tilt;
  const h = st.h * 1.42;
  let out = '';
  for (const s of [-1, 1] as const) {
    const X = (lx: number) => CX + s * (face.gap + lx);
    const yTilt = (lx: number) => face.eyeY - tilt * (lx / w) + tilt * 0.35;
    const sq = ex.squint * h * 0.5;
    // upper and lower lid curves, inner -> outer
    const up: Pt[] = [
      [X(0), yTilt(0)],
      [X(w * 0.2), yTilt(w * 0.2) - h * 0.8 * open],
      [X(w * 0.5), yTilt(w * 0.5) - h * 1.02 * open],
      [X(w * 0.82), yTilt(w * 0.82) - h * 0.62 * open],
      [X(w), yTilt(w)],
    ];
    const lo: Pt[] = [
      [X(0), yTilt(0)],
      [X(w * 0.28), yTilt(w * 0.28) + h * 0.5 - sq],
      [X(w * 0.58), yTilt(w * 0.58) + h * 0.54 - sq],
      [X(w * 0.88), yTilt(w * 0.88) + h * 0.22 - sq * 0.4],
      [X(w), yTilt(w)],
    ];
    const upPath = spline(up, false, 0.2);
    const loRev = spline([...lo].reverse(), false, 0.2, false);
    const eyeShape = `${upPath}${loRev}Z`;
    const clip = d.clip(`<path d="${eyeShape}"/>`);

    // eyeshadow
    if (cfg.face.eyeshadow && cfg.face.eyeshadow.length === 7) {
      const sh: Pt[] = up.map(([x, y], i) => [x + s * (i === 4 ? 2 : 0), y - (3.5 + h * 0.75) * (i === 0 || i === 4 ? 0.55 : 1)] as Pt);
      const shp = `${upPath}L${sh[4][0]},${sh[4][1]}${spline([...sh].reverse(), false, 0.2, false)}Z`;
      out += d.noBlur ? `<path d="${shp}" fill="${cfg.face.eyeshadow}" opacity=".3"/>` : `<path d="${shp}" fill="${cfg.face.eyeshadow}" opacity=".5" filter="${d.blur(1.7)}"/>`;
    }

    // sclera
    out += `<path d="${eyeShape}" fill="#fbf8f4"/>`;
    // iris, pupil, light (clipped to the eye)
    const irisR = 5.7 * st.iris;
    const icx = X(w * 0.52) + s * ex.look[0] * 0.55;
    const icy = face.eyeY - tilt * 0.12 - h * 0.1 + ex.look[1] * 0.5;
    const ic = cfg.face.eyeColor;
    const irisFill = d.radial(icx, icy + irisR * 0.25, irisR * 1.05, [[0, lighten(ic, 0.16)], [0.55, ic], [1, darken(ic, 0.2)]]);
    out += `<g clip-path="${clip}">`;
    out += `<circle cx="${n2(icx)}" cy="${n2(icy)}" r="${n2(irisR)}" fill="${irisFill}"/>`;
    out += `<circle cx="${n2(icx)}" cy="${n2(icy)}" r="${n2(irisR)}" fill="none" stroke="${darken(ic, 0.3)}" stroke-width="0.9" opacity=".7"/>`;
    out += `<circle cx="${n2(icx)}" cy="${n2(icy)}" r="${n2(irisR * 0.42)}" fill="#150d0b"/>`;
    out += `<circle cx="${n2(icx - irisR * 0.34)}" cy="${n2(icy - irisR * 0.38)}" r="${n2(irisR * 0.3)}" fill="#fff" opacity=".95"/>`;
    out += `<circle cx="${n2(icx + irisR * 0.38)}" cy="${n2(icy + irisR * 0.34)}" r="${n2(irisR * 0.14)}" fill="#fff" opacity=".6"/>`;
    // upper lid shadow
    const sg = d.linear(0, face.eyeY - h * 1.1, 0, face.eyeY - h * 0.1, [[0, skin.deep, 0.55], [1, skin.deep, 0]]);
    out += `<rect x="${n2(X(-2) - (s > 0 ? 0 : w + 4))}" y="${n2(face.eyeY - h * 1.3 - 3)}" width="${n2(w + 4)}" height="${n2(h * 1.3)}" fill="${sg}"/>`;
    out += `</g>`;

    // crease
    if (st.crease) {
      const cr: Pt[] = up.slice(0, 4).map(([x, y], i) => [x - s * (i === 0 ? -1 : 0), y - (2.3 + h * 0.5) * (i === 0 ? 0.3 : 1)] as Pt);
      out += `<path d="${spline(cr, false, 0.2)}" fill="none" stroke="${skin.deep}" stroke-width="1.05" stroke-linecap="round" opacity=".5"/>`;
    }
    // lower lid line
    out += `<path d="${spline(lo, false, 0.2)}" fill="none" stroke="${skin.deep}" stroke-width=".9" stroke-linecap="round" opacity=".45"/>`;
    // upper lash line: a ribbon thickening towards the outer corner, plus optional wing
    const lidPts = sampleSpline(up, 4, 0.2);
    const n = lidPts.length;
    const widths = lidPts.map((_, i) => st.lid * 1.2 * (0.45 + 0.75 * Math.sin((i / (n - 1)) * Math.PI * 0.85 + 0.15) ) * (0.7 + 0.5 * (i / (n - 1))));
    out += `<path d="${ribbon(lidPts, widths, 0.18)}" fill="${LINER}"/>`;
    if (st.wing > 0) {
      const o = up[4], a = up[3];
      const dx = o[0] - a[0], dy = o[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const tip: Pt = [o[0] + (dx / l) * st.wing * 0.95, o[1] + (dy / l) * st.wing * 0.8 - st.wing * 0.42];
      out += `<path d="M${o[0]},${o[1] - 0.9}Q${n2(o[0] + (dx / l) * st.wing * 0.55)},${n2(o[1] - 1.4)} ${n2(tip[0])},${n2(tip[1])}Q${n2(o[0] + (dx / l) * st.wing * 0.5)},${n2(o[1] + 0.5)} ${o[0]},${o[1] + 1.1}Z" fill="${LINER}"/>`;
    }
    // lashes
    if (cfg.face.lashes) {
      const cnt = 3;
      for (let i = 0; i < cnt; i++) {
        const t = 0.62 + (i / (cnt - 1)) * 0.38;
        const idx = Math.round(t * (n - 1));
        const p = lidPts[idx];
        const ang = (30 + t * 48) * (Math.PI / 180);
        const len = st.lash * 0.62 * (0.8 + 0.3 * t);
        const ex2: Pt = [p[0] + s * Math.sin(ang) * len, p[1] - Math.cos(ang) * len];
        const ctl: Pt = [(p[0] + ex2[0]) / 2 - s * 0.5, (p[1] + ex2[1]) / 2 - 0.6];
        out += `<path d="M${P2(p)}Q${P2(ctl)} ${P2(ex2)}" fill="none" stroke="${LINER}" stroke-width="1" stroke-linecap="round"/>`;
      }
    }
  }
  return out;
}
const P2 = (p: Pt) => `${n2(p[0])},${n2(p[1])}`;

// ------------------------------------------------------------------ brows
interface BrowStyle { name: string; arch: number; thick: number; peak: number; taper: number; len: number; rise: number }
export const BROW_STYLES: Record<string, BrowStyle> = {
  soft:     { name: 'Soft arch', arch: 3.8, thick: 3.7, peak: 0.6,  taper: 0.18, len: 1,    rise: 0 },
  straight: { name: 'Straight',  arch: 1.2, thick: 3.4, peak: 0.5,  taper: 0.3,  len: 1,    rise: 0.2 },
  bold:     { name: 'Bold',      arch: 3.2, thick: 5.4, peak: 0.58, taper: 0.28, len: 1.02, rise: 0 },
  thin:     { name: 'Thin arch', arch: 5,   thick: 2.3, peak: 0.65, taper: 0.1,  len: 1.04, rise: 0 },
  angled:   { name: 'Angled',    arch: 5.2, thick: 3.4, peak: 0.64, taper: 0.16, len: 1,    rise: 0.25 },
  feather:  { name: 'Feathered', arch: 2.4, thick: 4.0, peak: 0.55, taper: 0.5,  len: 0.96,  rise: 0.2 },
};
export const BROW_IDS = Object.keys(BROW_STYLES);

export function renderBrows(c: Ctx): string {
  const { cfg, face } = c;
  const st = BROW_STYLES[cfg.face.brows] ?? BROW_STYLES.soft;
  const ex = EXPRESSIONS[cfg.expression];
  const eye = EYE_STYLES[cfg.face.eyes] ?? EYE_STYLES.almond;
  let out = '';
  for (const s of [-1, 1] as const) {
    const inner = face.gap - 1.5, outer = face.gap + eye.w * st.len + 3;
    const lift = ex.browLift + (s > 0 ? ex.browAsym : 0);
    const pts: Pt[] = [];
    const wid: number[] = [];
    const N = 7;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = CX + s * lerp(inner, outer, t);
      const arch = st.arch * Math.sin(Math.PI * Math.pow(t, Math.log(0.5) / Math.log(st.peak)));
      const y = face.browY + 2 - arch - lift - ex.browTilt * (0.5 - t) * 3.4 - st.rise * (t - 0.2) * 3.2 * (t > 0.2 ? 1 : 0) - (1 - t) * 1.0;
      pts.push([x, y]);
      wid.push(st.thick * (t < 0.25 ? 0.82 + t * 0.7 : 1 - (t - 0.25) / 0.75 * (1 - st.taper) * 1.02));
    }
    out += `<path d="${ribbon(pts, wid, 0.2)}" fill="${c.browColor}" opacity=".88"/>`;
    if (cfg.face.brows === 'feather') {
      for (let i = 1; i < N - 1; i++) {
        const [x, y] = pts[i];
        out += `<path d="M${n2(x)},${n2(y + 1.4)}l${n2(s * 1.8)},${n2(-3.4)}" stroke="${c.browColor}" stroke-width=".9" stroke-linecap="round" opacity=".6"/>`;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ nose
export const NOSE_STYLES: Record<string, { name: string; ww: number; len: number; tip: number }> = {
  soft:   { name: 'Soft',     ww: 6.8, len: 0,    tip: 1 },
  button: { name: 'Button',   ww: 5.8, len: -1.6, tip: 1.1 },
  slim:   { name: 'Slim',     ww: 5.6, len: 0.8,  tip: 0.85 },
  round:  { name: 'Rounded',  ww: 7.8, len: -0.4, tip: 1.2 },
  broad:  { name: 'Broad',    ww: 9,   len: 0,    tip: 1.1 },
  upturn: { name: 'Upturned', ww: 6.4, len: -1.2, tip: 1 },
};
export const NOSE_IDS = Object.keys(NOSE_STYLES);

export function renderNose(c: Ctx): string {
  const { d, face, skin, cfg } = c;
  const st = NOSE_STYLES[cfg.face.nose] ?? NOSE_STYLES.soft;
  const ny = face.noseY + st.len;
  const ww = st.ww;
  let out = '';
  // bridge: light side left, shaded side right
  out += d.softStroke(`M${CX + 3},${n2(face.eyeY + 3)}Q${CX + ww * 0.55},${n2(ny - 12)} ${n2(CX + ww * 0.62)},${n2(ny - 3)}`, skin.deep, 1.7, 0.4);
  out += d.softStroke(`M${CX - 2.5},${n2(face.eyeY + 4)}Q${CX - ww * 0.35},${n2(ny - 12)} ${n2(CX - ww * 0.4)},${n2(ny - 4)}`, skin.light, 1.4, 0.55);
  // shadow under the tip
  out += d.glow(CX + 0.8, ny + 3.4, ww * 1.2, 3.4, skin.deep, 0.4);
  // tip + wings
  out += d.glow(CX - 0.8, ny - 2.6, 3.6 * st.tip, 3 * st.tip, skin.light, 0.75);
  for (const s of [-1, 1] as const) {
    const o = s > 0 ? 0.62 : 0.4;
    out += `<path d="M${n2(CX + s * (ww * 0.62))},${n2(ny - 3.4)}Q${n2(CX + s * (ww + 1.6))},${n2(ny - 0.6)} ${n2(CX + s * (ww * 0.78))},${n2(ny + 2.4)}Q${n2(CX + s * (ww * 0.52))},${n2(ny + 4)} ${n2(CX + s * ww * 0.3)},${n2(ny + 3.1)}" fill="none" stroke="${skin.deep}" stroke-width="1" stroke-linecap="round" opacity="${o * 0.62}"/>`;
    out += `<ellipse cx="${n2(CX + s * ww * 0.47)}" cy="${n2(ny + 2.5)}" rx="${n2(1.5 * st.tip)}" ry="1" fill="${skin.deep}" opacity=".62"/>`;
  }
  return out;
}

// ------------------------------------------------------------------ mouth
export const MOUTH_STYLES: Record<string, { name: string; w: number; up: number; lo: number; cupid: number }> = {
  balanced: { name: 'Balanced', w: 25, up: 4.8, lo: 7, cupid: 0.9 },
  full:     { name: 'Full',     w: 25, up: 4.8, lo: 7.2, cupid: 0.7 },
  thin:     { name: 'Slim',     w: 23, up: 2.7, lo: 3.9, cupid: 0.6 },
  heart:    { name: 'Heart',    w: 22, up: 4.8, lo: 5.8, cupid: 1.5 },
  petite:   { name: 'Petite',   w: 18, up: 3.6, lo: 5,   cupid: 0.8 },
  wide:     { name: 'Wide',     w: 29, up: 3.8, lo: 5.8, cupid: 0.6 },
};
export const MOUTH_IDS = Object.keys(MOUTH_STYLES);

export function renderMouth(c: Ctx): string {
  const { d, face, skin, cfg } = c;
  const st = MOUTH_STYLES[cfg.face.mouth] ?? MOUTH_STYLES.balanced;
  const ex = EXPRESSIONS[cfg.expression];
  const w = st.w * ex.mouthW;
  const cy = face.mouthY;
  const lift = ex.smile * 4.6;
  const lipC = cfg.face.lipColor;
  const openH = ex.open * (ex.mouthW < 0.7 ? 11 : 9.5);
  const T = [-1, -0.8, -0.55, -0.28, 0, 0.28, 0.55, 0.8, 1];
  // lip line y(t): corners lifted for a smile
  const line = (t: number) => cy - lift * t * t + (t > 0 ? ex.smirk * 2.1 * t * t : 0) + (ex.smile < 0 ? -ex.smile * 0 : 0);
  const X = (t: number) => CX + t * (w / 2) + (ex.smirk ? ex.smirk * 0.7 * t : 0);
  const prof = (t: number) => Math.pow(Math.max(0, 1 - t * t), 0.62);
  const upTop = T.map((t) => [X(t), line(t) - st.up * prof(t) + (Math.abs(t) < 0.05 ? st.up * 0.14 * st.cupid : 0) - (Math.abs(Math.abs(t) - 0.28) < 0.05 ? st.cupid * 0.55 : 0)] as Pt);
  const loBot = T.map((t) => [X(t), line(t) + openH * prof(t) + st.lo * Math.pow(Math.max(0, 1 - t * t), 0.7)] as Pt);
  const lineTop = T.map((t) => [X(t), line(t)] as Pt);
  const lineBot = T.map((t) => [X(t), line(t) + openH * prof(t)] as Pt);

  let out = '';
  const upper = `${spline(upTop, false, 0.19)}${spline([...lineTop].reverse(), false, 0.19, false).replace(/^M[^C]*/, '')}Z`;
  const upperPath = spline(upTop, false, 0.19) + 'L' + P2(lineTop[lineTop.length - 1]) + spline([...lineTop].reverse(), false, 0.19, false) + 'Z';
  const lowerPath = spline(lineBot, false, 0.19) + 'L' + P2(loBot[loBot.length - 1]) + spline([...loBot].reverse(), false, 0.19, false) + 'Z';
  void upper;
  // lip gradients
  const lipHi = lighten(lipC, 0.1), lipLo = darken(lipC, 0.12);
  const upG = d.linear(0, cy - st.up, 0, cy, [[0, lipC], [1, lipLo]]);
  const loG = d.linear(0, cy + openH, 0, cy + openH + st.lo, [[0, lipC], [0.6, lipHi], [1, lipC]]);

  if (openH > 0.6) {
    const inside = spline(lineTop, false, 0.19) + 'L' + P2(lineBot[lineBot.length - 1]) + spline([...lineBot].reverse(), false, 0.19, false) + 'Z';
    const clip = d.clip(`<path d="${inside}"/>`);
    out += `<path d="${inside}" fill="#4a1820"/>`;
    out += `<g clip-path="${clip}">`;
    if (ex.teeth) out += `<rect x="${n2(CX - w / 2)}" y="${n2(cy - 1)}" width="${n2(w)}" height="${n2(openH * 0.52 + 1)}" rx="2.2" fill="#fbf7f2"/><path d="M${CX},${n2(cy)}v${n2(openH * 0.5)}" stroke="#e7ddd6" stroke-width=".6"/>`;
    out += `<ellipse cx="${CX}" cy="${n2(cy + openH * 0.95)}" rx="${n2(w * 0.28)}" ry="${n2(openH * 0.4)}" fill="#c9626f"/>`;
    out += `</g>`;
  }
  out += `<path d="${lowerPath}" fill="${loG}"/>`;
  out += `<path d="${upperPath}" fill="${upG}"/>`;
  // lip line, corners and highlight
  out += `<path d="${spline(lineTop, false, 0.19)}" fill="none" stroke="${darken(lipC, 0.38)}" stroke-width=".9" stroke-linecap="round" opacity=".55"/>`;
  out += `<ellipse cx="${CX - 2}" cy="${n2(line(0) + openH + st.lo * 0.45)}" rx="${n2(w * 0.17)}" ry="1.3" fill="#fff" opacity=".42"/>`;
  if (ex.smile > 0.3) for (const s of [-1, 1] as const) {
    const t = s, x = X(t), y = line(t);
    out += `<path d="M${n2(x + s * 0.6)},${n2(y - 2.4)}Q${n2(x + s * 2.6)},${n2(y)} ${n2(x + s * 0.8)},${n2(y + 2.2)}" fill="none" stroke="${skin.deep}" stroke-width=".9" stroke-linecap="round" opacity=".45"/>`;
  }
  return out;
}

// ------------------------------------------------------------------ skin-level details
export function renderFaceBase(c: Ctx): string {
  const { d, face, skin, cfg } = c;
  const ex = EXPRESSIONS[cfg.expression];
  const base = d.linear(CX - 52, 0, CX + 52, 0, [[0, skin.light], [0.4, skin.base], [1, mix(skin.base, skin.shade, 0.5)]]);
  let out = d.volume(`<path d="${face.path}" fill="${base}"/>`, [face.path], { blur: 8, scale: 4.6, spec: 0.22 });
  const clip = d.clip(`<path d="${face.path}"/>`);
  out += `<g clip-path="${clip}">`;
  // forehead shade under hair, jaw / chin shade, cheek light
  out += `<rect x="${CX - 60}" y="${face.top}" width="120" height="40" fill="${d.linear(0, face.top, 0, face.top + 40, [[0, skin.deep, 0.42], [1, skin.deep, 0]])}"/>`;
  out += d.glow(CX + 30, face.chin + 6, 58, 30, skin.deep, 0.36);
  out += d.glow(CX - 17, face.eyeY + 22, 26, 21, skin.light, 0.6);
  // cheek blush
  const blush = clamp(cfg.face.cheeks * 0.2 + ex.blush * 0.35, 0, 0.85);
  if (blush > 0.02) for (const s of [-1, 1] as const) {
    const bx = CX + s * (face.hw(face.eyeY + 22) * 0.56), by = face.eyeY + 23;
    out += d.glow(bx, by, 15, 10, skin.blush, Math.min(1, blush * 1.1));
  }
  // freckles
  if (cfg.face.freckles > 0) {
    const r = rng(7 + cfg.face.freckles);
    const cnt = cfg.face.freckles === 1 ? 12 : 26;
    for (let i = 0; i < cnt; i++) {
      const s = i % 2 ? 1 : -1;
      const x = CX + s * (4 + r() * 24), y = face.eyeY + 9 + r() * 14 + (Math.abs(x - CX) < 10 ? -4 : 0);
      out += `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(0.55 + r() * 0.55)}" fill="${mix(skin.deep, '#7b3f22', 0.5)}" opacity="${n2(0.4 + r() * 0.3)}"/>`;
    }
  }
  if (cfg.face.mole !== 'none') {
    const m = cfg.face.mole === 'cheek' ? [CX + 25, face.eyeY + 22] : cfg.face.mole === 'lip' ? [CX + 14, face.mouthY + 5] : [CX - 8, face.chin - 7];
    out += `<circle cx="${m[0]}" cy="${m[1]}" r="1.25" fill="#4a2a22" opacity=".85"/>`;
  }
  out += `</g>`;
  return out;
}

export function renderFaceFeatures(c: Ctx): string {
  return renderBrows(c) + renderEyes(c) + renderNose(c) + renderMouth(c);
}

export function renderEars(c: Ctx): string {
  const { d, face, skin } = c;
  let out = '';
  for (const s of [-1, 1] as const) {
    const x = CX + s * (face.hw(face.eyeY + 8) - 1.5), y = face.eyeY + 7;
    const g = d.linear(x - 7, 0, x + 7, 0, [[0, skin.light], [1, skin.shade]]);
    out += `<ellipse cx="${n2(x + s * 3)}" cy="${n2(y)}" rx="6.2" ry="11.5" fill="${g}" transform="${rot(s * -6, n2(x + s * 3), n2(y))}"/>`;
    out += `<path d="M${n2(x + s * 4)},${n2(y - 6)}Q${n2(x + s * 8)},${n2(y)} ${n2(x + s * 4)},${n2(y + 6)}" fill="none" stroke="${skin.ear}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`;
  }
  return out;
}
void polyline; void tone;
