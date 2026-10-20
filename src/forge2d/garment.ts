// Shared garment helpers: fabric gradients, textures, outlines and folds.
import { CX, Pt, darken, lighten, n2, spline, mix, luma } from './geom';
import type { Ctx } from './types';

export type Texture = 'plain' | 'rib' | 'knit' | 'cable' | 'stripe' | 'quilt' | 'denim' | 'sherpa' | 'pleat' | 'dots';

export const edge = (color: string) => darken(color, 0.3);

/** Left-lit horizontal fabric gradient. */
export function fabricGrad(c: Ctx, color: string, x0 = CX - 62, x1 = CX + 62) {
  const l = luma(color);
  const hi = l > 0.85 ? 0.025 : 0.075;
  return c.d.linear(x0, 0, x1, 0, [[0, lighten(color, hi)], [0.4, color], [1, darken(color, l > 0.8 ? 0.11 : 0.15)]]);
}

export function textureOverlay(c: Ctx, kind: Texture, color: string, clipUrl: string, x: number, y: number, w: number, h: number, accent?: string): string {
  const d = c.d;
  let fill = '';
  const dk = darken(color, 0.14), lt = lighten(color, 0.1);
  switch (kind) {
    case 'rib':
      fill = d.pattern(3.6, 8, `<rect x="0" y="0" width="1.1" height="8" fill="${dk}" opacity=".55"/><rect x="1.8" y="0" width="1.2" height="8" fill="${lt}" opacity=".35"/>`);
      break;
    case 'knit':
      fill = d.pattern(6.4, 6, `<path d="M.6,.8L3.2,5.2L5.8,.8" fill="none" stroke="${dk}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/><path d="M.6,.2L3.2,4.6L5.8,.2" fill="none" stroke="${lt}" stroke-width=".7" opacity=".4"/>`);
      break;
    case 'cable':
      fill = d.pattern(26, 22, `<path d="M5,0C11,5 -1,13 5,22M11,0C5,5 17,13 11,22" fill="none" stroke="${dk}" stroke-width="1.4" opacity=".5"/><path d="M5,0C11,5 -1,13 5,22" fill="none" stroke="${lt}" stroke-width=".8" opacity=".4" transform="translate(-.8 0)"/><rect x="17.4" y="0" width="1" height="22" fill="${dk}" opacity=".35"/><rect x="21" y="0" width="1" height="22" fill="${dk}" opacity=".35"/>`);
      break;
    case 'stripe': {
      const a = accent ?? (luma(color) > 0.6 ? '#243255' : '#f3f0ea');
      fill = d.pattern(10, 11, `<rect x="0" y="0" width="10" height="4.6" fill="${a}"/>`);
      break;
    }
    case 'quilt': {
      const g = d.linear(0, 0, 0, 24, [[0, '#fff', 0.2], [0.35, '#fff', 0.05], [0.8, '#000', 0.1], [1, '#000', 0.26]]);
      fill = d.pattern(40, 24, `<rect x="0" y="0" width="40" height="24" fill="${g}"/><path d="M0,.7H40" stroke="${darken(color, 0.3)}" stroke-width="1.1" opacity=".75"/>`, `translate(0 ${n2(y)})`);
      break;
    }
    case 'denim':
      fill = d.pattern(3, 3, `<path d="M0,3L3,0" stroke="${lt}" stroke-width=".6" opacity=".35"/><path d="M0,1.5L1.5,0" stroke="${dk}" stroke-width=".5" opacity=".25"/>`);
      break;
    case 'sherpa':
      fill = d.pattern(8, 8, `<path d="M1,3q1.5,-3 3,0t3,0M0,7q1.5,-3 3,0t3,0" fill="none" stroke="${lt}" stroke-width="1.3" stroke-linecap="round" opacity=".6"/><path d="M1,5q1.5,-2 3,0" fill="none" stroke="${dk}" stroke-width=".8" opacity=".35"/>`);
      break;
    case 'pleat':
      fill = d.pattern(9, 10, `<rect x="0" y="0" width="1.5" height="10" fill="${dk}" opacity=".5"/><rect x="1.5" y="0" width="3" height="10" fill="${lt}" opacity=".22"/>`);
      break;
    case 'dots': {
      const a = accent ?? (luma(color) > 0.6 ? '#243255' : '#f3f0ea');
      fill = d.pattern(11, 11, `<circle cx="3" cy="3" r="1.5" fill="${a}" opacity=".9"/><circle cx="8.5" cy="8.5" r="1.5" fill="${a}" opacity=".9"/>`);
      break;
    }
    default: return '';
  }
  return `<g clip-path="${clipUrl}"><rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${fill}"/></g>`;
}

/** Soft vertical folds: darker creases with a lighter side. */
export function folds(c: Ctx, lines: Pt[][], color: string, clipUrl: string, strength = 1): string {
  let out = `<g clip-path="${clipUrl}" fill="none" stroke-linecap="round">`;
  for (const l of lines) {
    const p = spline(l);
    out += c.d.softStroke(p, darken(color, 0.3), 1.7, 0.42 * strength);
    out += c.d.softStroke(p, lighten(color, 0.14), 1.1, 0.45 * strength, ' transform="translate(-2.6 0)"');
  }
  return out + '</g>';
}

/** Dashed topstitching along a path. */
export const stitch = (d: string, color: string, op = 0.6, w = 0.9) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-dasharray="2.4 2" stroke-linecap="round" opacity="${op}"/>`;

export const shadeBlob = (c: Ctx, cx: number, cy: number, rx: number, ry: number, color: string, op: number, blur = 3.2) =>
  c.d.glow(cx, cy, rx * 1.35, ry * 1.35, color, Math.min(1, op * 1.35));

export const accentOf = (color: string) => (luma(color) > 0.55 ? darken(color, 0.12) : lighten(color, 0.12));
void mix;
