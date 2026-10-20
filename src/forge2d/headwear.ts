// Head coverings: hijabs (several wraps and fabrics), turbans and hats.
// Hijabs are built from the live face outline (an even-odd opening) so they fit every face shape with no gaps,
// and they fully hide the hair layers (see compat.ts).
import { CX, Pt, clamp, darken, lerp, lighten, luma, mix, n2, spline, symLoop, rot } from './geom';
import type { Ctx, Fabric } from './types';
import { edge } from './garment';

export interface HeadwearDef {
  id: string; name: string; kind: 'hijab' | 'turban' | 'hat';
  coverage: 'none' | 'partial' | 'full';
  hidesEars?: boolean; coversNeck?: boolean;
  /** hair tags that cannot be combined with this piece */
  excludesHair?: string[];
  tags?: string[];
  render: (c: Ctx) => { back: string; front: string };
}

const ptsR = (a: [number, number][]): Pt[] => a.map(([x, y]) => [CX + x, y]);

// ---------------------------------------------------------------- hijab
interface HijabShape { right: [number, number][]; left?: [number, number][]; folds: number; knot?: boolean; wrapBands?: boolean; loop?: boolean; cap?: boolean; sport?: boolean; dots?: boolean; noOpeningShadow?: boolean }
const HIJABS: Record<string, { name: string; kind?: 'hijab' | 'turban'; shape: HijabShape }> = {
  'hijab-classic':  { name: 'Classic drape', shape: { folds: 3, right: [[0, 26], [30, 29], [52, 44], [64, 72], [69, 104], [68, 136], [64, 166], [68, 188], [76, 210], [80, 236], [76, 262], [58, 280], [0, 288]] } },
  'hijab-short':    { name: 'Pinned short',  shape: { folds: 2, right: [[0, 26], [30, 29], [52, 44], [64, 72], [68, 104], [67, 136], [63, 166], [66, 188], [72, 206], [74, 222], [54, 236], [0, 241]] } },
  'hijab-long':     { name: 'Long drape',    shape: { folds: 4, right: [[0, 26], [30, 29], [52, 44], [65, 72], [70, 104], [70, 136], [66, 166], [72, 190], [82, 218], [86, 262], [84, 308], [62, 332], [0, 340]] } },
  'hijab-alamira':  { name: 'Al-amira',      shape: { folds: 2, loop: true, cap: true, right: [[0, 28], [30, 31], [52, 46], [63, 72], [66, 104], [65, 136], [61, 164], [66, 186], [72, 206], [74, 230], [60, 246], [0, 252]] } },
  'hijab-sport':    { name: 'Sport fit',     shape: { folds: 1, sport: true, right: [[0, 28], [30, 31], [51, 46], [61, 72], [63, 104], [62, 136], [58, 166], [54, 188], [60, 206], [58, 220], [0, 226]] } },
  'hijab-volume':   { name: 'Volume wrap',   shape: { folds: 3, right: [[0, 16], [30, 19], [55, 36], [67, 66], [71, 102], [69, 136], [64, 166], [70, 190], [78, 214], [82, 240], [78, 266], [60, 284], [0, 292]] } },
  'hijab-shayla':   { name: 'Shoulder drape', shape: { folds: 3, wrapBands: true,
      right: [[0, 26], [30, 29], [52, 44], [64, 72], [69, 104], [68, 136], [65, 166], [72, 190], [84, 220], [90, 260], [86, 300], [64, 320], [0, 326]],
      left:  [[0, 26], [30, 29], [52, 44], [64, 72], [68, 104], [67, 136], [63, 166], [63, 188], [67, 208], [67, 226], [50, 238], [0, 244]] } },
  'hijab-wrap':     { name: 'Twisted wrap',  shape: { folds: 2, knot: true, wrapBands: true, right: [[0, 24], [32, 28], [56, 44], [66, 76], [70, 106], [68, 136], [63, 166], [66, 190], [72, 206], [70, 222], [48, 234], [0, 238]] } },
  'headwrap':       { name: 'Printed head wrap', kind: 'turban', shape: { folds: 0, dots: true, knot: true, noOpeningShadow: true, right: [[0, 22], [30, 26], [52, 42], [61, 66], [64, 98], [63, 124], [56, 142], [30, 150], [0, 154]] } },
};

const FABRIC: Record<Fabric, { hi: number; fold: number; opacity: number }> = {
  matte: { hi: 0.1, fold: 0.2, opacity: 1 }, satin: { hi: 0.3, fold: 0.26, opacity: 1 }, chiffon: { hi: 0.16, fold: 0.16, opacity: 0.95 }, jersey: { hi: 0.12, fold: 0.1, opacity: 1 },
};

function openingPts(c: Ctx, topY = 68): Pt[] {
  const g = c.face;
  const ys = [106, 122, 138, 152, 163, 170].filter((y) => y < g.chin - 3);
  return [[CX, topY], [CX + 18, topY + 2], [CX + 33, topY + 10], [CX + 43, topY + 25], ...ys.map((y) => [CX + g.hw(y) * 0.99, y] as Pt), [CX, g.chin + 1.5]];
}

function renderHijab(c: Ctx, id: string): { back: string; front: string } {
  const def = HIJABS[id];
  const sh = def.shape;
  const { d, cfg } = c;
  const color = cfg.headwear.color;
  const fab = FABRIC[cfg.headwear.fabric] ?? FABRIC.matte;
  const rightPts = ptsR(sh.right);
  const leftPts = sh.left ? ptsR(sh.left).map(([x, y]) => [2 * CX - x, y] as Pt) : null;
  const loop = leftPts ? [...rightPts, ...leftPts.slice(1, -1).reverse()] : symLoop(rightPts);
  const outer = spline(loop, true, 1 / 6);
  const op = openingPts(c, sh.sport ? 74 : 68);
  const hole = spline(symLoop(op), true, 1 / 6);
  const mask = d.mask(`<path d="${outer}" fill="#fff"/><path d="${hole}" fill="#000"/>`);
  const maxX = Math.max(...sh.right.map(([x]) => x)) + 4;
  const grad = d.linear(CX - maxX, 0, CX + maxX, 0, [[0, lighten(color, luma(color) > 0.85 ? 0.02 : 0.09)], [0.42, color], [1, darken(color, luma(color) > 0.8 ? 0.12 : 0.17)]]);
  let out = '';
  const hemY = Math.max(...sh.right.map(([, y]) => y));
  // soft shadow the drape casts on the clothes
  out += sh.dots ? '' : d.glow(CX, hemY - 8, maxX, 16, '#000', 0.26);
  out += `<g mask="${mask}"><path d="${outer}" fill="${grad}" opacity="${fab.opacity}"/>`;
  // tension lines around the face (concentric to the opening)
  for (const k of [1.1, 1.2, 1.31]) {
    for (const s2 of [-1, 1] as const) {
      const arc = spline(op.slice(0, 8).map(([x, y]) => [CX + s2 * (x - CX) * k, 112 + (y - 112) * k * 0.98] as Pt), false, 1 / 6);
      out += `<path d="${arc}" fill="none" stroke="${darken(color, 0.3)}" stroke-width="1.6" opacity="${n2(fab.fold * 0.5)}"/>`;
    }
  }
  // folds that fall from the jaw over the shoulders
  const FL: Pt[][] = [];
  const nf = sh.folds;
  if (sh.dots) out += `<rect x="${CX - 100}" y="10" width="200" height="160" fill="${d.pattern(9, 9, `<circle cx="2.5" cy="2.5" r="1.15" fill="${lighten(color, 0.32)}" opacity=".75"/><circle cx="7" cy="7" r="1.15" fill="${lighten(color, 0.32)}" opacity=".75"/>`)}"/>`;
  for (let i = 0; i < nf; i++) {
    for (const s of [-1, 1] as const) {
      const t = (i + 1) / (nf + 1);
      const x0 = CX + s * lerp(34, 60, t), x1 = CX + s * lerp(48, maxX - 14, t) * (leftPts ? (s < 0 ? 0.82 : 1) : 1);
      FL.push([[x0, 172], [lerp(x0, x1, 0.35) - s * 3, lerp(190, hemY, 0.35)], [lerp(x0, x1, 0.75) + s * 2, lerp(190, hemY, 0.72)], [x1, hemY - 8]]);
    }
  }
  for (const f of FL) {
    const p = spline(f);
    out += d.softStroke(p, darken(color, 0.32), 1.8, fab.fold * 1.7);
    out += d.softStroke(p, lighten(color, 0.2), 1.3, fab.fold * 1.8, ' transform="translate(-3.2 0)"');
  }
  // under-chin pinch where the fabric gathers
  if (!sh.sport && !sh.dots) out += `<path d="M${CX - 22},${c.face.chin + 5}Q${CX},${c.face.chin + 15} ${CX + 22},${c.face.chin + 5}" fill="none" stroke="${darken(color, 0.34)}" stroke-width="1.3" opacity=".5"/>`;
  // crossing layer / diagonal panel
  if (sh.wrapBands) {
    out += `<path d="M${CX - 30},${c.face.chin + 4}Q${CX + 20},${c.face.chin + 40} ${CX + 70},${c.face.chin + 100}L${CX + 90},${c.face.chin + 96}Q${CX + 40},${c.face.chin + 28} ${CX - 24},${c.face.chin - 6}Z" fill="${darken(color, 0.05)}" opacity=".55"/><path d="M${CX - 30},${c.face.chin + 4}Q${CX + 20},${c.face.chin + 40} ${CX + 70},${c.face.chin + 100}" fill="none" stroke="${darken(color, 0.35)}" stroke-width="1.4" opacity=".55"/>`;
  }
  if (sh.loop) out += `<path d="M${CX - 74},${hemY - 40}Q${CX},${hemY - 18} ${CX + 74},${hemY - 40}" fill="none" stroke="${darken(color, 0.32)}" stroke-width="1.5" opacity=".6"/><path d="M${CX - 74},${hemY - 44}Q${CX},${hemY - 22} ${CX + 74},${hemY - 44}" fill="none" stroke="${lighten(color, 0.2)}" stroke-width="1.4" opacity=".4"/>`;
  // sheen
  out += d.glow(CX - 38, 62, 30, 17, '#fff', Math.min(1, fab.hi * 1.2));
  out += d.softStroke(`M${CX - 52},96Q${CX - 62},140 ${CX - 70},190`, '#fff', 3, fab.hi * 1.2);
  if (cfg.headwear.fabric === 'jersey' || sh.sport) out += `<rect x="${CX - 110}" y="150" width="220" height="${Math.max(0, Math.min(hemY, 240) - 150)}" fill="${d.pattern(3, 3, `<path d="M0,1.5H3" stroke="${darken(color, 0.2)}" stroke-width=".5" opacity=".2"/>`)}"/>`;
  out += `<path d="${outer}" fill="none" stroke="${edge(color)}" stroke-width="1.1" stroke-linejoin="round" opacity=".9"/>`;
  out += `</g>`;
  // knot of a twisted wrap
  if (sh.knot) {
    const kx = sh.dots ? CX + 52 : CX + 40, ky = sh.dots ? 112 : 76;
    out += `<g><ellipse cx="${kx}" cy="${ky}" rx="12" ry="9" fill="${darken(color, 0.04)}" stroke="${edge(color)}" stroke-width="1" transform="${rot(-20, kx, ky)}"/><path d="M${kx - 8},${ky - 2}Q${kx},${ky - 8} ${kx + 8},${ky + 2}M${kx - 6},${ky + 4}Q${kx},${ky - 1} ${kx + 8},${ky + 6}" fill="none" stroke="${darken(color, 0.34)}" stroke-width="1.3" opacity=".6"/></g>`;
  }
  // face-opening edge and its shadow onto the skin
  const holeClip = d.clip(`<path d="${hole}"/>`);
  out += `<g clip-path="${holeClip}">${d.softStroke(hole, c.skin.deep, 4.5, sh.noOpeningShadow ? 0.34 : 0.55)}</g>`;
  out += `<path d="${hole}" fill="none" stroke="${darken(color, 0.3)}" stroke-width="1.2" opacity=".75"/>`;
  out += `<path d="${hole}" fill="none" stroke="${lighten(color, 0.16)}" stroke-width="1.4" opacity=".55" transform="translate(0 -1.1)"/>`;
  // undercap band along the hairline
  if (cfg.headwear.undercap || sh.cap) {
    const uc = cfg.headwear.undercap ? mix(color, '#000000', 0.18) : darken(color, 0.12);
    const half = op.slice(0, 4);
    const arcPts: Pt[] = [...half.slice(1).map(([x, y]) => [2 * CX - x, y] as Pt).reverse(), ...half];
    const arc = spline(arcPts, false, 1 / 6);
    out += `<g clip-path="${holeClip}"><path d="${arc}" fill="none" stroke="${uc}" stroke-width="5" opacity=".96" transform="translate(0 -1)"/><path d="${arc}" fill="none" stroke="${lighten(uc, 0.22)}" stroke-width="1" opacity=".5" transform="translate(0 3)"/></g>`;
  }
  return { back: '', front: out };
}

// ---------------------------------------------------------------- turbans
function renderTurbanTwist(c: Ctx) {
  const { d } = c;
  const color = c.cfg.headwear.color;
  const base = spline(symLoop(ptsR([[0, 14], [30, 18], [54, 34], [65, 58], [68, 86], [64, 104], [46, 98], [30, 88], [0, 80]])), true, 1 / 6);
  const clip = d.clip(`<path d="${base}"/>`);
  let out = `<path d="${base}" fill="${d.linear(CX - 66, 0, CX + 66, 0, [[0, lighten(color, 0.1)], [0.45, color], [1, darken(color, 0.18)]])}"/>`;
  out += `<g clip-path="${clip}">`;
  for (let i = 0; i < 6; i++) {
    const y = 28 + i * 11;
    out += `<path d="M${CX - 74},${y + 30}Q${CX - 10},${y - 12} ${CX + 74},${y + 4}" fill="none" stroke="${darken(color, 0.3)}" stroke-width="2.4" opacity=".32"/><path d="M${CX - 74},${y + 27}Q${CX - 10},${y - 15} ${CX + 74},${y + 1}" fill="none" stroke="${lighten(color, 0.2)}" stroke-width="2" opacity=".35"/>`;
  }
  out += `${d.glow(CX - 24, 34, 22 * 1.3, 9 * 1.3, "#fff", 0.21000000000000002)}</g>`;
  out += `<path d="${base}" fill="none" stroke="${edge(color)}" stroke-width="1.1"/>`;
  // front knot
  out += `<g transform="translate(${CX + 16} 52)"><path d="M-6,0Q-18,-8 -24,2Q-16,14 -4,6Z" fill="${darken(color, 0.04)}" stroke="${edge(color)}" stroke-width="1"/><path d="M6,0Q18,-8 24,2Q16,14 4,6Z" fill="${darken(color, 0.04)}" stroke="${edge(color)}" stroke-width="1"/><ellipse cx="0" cy="3" rx="8" ry="7" fill="${color}" stroke="${edge(color)}" stroke-width="1"/><path d="M-5,0Q0,-3 5,1M-4,6Q0,2 5,6" fill="none" stroke="${darken(color, 0.34)}" stroke-width="1.2" opacity=".6"/></g>`;
  return { back: '', front: out };
}

// ---------------------------------------------------------------- hats
function brimShape(rx: number, ry: number, cy: number) { return `M${CX - rx},${cy}Q${CX},${cy + ry * 2} ${CX + rx},${cy}Q${CX},${cy - ry * 0.2} ${CX - rx},${cy}Z`; }

function renderBeanie(c: Ctx) {
  const { d } = c;
  const color = c.cfg.headwear.color;
  const dome = spline(symLoop(ptsR([[0, 14], [28, 17], [50, 32], [58, 54], [59, 76], [0, 78]])), true, 1 / 6);
  const clip = d.clip(`<path d="${dome}"/>`);
  let out = `<path d="${dome}" fill="${d.linear(CX - 60, 0, CX + 60, 0, [[0, lighten(color, 0.1)], [0.45, color], [1, darken(color, 0.2)]])}"/>`;
  out += `<g clip-path="${clip}"><rect x="${CX - 70}" y="10" width="140" height="70" fill="${d.pattern(7, 7, `<path d="M.5,.5L3.5,6.5L6.5,.5" fill="none" stroke="${darken(color, 0.22)}" stroke-width="1" opacity=".5"/>`)}"/></g>`;
  // folded cuff
  const cuff = `M${CX - 61},${n2(60)}Q${CX},${n2(66)} ${CX + 61},${n2(60)}L${CX + 62},${n2(86)}Q${CX},${n2(92)} ${CX - 62},${n2(86)}Z`;
  out += `<path d="${cuff}" fill="${darken(color, 0.04)}" stroke="${edge(color)}" stroke-width="1.1"/>`;
  out += `<g clip-path="${d.clip(`<path d="${cuff}"/>`)}"><rect x="${CX - 70}" y="56" width="140" height="40" fill="${d.pattern(4, 8, `<rect width="1.4" height="8" fill="${darken(color, 0.25)}" opacity=".5"/>`)}"/></g>`;
  out += `${d.glow(CX - 22, 34, 18 * 1.3, 8 * 1.3, "#fff", 0.195)}`;
  out += `<circle cx="${CX}" cy="12" r="11" fill="${lighten(color, 0.12)}" stroke="${edge(color)}" stroke-width="1"/><circle cx="${CX}" cy="12" r="11" fill="${d.pattern(5, 5, `<circle cx="1.5" cy="1.5" r="1.2" fill="${darken(color, 0.18)}" opacity=".5"/>`)}"/>`;
  return { back: '', front: out };
}

function renderCap(c: Ctx) {
  const { d } = c;
  const color = c.cfg.headwear.color;
  const dome = spline(symLoop(ptsR([[0, 22], [28, 25], [50, 38], [58, 58], [58, 76], [0, 80]])), true, 1 / 6);
  const clip = d.clip(`<path d="${dome}"/>`);
  let out = `<path d="${dome}" fill="${d.linear(CX - 60, 0, CX + 60, 0, [[0, lighten(color, 0.1)], [0.45, color], [1, darken(color, 0.2)]])}"/>`;
  out += `<g clip-path="${clip}"><path d="M${CX},22V80M${CX - 28},28Q${CX - 36},56 ${CX - 30},80M${CX + 28},28Q${CX + 36},56 ${CX + 30},80" fill="none" stroke="${darken(color, 0.3)}" stroke-width="1" opacity=".5"/>${d.glow(CX - 22, 40, 18 * 1.3, 9 * 1.3, "#fff", 0.24)}</g>`;
  out += `<circle cx="${CX}" cy="22" r="3.4" fill="${darken(color, 0.1)}" stroke="${edge(color)}" stroke-width=".8"/>`;
  out += `<path d="${dome}" fill="none" stroke="${edge(color)}" stroke-width="1.1"/>`;
  // visor
  const vis = `M${CX - 62},74Q${CX - 66},88 ${CX - 34},94Q${CX},104 ${CX + 34},94Q${CX + 66},88 ${CX + 62},74Q${CX},84 ${CX - 62},74Z`;
  out += `<path d="${vis}" fill="${d.linear(0, 74, 0, 104, [[0, darken(color, 0.12)], [1, darken(color, 0.34)]])}" stroke="${edge(color)}" stroke-width="1.1" stroke-linejoin="round"/>`;
  out += `<path d="M${CX - 58},76Q${CX},86 ${CX + 58},76" fill="none" stroke="${lighten(color, 0.2)}" stroke-width="1.2" opacity=".5"/>`;
  out += d.softStroke(`M${CX - 48},96Q${CX},108 ${CX + 48},96`, '#000', 3, 0.2);
  return { back: '', front: out };
}

function renderBucket(c: Ctx) {
  const { d } = c;
  const color = c.cfg.headwear.color;
  const crown = spline(symLoop(ptsR([[0, 26], [26, 28], [46, 38], [54, 56], [58, 74], [0, 76]])), true, 1 / 6);
  const brim = `M${CX - 72},76Q${CX - 76},92 ${CX - 40},96Q${CX},104 ${CX + 40},96Q${CX + 76},92 ${CX + 72},76Q${CX},64 ${CX - 72},76Z`;
  let out = `<path d="${brim}" fill="${d.linear(CX - 72, 0, CX + 72, 0, [[0, lighten(color, 0.04)], [0.5, color], [1, darken(color, 0.22)]])}" stroke="${edge(color)}" stroke-width="1.1" stroke-linejoin="round"/>`;
  out += `<path d="${crown}" fill="${d.linear(CX - 60, 0, CX + 60, 0, [[0, lighten(color, 0.1)], [0.45, color], [1, darken(color, 0.2)]])}" stroke="${edge(color)}" stroke-width="1.1"/>`;
  out += `<path d="M${CX - 56},68Q${CX},74 ${CX + 56},68L${CX + 58},76Q${CX},82 ${CX - 58},76Z" fill="${darken(color, 0.22)}" opacity=".8"/>`;
  out += `<path d="M${CX - 50},84Q${CX},92 ${CX + 50},84M${CX - 40},90Q${CX},98 ${CX + 40},90" fill="none" stroke="${darken(color, 0.3)}" stroke-width=".9" stroke-dasharray="2.4 2" opacity=".5"/>`;
  out += `${d.glow(CX - 20, 40, 16 * 1.3, 7 * 1.3, "#fff", 0.21000000000000002)}`;
  return { back: '', front: out };
}

function renderBeret(c: Ctx) {
  const { d } = c;
  const color = c.cfg.headwear.color;
  const cx = CX + 8;
  const body = spline(symLoop(ptsR([[8, 16], [44, 20], [68, 36], [70, 56], [52, 70], [8, 68]]).map(([x, y]) => [x, y] as Pt), 200), true, 1 / 6);
  void cx;
  const sh = `<g transform="${rot(-9, CX, 46)}">`;
  let out = sh + `<path d="${body}" fill="${d.linear(CX - 70, 0, CX + 70, 0, [[0, lighten(color, 0.1)], [0.5, color], [1, darken(color, 0.22)]])}" stroke="${edge(color)}" stroke-width="1.1"/>`;
  out += `<path d="M${CX - 62},62Q${CX},74 ${CX + 62},62" fill="none" stroke="${darken(color, 0.34)}" stroke-width="1.3" opacity=".55"/>`;
  out += `<path d="M${CX - 20},24Q${CX - 8},36 ${CX - 26},52M${CX + 10},22Q${CX + 20},36 ${CX + 6},52" fill="none" stroke="${darken(color, 0.3)}" stroke-width="1.2" opacity=".28"/>`;
  out += `<rect x="${CX - 3}" y="6" width="6" height="10" rx="2.4" fill="${darken(color, 0.08)}" stroke="${edge(color)}" stroke-width=".9"/>`;
  out += `${d.glow(CX - 26, 34, 20 * 1.3, 8 * 1.3, "#fff", 0.21000000000000002)}</g>`;
  return { back: '', front: out };
}

function renderSunhat(c: Ctx) {
  const { d } = c;
  const color = c.cfg.headwear.color;
  const brimBack = `M${CX - 120},64Q${CX},40 ${CX + 120},64Q${CX},60 ${CX - 120},64Z`;
  const brim = `M${CX - 122},66Q${CX - 124},82 ${CX - 70},88Q${CX},100 ${CX + 70},88Q${CX + 124},82 ${CX + 122},66Q${CX},50 ${CX - 122},66Z`;
  const crown = spline(symLoop(ptsR([[0, 14], [26, 16], [46, 28], [54, 48], [56, 66], [0, 68]])), true, 1 / 6);
  let out = d.glow(CX, 112, 80, 32, '#000', 0.16);
  out += `<path d="${brim}" fill="${d.linear(CX - 122, 0, CX + 122, 0, [[0, lighten(color, 0.08)], [0.5, color], [1, darken(color, 0.22)]])}" stroke="${edge(color)}" stroke-width="1.1" stroke-linejoin="round"/>`;
  out += `<g clip-path="${d.clip(`<path d="${brim}"/>`)}"><rect x="${CX - 130}" y="50" width="260" height="60" fill="${d.pattern(5, 5, `<path d="M0,5L5,0" stroke="${darken(color, 0.25)}" stroke-width=".7" opacity=".4"/><path d="M0,0L5,5" stroke="${lighten(color, 0.2)}" stroke-width=".6" opacity=".3"/>`)}"/></g>`;
  out += `<path d="${crown}" fill="${d.linear(CX - 56, 0, CX + 56, 0, [[0, lighten(color, 0.1)], [0.45, color], [1, darken(color, 0.2)]])}" stroke="${edge(color)}" stroke-width="1.1"/>`;
  out += `<path d="M${CX - 55},56Q${CX},64 ${CX + 55},56L${CX + 56},66Q${CX},72 ${CX - 56},66Z" fill="${darken(color, 0.4)}" opacity=".85"/>`;
  void brimBack;
  return { back: '', front: out };
}

export const HEADWEAR: HeadwearDef[] = [
  ...Object.entries(HIJABS).map(([id, h]): HeadwearDef => h.kind === 'turban'
    ? { id, name: h.name, kind: 'turban', coverage: 'full', hidesEars: true, tags: ['turban'], render: (c) => renderHijab(c, id) }
    : { id, name: h.name, kind: 'hijab', coverage: 'full', hidesEars: true, coversNeck: true, tags: ['hijab', 'modest', 'high-neck'], render: (c) => renderHijab(c, id) }),
  { id: 'turban-twist', name: 'Twisted turban', kind: 'turban', coverage: 'full', tags: ['turban'], render: renderTurbanTwist },
  { id: 'beanie', name: 'Beanie', kind: 'hat', coverage: 'partial', excludesHair: ['high', 'wide', 'bun'], tags: ['hat'], render: renderBeanie },
  { id: 'cap', name: 'Baseball cap', kind: 'hat', coverage: 'partial', excludesHair: ['high', 'wide', 'bun'], tags: ['hat'], render: renderCap },
  { id: 'bucket', name: 'Bucket hat', kind: 'hat', coverage: 'partial', excludesHair: ['high', 'wide', 'bun'], tags: ['hat'], render: renderBucket },
  { id: 'beret', name: 'Beret', kind: 'hat', coverage: 'partial', excludesHair: ['high', 'wide', 'bun'], tags: ['hat'], render: renderBeret },
  { id: 'sunhat', name: 'Wide-brim hat', kind: 'hat', coverage: 'partial', excludesHair: ['high', 'wide', 'bun'], tags: ['hat'], render: renderSunhat },
];
export const HEADWEAR_BY_ID: Record<string, HeadwearDef> = Object.fromEntries(HEADWEAR.map((h) => [h.id, h]));
export const renderHeadwear = (c: Ctx, h: HeadwearDef) => h.render(c);
void clamp;
