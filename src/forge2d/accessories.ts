// Accessories: glasses, earrings, necklaces, scarves, bags and hair accessories.
import { CX, Pt, darken, lighten, luma, n2, spline } from './geom';
import type { Ctx } from './types';
import type { Resolved } from './compat';
import { SK } from './body';
import { EYE_STYLES } from './face';
import { edge } from './garment';

export interface AccDef { id: string; name: string; tags?: string[] }
const A = (id: string, name: string, tags?: string[]): AccDef => ({ id, name, tags });

export const GLASSES: AccDef[] = [A('round', 'Round'), A('cat-eye', 'Cat-eye'), A('square', 'Square'), A('aviator', 'Aviator shades', ['sun']), A('round-sun', 'Round shades', ['sun']), A('cat-sun', 'Cat-eye shades', ['sun'])];
export const EARRINGS: AccDef[] = [A('stud', 'Studs', ['small']), A('hoop', 'Hoops'), A('drop', 'Drops'), A('pearl', 'Pearl drops'), A('jhumka', 'Jhumkas'), A('huggie', 'Huggies', ['small'])];
export const NECKLACES: AccDef[] = [A('chain', 'Chain'), A('pendant', 'Pendant'), A('pearls', 'Pearls'), A('choker', 'Choker'), A('layered', 'Layered chains')];
export const SCARVES: AccDef[] = [A('neck-scarf', 'Silk neck scarf'), A('chunky', 'Chunky scarf'), A('bandana', 'Bandana tie')];
export const BAGS: AccDef[] = [A('crossbody', 'Crossbody bag'), A('tote', 'Shoulder tote'), A('saddle', 'Saddle bag')];
export const HAIR_ACCESSORIES: AccDef[] = [A('headband', 'Headband'), A('clip', 'Hair clips'), A('bow', 'Bow'), A('flower', 'Flower')];

const eyeCx = (c: Ctx, s: number) => {
  const st = EYE_STYLES[c.cfg.face.eyes] ?? EYE_STYLES.almond;
  return CX + s * (c.face.gap + st.w * 1.14 * 0.5);
};

function glasses(c: Ctx): string {
  const id = c.cfg.accessories.glasses;
  if (id === 'none') return '';
  const frame = c.cfg.accessories.glassesColor;
  const sun = ['aviator', 'round-sun', 'cat-sun'].includes(id);
  const shape = id === 'aviator' ? 'aviator' : id.includes('cat') ? 'cat' : id.includes('round') ? 'round' : 'square';
  const y = c.face.eyeY - 1;
  let out = '';
  const lensPath = (cx: number, s: number) => {
    const w = shape === 'square' ? 15 : shape === 'aviator' ? 16 : 14.5;
    const h = shape === 'round' ? 14.5 : shape === 'cat' ? 11.5 : shape === 'aviator' ? 14 : 12.5;
    if (shape === 'round') return `M${n2(cx - w)},${y}a${w},${h} 0 1,0 ${w * 2},0a${w},${h} 0 1,0 ${-w * 2},0Z`;
    if (shape === 'square') return `M${n2(cx - w)},${y - h * 0.8}H${n2(cx + w)}Q${n2(cx + w + 1)},${y + h * 0.9} ${n2(cx + w - 3)},${y + h}H${n2(cx - w + 3)}Q${n2(cx - w - 1)},${y + h * 0.9} ${n2(cx - w)},${y - h * 0.8}Z`;
    if (shape === 'cat') {
      const o = s; // outer corner direction
      return `M${n2(cx - o * w)},${y - h * 0.3}Q${n2(cx - o * w * 0.2)},${y - h * 1.05} ${n2(cx + o * (w + 3))},${y - h * 1.25}Q${n2(cx + o * (w + 1))},${y + h * 0.7} ${n2(cx + o * w * 0.1)},${y + h}Q${n2(cx - o * w)},${y + h * 0.9} ${n2(cx - o * w)},${y - h * 0.3}Z`;
    }
    return `M${n2(cx - w)},${y - h * 0.8}Q${n2(cx)},${y - h * 1.1} ${n2(cx + w)},${y - h * 0.8}Q${n2(cx + w - 1)},${y + h * 0.7} ${n2(cx + 2)},${y + h}Q${n2(cx - w)},${y + h * 0.8} ${n2(cx - w)},${y - h * 0.8}Z`;
  };
  const metal = luma(frame) > 0.5;
  for (const s of [-1, 1] as const) {
    const cx = eyeCx(c, s);
    const p = lensPath(cx, s);
    const clip = c.d.clip(`<path d="${p}"/>`);
    if (sun) {
      out += `<path d="${p}" fill="#1b1b22" opacity=".82"/><g clip-path="${clip}"><path d="M${n2(cx - 14)},${y - 14}l12,0l-9,28l-12,0Z" fill="#fff" opacity=".2"/><rect x="${n2(cx - 20)}" y="${y - 14}" width="40" height="12" fill="#3a3a48" opacity=".5"/></g>`;
    } else {
      out += `<path d="${p}" fill="#dfeaf5" opacity=".16"/><g clip-path="${clip}"><path d="M${n2(cx - 13)},${y + 10}l16,-22" stroke="#fff" stroke-width="2.4" opacity=".4"/></g>`;
    }
    out += `<path d="${p}" fill="none" stroke="${frame}" stroke-width="${shape === 'aviator' || metal ? 1.6 : 2.5}" stroke-linejoin="round"/>`;
    if (!metal) out += `<path d="${p}" fill="none" stroke="${lighten(frame, 0.3)}" stroke-width=".7" opacity=".5" transform="translate(-.4 -.6)"/>`;
    // temple arm to the ear
    out += `<path d="M${n2(cx + s * 15)},${y - 4}L${n2(CX + s * (c.face.hw(c.face.eyeY) + 3))},${y - 2}" stroke="${frame}" stroke-width="2" stroke-linecap="round"/>`;
  }
  const bx = eyeCx(c, -1) + 14.5, bx2 = eyeCx(c, 1) - 14.5;
  out += `<path d="M${n2(bx)},${y - 3}Q${CX},${y - 7} ${n2(bx2)},${y - 3}" fill="none" stroke="${frame}" stroke-width="${metal ? 1.4 : 2.2}" stroke-linecap="round"/>`;
  if (shape === 'aviator') out += `<path d="M${n2(bx)},${y - 9}Q${CX},${y - 12} ${n2(bx2)},${y - 9}" fill="none" stroke="${frame}" stroke-width="1.3"/>`;
  return out;
}

function earrings(c: Ctx): string {
  const id = c.cfg.accessories.earrings;
  if (id === 'none') return '';
  const m = c.cfg.accessories.metal;
  let out = '';
  for (const s of [-1, 1] as const) {
    const x = CX + s * (c.face.hw(c.face.eyeY + 14) + 2.4), y = c.face.eyeY + 19;
    const g = (r: number) => c.d.radial(x - r * 0.3, y - r * 0.3, r * 1.5, [[0, lighten(m, 0.45)], [0.5, m], [1, darken(m, 0.25)]]);
    switch (id) {
      case 'stud': out += `<circle cx="${n2(x)}" cy="${n2(y)}" r="2.6" fill="${g(2.6)}" stroke="${darken(m, 0.35)}" stroke-width=".5"/>`; break;
      case 'huggie': out += `<path d="M${n2(x - 3.5)},${n2(y)}a3.5,3.8 0 1,0 7,0v2.4" fill="none" stroke="${m}" stroke-width="1.7" stroke-linecap="round"/>`; break;
      case 'hoop': out += `<circle cx="${n2(x + s * 0.5)}" cy="${n2(y + 8)}" r="8.4" fill="none" stroke="${darken(m, 0.3)}" stroke-width="2.6"/><circle cx="${n2(x + s * 0.5)}" cy="${n2(y + 8)}" r="8.4" fill="none" stroke="${m}" stroke-width="1.7"/>`; break;
      case 'drop': out += `<circle cx="${n2(x)}" cy="${n2(y)}" r="1.9" fill="${m}"/><path d="M${n2(x)},${n2(y + 2)}V${n2(y + 7)}" stroke="${m}" stroke-width="1"/><path d="M${n2(x)},${n2(y + 6)}l4,6l-4,6l-4,-6Z" fill="${g(6)}" stroke="${darken(m, 0.3)}" stroke-width=".6"/>`; break;
      case 'pearl': out += `<circle cx="${n2(x)}" cy="${n2(y)}" r="1.8" fill="${m}"/><path d="M${n2(x)},${n2(y)}V${n2(y + 6)}" stroke="${m}" stroke-width=".9"/><circle cx="${n2(x)}" cy="${n2(y + 10)}" r="4.4" fill="${c.d.radial(x - 1.4, y + 8.6, 6, [[0, '#ffffff'], [0.6, '#efe6da'], [1, '#c9bfae']])}" stroke="#bdb2a0" stroke-width=".5"/>`; break;
      case 'jhumka': out += `<circle cx="${n2(x)}" cy="${n2(y)}" r="2.4" fill="${g(2.4)}"/><path d="M${n2(x - 6)},${n2(y + 12)}Q${n2(x)},${n2(y + 1)} ${n2(x + 6)},${n2(y + 12)}Z" fill="${g(7)}" stroke="${darken(m, 0.3)}" stroke-width=".7"/><path d="M${n2(x - 6)},${n2(y + 12)}h12" stroke="${darken(m, 0.3)}" stroke-width=".7"/>` + [-4, 0, 4].map((dx) => `<circle cx="${n2(x + dx)}" cy="${n2(y + 14.5)}" r="1.3" fill="${m}"/>`).join(''); break;
    }
  }
  return out;
}

function necklace(c: Ctx): string {
  const id = c.cfg.accessories.necklace;
  if (id === 'none') return '';
  const m = c.cfg.accessories.metal;
  const y0 = 204;
  const curve = (depth: number, w = 21) => `M${CX - w},${y0}Q${CX},${y0 + depth} ${CX + w},${y0}`;
  switch (id) {
    case 'chain': return `<path d="${curve(46)}" fill="none" stroke="${darken(m, 0.25)}" stroke-width="2"/><path d="${curve(46)}" fill="none" stroke="${m}" stroke-width="1.1"/>`;
    case 'pendant': return `<path d="${curve(50)}" fill="none" stroke="${m}" stroke-width="1.3"/><path d="M${CX},${y0 + 25}l5,7l-5,8l-5,-8Z" fill="${c.d.radial(CX - 1, y0 + 30, 9, [[0, lighten(m, 0.4)], [1, darken(m, 0.2)]])}" stroke="${darken(m, 0.35)}" stroke-width=".7"/>`;
    case 'choker': return `<path d="M${CX - 18},${y0 - 6}Q${CX},${y0 + 6} ${CX + 18},${y0 - 6}" fill="none" stroke="${darken(m, 0.3)}" stroke-width="4"/><path d="M${CX - 18},${y0 - 6}Q${CX},${y0 + 6} ${CX + 18},${y0 - 6}" fill="none" stroke="${m}" stroke-width="2.4"/>`;
    case 'pearls': {
      let o = '';
      for (let i = 0; i <= 13; i++) {
        const t = i / 13, x = CX - 22 + t * 44, y = y0 - 2 + 38 * (1 - Math.pow(2 * t - 1, 2)) * 0.62 + 0;
        o += `<circle cx="${n2(x)}" cy="${n2(y)}" r="3.1" fill="${c.d.radial(x - 1, y - 1, 4.5, [[0, '#fff'], [0.6, '#f0e8dc'], [1, '#c9bfae']])}" stroke="#bdb2a0" stroke-width=".4"/>`;
      }
      return o;
    }
    case 'layered': return `<path d="${curve(30, 20)}" fill="none" stroke="${m}" stroke-width="1.1"/><path d="${curve(48, 22)}" fill="none" stroke="${m}" stroke-width="1.1"/><path d="${curve(64, 24)}" fill="none" stroke="${m}" stroke-width="1.1"/><circle cx="${CX}" cy="${y0 + 33}" r="3.2" fill="${m}" stroke="${darken(m, 0.3)}" stroke-width=".6"/>`;
  }
  return '';
}

function scarf(c: Ctx): string {
  const id = c.cfg.accessories.scarf;
  if (id === 'none') return '';
  const col = c.cfg.accessories.scarfColor;
  const dk = darken(col, 0.28);
  const grad = c.d.linear(CX - 40, 0, CX + 40, 0, [[0, lighten(col, 0.1)], [0.5, col], [1, darken(col, 0.18)]]);
  if (id === 'chunky') {
    const band = `M${CX - 30},192Q${CX - 36},214 ${CX - 22},226Q${CX},236 ${CX + 22},226Q${CX + 36},214 ${CX + 30},192Q${CX},206 ${CX - 30},192Z`;
    const tail = `M${CX + 8},224L${CX + 30},224L${CX + 36},288L${CX + 12},292Z`;
    return `<path d="${tail}" fill="${grad}" stroke="${edge(col)}" stroke-width="1"/><path d="${band}" fill="${grad}" stroke="${edge(col)}" stroke-width="1.1"/><g clip-path="${c.d.clip(`<path d="${band}"/><path d="${tail}"/>`)}"><rect x="${CX - 40}" y="188" width="80" height="110" fill="${c.d.pattern(5, 5, `<path d="M0,5L5,0" stroke="${dk}" stroke-width=".9" opacity=".35"/>`)}"/></g><path d="M${CX + 14},288h22" stroke="${dk}" stroke-width="1.2" stroke-dasharray="1.6 1.6"/>`;
  }
  if (id === 'bandana') {
    const tri = `M${CX - 28},196Q${CX},212 ${CX + 28},196L${CX + 10},242Q${CX},250 ${CX - 10},242Z`;
    return `<path d="${tri}" fill="${grad}" stroke="${edge(col)}" stroke-width="1"/><g clip-path="${c.d.clip(`<path d="${tri}"/>`)}"><rect x="${CX - 30}" y="194" width="60" height="60" fill="${c.d.pattern(8, 8, `<circle cx="2" cy="2" r="1" fill="${lighten(col, 0.4)}" opacity=".7"/><circle cx="6" cy="6" r="1" fill="${lighten(col, 0.4)}" opacity=".7"/>`)}"/></g><path d="M${CX - 28},196Q${CX},208 ${CX + 28},196" fill="none" stroke="${dk}" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`;
  }
  // silk neck scarf: tied loop with a small knot and two tails
  const loop = `M${CX - 26},194Q${CX},212 ${CX + 26},194L${CX + 22},206Q${CX},220 ${CX - 22},206Z`;
  return `<path d="M${CX + 2},212L${CX + 22},250L${CX + 10},254L${CX - 2},224Z" fill="${grad}" stroke="${edge(col)}" stroke-width=".9"/><path d="M${CX - 2},212L${CX - 16},246L${CX - 4},250L${CX + 4},224Z" fill="${col}" stroke="${edge(col)}" stroke-width=".9"/><path d="${loop}" fill="${grad}" stroke="${edge(col)}" stroke-width="1"/><ellipse cx="${CX}" cy="213" rx="6" ry="5" fill="${col}" stroke="${edge(col)}" stroke-width=".9"/>`;
}

function bag(c: Ctx): string {
  const id = c.cfg.accessories.bag;
  if (id === 'none') return '';
  const col = c.cfg.accessories.bagColor;
  const dk = darken(col, 0.3);
  const body = (x: number, y: number, w: number, h: number, r = 6) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c.d.linear(x, 0, x + w, 0, [[0, lighten(col, 0.1)], [0.5, col], [1, darken(col, 0.18)]])}" stroke="${edge(col)}" stroke-width="1.1"/>`;
  const yb = SK.hipY;
  if (id === 'crossbody') {
    return `<path d="M${CX - 44},210L${CX + 40},${yb - 14}" stroke="${dk}" stroke-width="6" stroke-linecap="round"/><path d="M${CX - 44},210L${CX + 40},${yb - 14}" stroke="${col}" stroke-width="4" stroke-linecap="round"/>` +
      body(CX + 24, yb - 20, 42, 32) + `<path d="M${CX + 24},${yb - 12}Q${CX + 45},${yb - 2} ${CX + 66},${yb - 12}" fill="${darken(col, 0.06)}" stroke="${dk}" stroke-width="1"/><circle cx="${CX + 45}" cy="${yb - 3}" r="2.4" fill="#d9c27a" stroke="#8d7a3a" stroke-width=".6"/>`;
  }
  if (id === 'saddle') {
    return `<path d="M${CX - 42},212L${CX + 36},${yb - 20}" stroke="${col}" stroke-width="3.6" stroke-linecap="round"/>` +
      `<path d="M${CX + 22},${yb - 24}h38a6,6 0 0 1 6,6v24a14,14 0 0 1 -14,14h-22a14,14 0 0 1 -14,-14v-24a6,6 0 0 1 6,-6Z" fill="${col}" stroke="${edge(col)}" stroke-width="1.1"/><path d="M${CX + 17},${yb - 12}Q${CX + 41},${yb + 2} ${CX + 65},${yb - 12}" fill="${darken(col, 0.05)}" stroke="${dk}" stroke-width="1"/><circle cx="${CX + 41}" cy="${yb - 2}" r="2.6" fill="#d9c27a" stroke="#8d7a3a" stroke-width=".6"/>`;
  }
  // tote hanging from the right shoulder
  const x = CX + 62, y = yb - 40;
  return `<path d="M${x + 8},${y}Q${CX + 70},${y - 52} ${CX + 52},212M${x + 34},${y}Q${CX + 76},${y - 56} ${CX + 58},212" fill="none" stroke="${dk}" stroke-width="4.6" stroke-linecap="round"/><path d="M${x + 8},${y}Q${CX + 70},${y - 52} ${CX + 52},212M${x + 34},${y}Q${CX + 76},${y - 56} ${CX + 58},212" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M${x},${y}h42l5,66h-52Z" fill="${c.d.linear(x, 0, x + 48, 0, [[0, lighten(col, 0.1)], [1, darken(col, 0.2)]])}" stroke="${edge(col)}" stroke-width="1.1" stroke-linejoin="round"/><path d="M${x + 2},${y + 10}h42" stroke="${dk}" stroke-width=".9" opacity=".5"/>`;
}

function hairAcc(c: Ctx): string {
  const id = c.cfg.accessories.hairAccessory;
  if (id === 'none') return '';
  const col = c.cfg.accessories.hairAccessoryColor;
  const dk = darken(col, 0.3);
  switch (id) {
    case 'headband': {
      const pts: Pt[] = [[CX - 55, 112], [CX - 56, 84], [CX - 40, 54], [CX, 40], [CX + 40, 54], [CX + 56, 84], [CX + 55, 112]];
      const p = spline(pts, false, 1 / 6);
      return `<path d="${p}" fill="none" stroke="${dk}" stroke-width="8.4" stroke-linecap="round"/><path d="${p}" fill="none" stroke="${col}" stroke-width="6.4" stroke-linecap="round"/><path d="${p}" fill="none" stroke="${lighten(col, 0.3)}" stroke-width="1.6" stroke-linecap="round" opacity=".6" transform="translate(-1.4 -1)"/>`;
    }
    case 'clip': return [-1, 1].map((s) => `<g transform="translate(${CX + s * 46} 76) rotate(${s * 24})"><rect x="-9" y="-3.6" width="18" height="7.2" rx="2.6" fill="${col}" stroke="${dk}" stroke-width=".8"/><path d="M-6,-1.4h12" stroke="${lighten(col, 0.4)}" stroke-width=".9" opacity=".7"/></g>`).join('');
    case 'bow': return `<g transform="translate(${CX + 34} 48) rotate(14)"><path d="M0,0Q-16,-14 -22,-2Q-20,12 0,2Z" fill="${col}" stroke="${dk}" stroke-width="1"/><path d="M0,0Q16,-14 22,-2Q20,12 0,2Z" fill="${col}" stroke="${dk}" stroke-width="1"/><path d="M-12,-3Q-8,0 -12,4M12,-3Q8,0 12,4" stroke="${dk}" stroke-width=".8" fill="none" opacity=".5"/><ellipse cx="0" cy="1" rx="4.4" ry="4.8" fill="${lighten(col, 0.08)}" stroke="${dk}" stroke-width="1"/></g>`;
    case 'flower': {
      let o = `<g transform="translate(${CX + 44} 64)">`;
      for (let i = 0; i < 6; i++) o += `<ellipse cx="0" cy="-8" rx="4.6" ry="7" transform="rotate(${i * 60})" fill="${col}" stroke="${dk}" stroke-width=".8"/>`;
      return o + `<circle r="4" fill="#f2cf5b" stroke="#b9962c" stroke-width=".8"/></g>`;
    }
  }
  return '';
}

export function renderAccessories(c: Ctx, r: Resolved): { body: string; bag: string; head: string } {
  const body = (r.hideScarf ? '' : scarf(c)) + (r.hideNecklace ? '' : necklace(c));
  const head = (r.hideEarrings ? '' : earrings(c)) + glasses(c) + (r.hideHairAcc ? '' : hairAcc(c));
  return { body, bag: bag(c), head };
}
