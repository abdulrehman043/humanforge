// Custom hair silhouettes: pulled-back styles, buns, ponytails, braids and coily / curly volume.
import { CX, Pt, darken, lerp, lerpPt, lighten, mirrorPts, n2, rng, spline, rot } from './geom';
import type { Ctx } from './types';
import { HairDef, band, hairFill, hairPalette, hairPieces, resample } from './hair';

// --------------------------------------------------------------- shared pieces
/** Hair pulled back over the skull. Returns the pieces for both sides (strands flow from the part to the back). */
function capPieces(c: Ctx, o: { hairline?: number; part?: number; vol?: number; sweep?: boolean } = {}) {
  const g = c.face;
  const hy = o.hairline ?? 60, vol = o.vol ?? 0;
  const pieces: { path: string; A: Pt[]; B: Pt[]; strandN: number; sheen?: boolean }[] = [];
  for (const s of [1, -1] as const) {
    const px = (o.part ?? CX) ;
    const A: Pt[] = [[px, hy], [CX + s * 12, hy + 1.5], [CX + s * 26, hy + 8], [CX + s * 38, hy + 21], [CX + s * (g.hw(100) - 0.5), 100], [CX + s * (g.hw(114) + 1), 114]];
    const B: Pt[] = [[px, 38], [CX + s * 28, 40 - vol * 0.2], [CX + s * (50 + vol), 55], [CX + s * (58 + vol), 82], [CX + s * (59 + vol * 0.8), 106], [CX + s * (58 + vol * 0.6), 120]];
    pieces.push({ path: band(A, B, 0), A, B, strandN: 10 });
  }
  return pieces;
}

const cloudPts = (cx: number, cy: number, rx: number, ry: number, n: number, amp: number, seed: number, from = 0, to = Math.PI * 2): Pt[] => {
  const r = rng(seed);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = from + (i / (n - 1 || 1)) * (to - from);
    const k = 1 + (i % 2 ? amp : -amp * 0.55) * (0.8 + r() * 0.4);
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
};

function curlPattern(c: Ctx, scale = 1) {
  const p = hairPalette(c);
  const s = 11 * scale;
  return c.d.pattern(s, s, `<path d="M${s * 0.2},${s * 0.7}a${s * 0.28},${s * 0.28} 0 1,1 ${s * 0.5},-${s * 0.1}" fill="none" stroke="${p.deep}" stroke-width="1" stroke-linecap="round" opacity=".38"/><path d="M${s * 0.55},${s * 0.95}a${s * 0.2},${s * 0.2} 0 1,1 ${s * 0.36},-${s * 0.28}" fill="none" stroke="${p.hi}" stroke-width=".9" stroke-linecap="round" opacity=".32"/>`);
}

function blob(c: Ctx, pts: Pt[], y0: number, y1: number, curly = true, k = 0.22) {
  const path = spline(pts, true, k);
  const p = hairPalette(c);
  const clip = c.d.clip(`<path d="${path}"/>`);
  const fill = hairFill(c, y0, y1);
  return `<path d="${path}" fill="${fill}"/>` +
    (curly ? `<g clip-path="${clip}"><rect x="0" y="0" width="400" height="800" fill="${curlPattern(c)}"/></g>` : '') +
    `<g clip-path="${clip}">${c.d.glow(pts[0][0] - 8, y0 + (y1 - y0) * 0.28, 36, 15, p.shine, 0.24)}</g>` +
    `<path d="${path}" fill="none" stroke="${p.deep}" stroke-width=".9" opacity=".4"/>`;
}

function braidChain(c: Ctx, centre: Pt[], w0: number, w1: number, tie: string): string {
  const p = hairPalette(c);
  const pts = resample(centre, Math.max(6, Math.round(pathLen(centre) / 8.5)));
  let out = '';
  const fill = hairFill(c, centre[0][1], centre[centre.length - 1][1] + 10);
  pts.forEach(([x, y], i) => {
    const t = i / (pts.length - 1);
    const w = lerp(w0, w1, t);
    const dir = i % 2 ? 1 : -1;
    const ang = dir * 38;
    out += `<ellipse cx="${n2(x + dir * w * 0.14)}" cy="${n2(y)}" rx="${n2(w * 0.56)}" ry="${n2(7.2)}" transform="${rot(ang, n2(x), n2(y))}" fill="${fill}" stroke="${p.deep}" stroke-width=".8" stroke-opacity=".55"/>`;
    out += `<path d="M${n2(x - w * 0.34)},${n2(y - 1.5)}q${n2(w * 0.34)},${n2(dir * 3)} ${n2(w * 0.68)},0" fill="none" stroke="${p.hi}" stroke-width="1" opacity=".3" transform="${rot(ang, n2(x), n2(y))}"/>`;
  });
  const [tx, ty] = centre[centre.length - 1];
  out += `<ellipse cx="${n2(tx)}" cy="${n2(ty + 4)}" rx="${n2(w1 * 0.5)}" ry="4" fill="${fill}" stroke="${p.deep}" stroke-width=".8" stroke-opacity=".5"/>`;
  out += `<rect x="${n2(tx - w1 * 0.4)}" y="${n2(ty - 2)}" width="${n2(w1 * 0.8)}" height="4.4" rx="2" fill="${tie}" stroke="${darken(tie, 0.3)}" stroke-width=".6"/>`;
  return out;
}
const pathLen = (p: Pt[]) => p.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);

const tieOf = (c: Ctx) => (c.cfg.accessories.hairAccessory === 'none' ? darken(c.hairColor, 0.2) : c.cfg.accessories.hairAccessoryColor);
const partLine = (c: Ctx, px: number, y0 = 40, y1 = 62) => `<path d="M${n2(px)},${y0}V${y1}" stroke="${hairPalette(c).deep}" stroke-width="1.1" opacity=".6"/>`;

// --------------------------------------------------------------- styles
const reg = (id: string, name: string, texture: HairDef['texture'], length: HairDef['length'], tags: string[], render: HairDef['render']): HairDef => ({ id, name, texture, length, tags, render });

export const HAIR_CUSTOM_DEFS: HairDef[] = [
  reg('pony-high', 'High ponytail', 'straight', 'long', ['updo', 'high', 'long'], (c) => {
    const A: Pt[] = [[CX + 2, 34], [CX + 22, 62], [CX + 46, 128], [CX + 54, 204], [CX + 58, 268]];
    const B: Pt[] = [[CX + 16, 14], [CX + 46, 36], [CX + 72, 100], [CX + 88, 172], [CX + 84, 240], [CX + 66, 282]];
    const tail = band(resample(A, 8), resample(B, 8), 8);
    const back = hairPieces(c, [{ path: tail, A: resample(A, 8), B: resample(B, 8), strandN: 12 }], { y0: 14, y1: 290 });
    const cap = hairPieces(c, capPieces(c, { hairline: 58 }), { y0: 36, y1: 120 });
    const tie = `<ellipse cx="${CX + 12}" cy="30" rx="10" ry="5.6" transform="${rot(-24, CX + 12, 30)}" fill="${tieOf(c)}" stroke="${darken(tieOf(c), 0.3)}" stroke-width=".7"/>`;
    return { back, front: cap + partLine(c, CX, 38, 58) + tie };
  }),
  reg('pony-low', 'Side ponytail', 'straight', 'long', ['long', 'down'], (c) => {
    const cap = hairPieces(c, capPieces(c, { hairline: 60, vol: 3 }), { y0: 36, y1: 120 });
    const A: Pt[] = [[CX + 50, 124], [CX + 54, 170], [CX + 55, 230], [CX + 50, 296]];
    const B: Pt[] = [[CX + 62, 116], [CX + 74, 170], [CX + 80, 240], [CX + 70, 318]];
    const tail = band(resample(A, 8), resample(B, 8), 8);
    const front = hairPieces(c, [{ path: tail, A: resample(A, 8), B: resample(B, 8), strandN: 8 }], { y0: 120, y1: 322 });
    const tie = `<rect x="${CX + 52}" y="148" width="22" height="7" rx="3" transform="${rot(8, CX + 60, 150)}" fill="${tieOf(c)}" stroke="${darken(tieOf(c), 0.3)}" stroke-width=".7"/>`;
    return { back: '', front: cap + partLine(c, CX, 38, 60) + front + tie };
  }),
  reg('bun-top', 'Top knot', 'straight', 'short', ['updo', 'high'], (c) => {
    const bun = blob(c, cloudPts(CX, 26, 24, 19, 14, 0.07, 3), 8, 46, false, 0.2);
    const swirl = `<path d="M${CX - 14},28q10,-14 24,-6M${CX - 10},34q14,-12 22,0M${CX - 6},21q9,-4 15,3" fill="none" stroke="${hairPalette(c).hi}" stroke-width="1.3" stroke-linecap="round" opacity=".35"/>`;
    const cap = hairPieces(c, capPieces(c, { hairline: 56 }), { y0: 30, y1: 120 });
    return { back: bun + swirl, front: cap + partLine(c, CX, 38, 56) };
  }),
  reg('bun-messy', 'Messy bun', 'wavy', 'short', ['updo', 'high'], (c) => {
    const bun = blob(c, cloudPts(CX + 6, 24, 31, 24, 16, 0.1, 9), 0, 50, false, 0.22);
    const sw = `<path d="M${CX - 14},22q16,-18 36,-4M${CX - 12},34q20,-14 34,2M${CX - 4},12q14,-4 24,6" fill="none" stroke="${hairPalette(c).hi}" stroke-width="1.4" stroke-linecap="round" opacity=".38"/>`;
    const cap = hairPieces(c, capPieces(c, { hairline: 62, vol: 2 }), { y0: 30, y1: 120 });
    // wisps framing the face
    const wisp = (s: number) => `<path d="M${CX + s * 38},84Q${CX + s * 48},118 ${CX + s * 42},150" fill="none" stroke="${hairPalette(c).base}" stroke-width="4.2" stroke-linecap="round"/><path d="M${CX + s * 38},84Q${CX + s * 48},118 ${CX + s * 42},150" fill="none" stroke="${hairPalette(c).hi}" stroke-width="1" stroke-linecap="round" opacity=".4"/>`;
    return { back: bun + sw, front: cap + partLine(c, CX, 38, 60) + wisp(1) + wisp(-1) };
  }),
  reg('space-buns', 'Space buns', 'straight', 'short', ['updo', 'high', 'wide'], (c) => {
    const bun = (s: number) => blob(c, cloudPts(CX + s * 40, 30, 19, 18, 12, 0.07, 5 + s), 8, 48, false, 0.2);
    const cap = hairPieces(c, capPieces(c, { hairline: 58 }), { y0: 30, y1: 120 });
    const tie = (s: number) => `<ellipse cx="${CX + s * 38}" cy="${46}" rx="8" ry="4" transform="${rot(s * 28, CX + s * 38, 46)}" fill="${tieOf(c)}" stroke="${darken(tieOf(c), 0.3)}" stroke-width=".7"/>`;
    return { back: bun(1) + bun(-1), front: cap + partLine(c, CX, 38, 58) + tie(1) + tie(-1) };
  }),
  reg('braid-single', 'Side braid', 'straight', 'long', ['long', 'down', 'braid'], (c) => {
    const cap = hairPieces(c, capPieces(c, { hairline: 60, vol: 2 }), { y0: 36, y1: 120 });
    const centre: Pt[] = [[CX + 52, 118], [CX + 60, 168], [CX + 62, 230], [CX + 58, 296], [CX + 56, 344]];
    const back = hairPieces(c, [{ path: spline([[CX - 56, 80], [CX - 30, 44], [CX + 30, 44], [CX + 56, 80], [CX + 54, 150], [CX + 40, 190], [CX - 40, 190], [CX - 54, 150]], true, 1 / 6) }], { y0: 40, y1: 190 });
    return { back, front: cap + partLine(c, CX, 38, 60) + braidChain(c, centre, 24, 14, tieOf(c)) };
  }),
  reg('braids-twin', 'Twin braids', 'straight', 'long', ['long', 'down', 'braid'], (c) => {
    const cap = hairPieces(c, capPieces(c, { hairline: 60, vol: 3 }), { y0: 36, y1: 120 });
    let br = '';
    for (const s of [1, -1] as const) {
      const centre: Pt[] = [[CX + s * 54, 120], [CX + s * 60, 172], [CX + s * 63, 236], [CX + s * 59, 292], [CX + s * 57, 330]];
      br += braidChain(c, centre, 22, 13, tieOf(c));
    }
    const back = hairPieces(c, [{ path: spline([[CX - 58, 84], [CX - 30, 44], [CX + 30, 44], [CX + 58, 84], [CX + 56, 150], [CX + 40, 186], [CX - 40, 186], [CX - 56, 150]], true, 1 / 6) }], { y0: 40, y1: 190 });
    return { back, front: cap + partLine(c, CX, 38, 60) + br };
  }),
  reg('half-bun', 'Half-up bun', 'straight', 'long', ['long', 'down', 'high'], (c) => {
    // long hair down with a small bun on the crown
    const longFam = HAIR_FAMILY_DEFS_REF.find((h) => h.id === 'long-center')!.render(c);
    const bun = blob(c, cloudPts(CX, 24, 17, 14, 12, 0.07, 4), 6, 40, false, 0.2);
    return { back: longFam.back, front: longFam.front + bun };
  }),
  reg('pixie', 'Pixie cut', 'straight', 'short', ['short', 'bangs'], (c) => {
    const g = c.face;
    const p = hairPalette(c);
    // short crop: a dome with a swept fringe
    const dome = spline([[CX - 54, 104], [CX - 56, 78], [CX - 40, 50], [CX, 36], [CX + 40, 48], [CX + 56, 78], [CX + 54, 104], [CX + 50, 96], [CX + 40, 74], [CX + 20, 66], [CX - 4, 70], [CX - 28, 80], [CX - 44, 98], [CX - 48, 112]], true, 1 / 6);
    const fringe = spline([[CX + 46, 70], [CX + 18, 58], [CX - 20, 62], [CX - 46, 82], [CX - 50, 100], [CX - 30, 88], [CX - 6, 80], [CX + 22, 82], [CX + 44, 96], [CX + 48, 84]], true, 1 / 6);
    const sideburn = (s: number) => spline([[CX + s * 49, 100], [CX + s * 54, 108], [CX + s * 51, 128], [CX + s * 47, 124], [CX + s * 47, 108]], true, 1 / 6);
    const A: Pt[] = [[CX + 46, 70], [CX + 20, 64], [CX - 10, 66], [CX - 40, 82]];
    const B: Pt[] = [[CX + 52, 56], [CX + 22, 44], [CX - 14, 46], [CX - 50, 66]];
    const front = hairPieces(c, [{ path: dome, A: resample([[CX + 4, 64], [CX + 30, 60], [CX + 46, 78], [CX + 50, 98]], 10), B: resample([[CX, 40], [CX + 38, 46], [CX + 55, 76], [CX + 56, 100]], 10), strandN: 8 }, { path: fringe, A, B, strandN: 8, sheen: false }, { path: sideburn(1) }, { path: sideburn(-1) }], { y0: 36, y1: 120 });
    void g; void p;
    return { back: '', front };
  }),
  reg('afro', 'Natural afro', 'coily', 'medium', ['voluminous', 'coily', 'short'], (c) => {
    const back = blob(c, cloudPts(CX, 82, 82, 78, 30, 0.07, 11), 6, 170, true, 0.24);
    const cap = spline([[CX - 56, 100], [CX - 60, 70], [CX - 44, 46], [CX, 38], [CX + 44, 46], [CX + 60, 70], [CX + 56, 100], [CX + 46, 84], [CX + 34, 70], [CX, 64], [CX - 34, 70], [CX - 46, 84]], true, 0.2);
    const front = `<path d="${cap}" fill="${hairFill(c, 36, 110)}"/><g clip-path="${c.d.clip(`<path d="${cap}"/>`)}"><rect x="0" y="0" width="400" height="800" fill="${curlPattern(c)}"/></g><path d="${cap}" fill="none" stroke="${hairPalette(c).deep}" stroke-width=".9" opacity=".4"/>`;
    return { back, front };
  }),
  reg('afro-puffs', 'Afro puffs', 'coily', 'short', ['coily', 'updo', 'high', 'wide'], (c) => {
    const puff = (s: number) => blob(c, cloudPts(CX + s * 52, 42, 30, 28, 18, 0.1, 7 + s), 8, 80, true, 0.24);
    const cap = hairPieces(c, capPieces(c, { hairline: 60 }), { y0: 36, y1: 120 });
    const curls = `<g clip-path="${c.d.clip(capPieces(c, { hairline: 60 }).map((p) => `<path d="${p.path}"/>`).join(''))}"><rect x="0" y="0" width="400" height="800" fill="${curlPattern(c, 0.8)}"/></g>`;
    return { back: puff(1) + puff(-1), front: cap + curls + partLine(c, CX, 38, 60) };
  }),
  reg('twa', 'Short coils', 'coily', 'short', ['coily', 'short'], (c) => {
    const back = blob(c, cloudPts(CX, 74, 62, 54, 26, 0.06, 21), 14, 140, true, 0.24);
    const cap = spline([[CX - 52, 104], [CX - 55, 70], [CX - 40, 50], [CX, 42], [CX + 40, 50], [CX + 55, 70], [CX + 52, 104], [CX + 44, 88], [CX + 30, 72], [CX, 67], [CX - 30, 72], [CX - 44, 88]], true, 0.2);
    const front = `<path d="${cap}" fill="${hairFill(c, 36, 110)}"/><g clip-path="${c.d.clip(`<path d="${cap}"/>`)}"><rect x="0" y="0" width="400" height="800" fill="${curlPattern(c, 0.8)}"/></g><path d="${cap}" fill="none" stroke="${hairPalette(c).deep}" stroke-width=".9" opacity=".4"/>`;
    return { back, front };
  }),
  reg('curly-puff', 'Curly puff', 'curly', 'medium', ['updo', 'high', 'curly'], (c) => {
    const puff = blob(c, cloudPts(CX, 30, 54, 34, 22, 0.09, 13), 0, 70, true, 0.24);
    const cap = hairPieces(c, capPieces(c, { hairline: 62, vol: 2 }), { y0: 36, y1: 120 });
    const tendril = (s: number) => `<path d="M${CX + s * 44},96q${s * 10},24 ${s * 2},44q${-s * 8},10 ${s * 4},22" fill="none" stroke="${hairPalette(c).base}" stroke-width="5" stroke-linecap="round"/><path d="M${CX + s * 44},96q${s * 10},24 ${s * 2},44q${-s * 8},10 ${s * 4},22" fill="none" stroke="${hairPalette(c).deep}" stroke-width="1" stroke-dasharray="2 3.4" opacity=".5" stroke-linecap="round"/>`;
    return { back: puff, front: cap + partLine(c, CX, 38, 62) + tendril(1) + tendril(-1) };
  }),
  reg('box-braids', 'Box braids', 'coily', 'long', ['long', 'down', 'braid'], (c) => {
    const p = hairPalette(c);
    const cap = hairPieces(c, capPieces(c, { hairline: 60, vol: 3 }), { y0: 36, y1: 120 });
    const grid = c.d.pattern(14, 12, `<path d="M0,.5H14M.5,0V12" stroke="${p.deep}" stroke-width=".8" opacity=".45"/>`);
    const capClip = c.d.clip(capPieces(c, { hairline: 60, vol: 3 }).map((q) => `<path d="${q.path}"/>`).join(''));
    let back = '', front = '';
    const braidFill = hairFill(c, 100, 360);
    const braid = (x0: number, y0: number, x1: number, y1: number, w: number, sway: number) => {
      const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 7);
      let o = '';
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = lerp(x0, x1, t) + Math.sin(t * 5) * sway, y = lerp(y0, y1, t);
        const dir = i % 2 ? 1 : -1;
        o += `<ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${n2(w)}" ry="5" transform="${rot(dir * 34, n2(x), n2(y))}" fill="${braidFill}" stroke="${p.deep}" stroke-width=".7" stroke-opacity=".6"/>`;
      }
      return o;
    };
    for (const s of [1, -1] as const) {
      for (let i = 0; i < 4; i++) back += braid(CX + s * (34 + i * 10), 96, CX + s * (52 + i * 11), 330 + i * 8, 4.6, 1.2);
      for (let i = 0; i < 3; i++) front += braid(CX + s * (48 + i * 9), 108, CX + s * (56 + i * 12), 312 + i * 14, 5.2, 1.5);
    }
    return { back: back, front: cap + `<g clip-path="${capClip}"><rect x="0" y="0" width="400" height="800" fill="${grid}"/></g>` + partLine(c, CX, 38, 60) + front };
  }),
];

import { HAIR_FAMILY_DEFS } from './hair';
const HAIR_FAMILY_DEFS_REF = HAIR_FAMILY_DEFS;
void lerpPt; void lighten; void mirrorPts;
