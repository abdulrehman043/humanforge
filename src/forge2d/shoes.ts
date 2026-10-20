// Shoes (v2): chunky, lit, front-view footwear anchored to the ankle and the ground line.
// Mirrored per side by mapping x (never by flipping the group) so the light always comes from the upper left.
import { CX, Pt, darken, lighten, luma, n2, spline } from './geom';
import { LM, legAxis } from './body';
import type { Ctx } from './types';
import { edge, shadeBlob } from './garment';

export interface ShoeDef { id: string; name: string; tags?: string[] }
export const SHOES: ShoeDef[] = [
  { id: 'sneakers', name: 'Sneakers' },
  { id: 'chunky-sneakers', name: 'Chunky trainers' },
  { id: 'fluffy-boots', name: 'Suede boots', tags: ['boot'] },
  { id: 'chelsea-boots', name: 'Chelsea boots', tags: ['boot'] },
  { id: 'knee-boots', name: 'Knee-high boots', tags: ['boot', 'tall'] },
  { id: 'loafers', name: 'Loafers' },
  { id: 'flats', name: 'Ballet flats' },
  { id: 'pumps', name: 'Pointed pumps' },
  { id: 'sandals', name: 'Strappy sandals' },
];
export const SHOE_BY_ID = Object.fromEntries(SHOES.map((s) => [s.id, s]));

export function renderShoes(c: Ctx, def: ShoeDef, color: string): string {
  let out = '';
  const G = LM.ground;
  for (const s of [-1, 1] as const) {
    const startLen = out.length;
    const ax = CX + s * (legAxis(LM.ankle) + 1);
    const M = (pts: [number, number][]): Pt[] => pts.map(([dx, dy]) => [ax + s * dx, G + dy] as Pt);
    const X = (dx: number) => ax + s * dx;
    const base = color;
    const fill = c.d.linear(ax - 22, 0, ax + 22, 0, [[0, lighten(base, 0.1)], [0.5, base], [1, darken(base, 0.16)]]);
    const vol = (content: string, shape: string, b = 3, sc = 4.6) => c.d.volume(content, [shape], { blur: b, scale: sc, spec: luma(base) > 0.6 ? 0.15 : 0.35 });
    const stroke = edge(base);
    const dk = luma(base) < 0.35;
    const sole = (col: string, h = 8) => {
      const p = spline(M([[-17, -h - 1], [-12, -h], [10, -h], [22, -h - 1], [26, -h + 2], [25, 1], [18, 3], [-10, 3], [-17, 0]]), true, 1 / 6);
      return `<path d="${p}" fill="${col}"/><path d="${p}" fill="none" stroke="${darken(col, 0.3)}" stroke-width=".9"/>`;
    };
    switch (def.id) {
      case 'sneakers': case 'chunky-sneakers': {
        const ch = def.id === 'chunky-sneakers';
        const top = ch ? -60 : -52;
        const body = spline(M([[-14, top], [14, top], [16, top + 20], [21, -26], [26, -12], [23, -6], [-10, -6], [-17, -10], [-18, -28], [-16, top + 18]]), true, 1 / 6);
        const clip = c.d.clip(`<path d="${body}"/>`);
        out += vol(`<path d="${body}" fill="${fill}"/>`, body) + `<path d="${body}" fill="none" stroke="${stroke}" stroke-width="1"/>`;
        out += `<g clip-path="${clip}"><path d="${spline(M([[-17, -22], [-3, -28], [10, -26], [26, -14]]), false)}" fill="none" stroke="${darken(base, 0.25)}" stroke-width="1" opacity=".6"/>${shadeBlob(c, X(-5), G - 18, 11, 6, lighten(base, 0.24), 0.5, 3)}</g>`;
        out += `<path d="${spline(M([[-9, top + 1], [0, top - 4], [9, top + 1], [8, top + 22], [-7, top + 22]]), true)}" fill="${lighten(base, 0.12)}" stroke="${stroke}" stroke-width=".8"/>`;
        for (let i = 0; i < 3; i++) out += `<path d="M${n2(X(-7))},${G + top + 7 + i * 7}L${n2(X(7))},${G + top + 8 + i * 7}" stroke="${dk ? '#d9d9d9' : '#fff'}" stroke-width="1.5" stroke-linecap="round" opacity=".85"/>`;
        out += sole(dk ? '#ecebe6' : '#fbfaf6', ch ? 12 : 9);
        break;
      }
      case 'fluffy-boots': case 'chelsea-boots': {
        const fluffy = def.id === 'fluffy-boots';
        const top = fluffy ? -86 : -82;
        const w = fluffy ? 18 : 15;
        const body = spline(M([[-w, top], [w, top], [w + 1, top + 30], [w + 5, -34], [w + 11, -14], [24, -6], [-11, -6], [-w - 3, -10], [-w - 2, -34], [-w, top + 30]]), true, 1 / 6);
        const clip = c.d.clip(`<path d="${body}"/>`);
        out += vol(`<path d="${body}" fill="${fill}"/>`, body, fluffy ? 4 : 3, fluffy ? 6 : 5) + `<path d="${body}" fill="none" stroke="${stroke}" stroke-width="1"/>`;
        out += `<g clip-path="${clip}">${shadeBlob(c, X(-6), G - 22, 9, 10, lighten(base, 0.2), 0.45, 4)}${shadeBlob(c, X(13), G - 54, 6, 24, darken(base, 0.3), 0.28, 4)}</g>`;
        if (fluffy) {
          const fur = c.d.pattern(6, 6, `<path d="M0,4q1.5,-3 3,0t3,0" fill="none" stroke="${lighten(base, 0.2)}" stroke-width="1" opacity=".5"/>`);
          out += `<g clip-path="${clip}"><rect x="${ax - 40}" y="${G + top}" width="80" height="${-top}" fill="${fur}"/></g>`;
          out += `<path d="${spline(M([[-w - 1, top + 1], [-w * 0.55, top - 6], [-3, top - 1], [4, top - 6], [w * 0.6, top - 1], [w + 1, top + 1], [w, top + 9], [-w, top + 9]]), true, 1 / 6)}" fill="#efe6d4"/>`;
          out += `<path d="${spline(M([[-w + 2, -22], [0, -28], [w + 8, -20]]))}" fill="none" stroke="${darken(base, 0.3)}" stroke-width="1" opacity=".6"/>`;
          out += sole('#e9dfc9', 9);
        } else {
          out += `<path d="${spline(M([[-w + 1, top + 10], [w - 1, top + 10]]))}" stroke="${darken(base, 0.3)}" stroke-width="1" opacity=".5"/>`;
          out += `<path d="M${n2(X(w - 1))},${G + top + 10}l${s * -1},26" stroke="#26272b" stroke-width="4" stroke-linecap="round" opacity=".6"/>`;
          out += `<path d="M${n2(X(-w + 3))},${G + top + 6}q-1,34 ${s * 1},56" fill="none" stroke="#fff" stroke-width="2.2" opacity=".18" stroke-linecap="round"/>`;
          out += sole('#2b2b30', 10);
        }
        break;
      }
      case 'knee-boots': {
        const top = -176;
        const hwTop = 21;
        const body = spline(M([[-hwTop, top], [hwTop, top], [hwTop - 1, -120], [16, -76], [15.5, -50], [19, -30], [24, -14], [22, -6], [-10, -6], [-16, -10], [-16.6, -34], [-16, -76], [-hwTop + 1, -120]]), true, 1 / 6);
        const clip = c.d.clip(`<path d="${body}"/>`);
        out += vol(`<path d="${body}" fill="${fill}"/>`, body, 4, 5.4) + `<path d="${body}" fill="none" stroke="${stroke}" stroke-width="1"/>`;
        out += `<g clip-path="${clip}">${c.d.softStroke(`M${n2(X(-hwTop + 4))},${G + top + 4}Q${n2(X(-hwTop + 3))},${G - 120} ${n2(X(-11))},${G - 30}`, '#fff', 1.8, 0.4)}${shadeBlob(c, X(16), G - 120, 7, 70, darken(base, 0.3), 0.3, 5)}</g>`;
        out += `<path d="M${n2(X(-hwTop))},${G + top + 3}Q${n2(ax)},${G + top + 7} ${n2(X(hwTop))},${G + top + 3}" fill="none" stroke="${darken(base, 0.3)}" stroke-width="1.4" opacity=".6"/>`;
        out += sole('#26272b', 10);
        break;
      }
      case 'loafers': case 'flats': case 'pumps': {
        const pump = def.id === 'pumps';
        const top = -34;
        const toeX = pump ? 18 : 24;
        const body = spline(M([[-12, top], [12, top], [13.5, top + 7], [toeX - 3, -16], [toeX + (pump ? 0 : 1), -5], [toeX - 4, -2], [-9, -2], [-14.5, -5], [-15, -16], [-13.5, top + 9]]), true, 1 / 6);
        const instep = spline(M([[-10, top - 2], [10, top - 2], [10.6, top + 9], [0, top + 18], [-10.6, top + 9]]), true);
        const clip = c.d.clip(`<path d="${body}"/>`);
        out += vol(`<path d="${body}" fill="${fill}"/>`, body, 2.4, 4.4) + `<path d="${body}" fill="none" stroke="${stroke}" stroke-width="1"/>`;
        out += `<path d="${instep}" fill="${c.skin.base}" opacity="${pump || def.id === 'flats' ? 1 : 0}"/>`;
        out += `<path d="${spline(M([[-12, top + 1], [0, top + 18], [12, top + 1]]))}" fill="none" stroke="${darken(base, 0.3)}" stroke-width="1.1" opacity=".6"/>`;
        out += `<g clip-path="${clip}">${shadeBlob(c, X(-4), G - 8, 10, 4, lighten(base, 0.28), 0.6, 2.6)}</g>`;
        if (def.id === 'loafers') out += `<path d="${spline(M([[-8, top + 10], [0, top + 15], [8, top + 10]]))}" fill="none" stroke="#d6a640" stroke-width="2.2" stroke-linecap="round"/>`;
        if (def.id === 'flats') out += `<path d="M${n2(X(0))},${G + top + 14}l${s * -4.4},-3.4v5.6ZM${n2(X(0))},${G + top + 14}l${s * 4.4},-3.4v5.6Z" fill="${lighten(base, 0.15)}" stroke="${stroke}" stroke-width=".6"/>`;
        out += sole(pump ? darken(base, 0.35) : '#2b2b30', pump ? 4 : 5);
        break;
      }
      case 'sandals': {
        const foot = spline(M([[-10, -34], [10, -34], [13, -20], [20, -8], [22, -3], [-8, -3], [-13, -20]]), true, 1 / 6);
        out += `<path d="${foot}" fill="${c.skin.base}"/>`;
        for (let i = 0; i < 4; i++) out += `<ellipse cx="${n2(X(-7 + i * 6.4))}" cy="${G - 7 - (3 - i) * 0.5}" rx="3" ry="2.6" fill="${c.skin.light}" stroke="${c.skin.shade}" stroke-width=".5"/>`;
        out += sole(darken(base, 0.1), 4);
        out += `<path d="M${n2(X(-13))},${G - 22}Q${n2(ax)},${G - 33} ${n2(X(13))},${G - 22}M${n2(X(-11))},${G - 30}Q${n2(ax)},${G - 37} ${n2(X(11))},${G - 30}" fill="none" stroke="${base}" stroke-width="2.6" stroke-linecap="round"/>`;
        break;
      }
    }
    const K = 1.22; // chunky proportions
    out = out.slice(0, startLen) + `<g transform="translate(${n2(ax)} ${G}) scale(${K}) translate(${n2(-ax)} ${-G})">` + out.slice(startLen) + '</g>';
  }
  return out;
}
export const shoeIds = SHOES.map((s) => s.id);
