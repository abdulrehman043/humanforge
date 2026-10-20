// Dresses, modest wear and traditional outfits: long-hem TopDefs rendered by the same torso builder.
import { CX, darken, lighten, luma, n2 } from './geom';
import { LM } from './body';
import type { Ctx } from './types';
import type { Arm } from './body';
import { TopDef, regTop, renderSleeve, renderTopTorso, trimColor } from './tops';
import { BOTTOM_BY_ID, renderBottom } from './bottoms';
import { edge } from './garment';

export type DressDef = TopDef & { dress: true };
const D = (d: Omit<DressDef, 'dress'>): DressDef => ({ ...d, dress: true });

export const DRESSES: DressDef[] = [
  D({ id: 'slip-dress',  name: 'Satin slip dress',  hem: 590, fit: 'fitted', neck: 'cami',  sleeve: 'none', flare: 22, tags: ['straps'] }),
  D({ id: 'shirt-dress', name: 'Shirt dress',       hem: 598, fit: 'boxy',   neck: 'collar', sleeve: 'three', slack: 5, flare: 16, buttons: 8, belt: true, cuff: 'band' }),
  D({ id: 'wrap-dress',  name: 'Wrap dress',        hem: 606, fit: 'fitted', neck: 'v',      sleeve: 'three', slack: 6, flare: 28, wrap: true }),
  D({ id: 'maxi-dress',  name: 'Summer maxi',       hem: 652, fit: 'fitted', neck: 'scoop',  sleeve: 'none', flare: 26 }),
  D({ id: 'sweater-dress', name: 'Knit sweater dress', hem: 482, fit: 'loose', neck: 'crew', sleeve: 'long', slack: 6, flare: 6, texture: 'knit', cuff: 'rib', hemBand: true, belt: true }),
  D({ id: 'abaya',       name: 'Abaya',             hem: 656, fit: 'boxy',   neck: 'crew',   sleeve: 'long', slack: 15, flare: 20, trim: { cuff: true }, tags: ['modest', 'long', 'high-neck'] }),
  D({ id: 'jalabiya',    name: 'Jalabiya',          hem: 654, fit: 'boxy',   neck: 'crew',   sleeve: 'long', slack: 9, flare: 17, trim: { yoke: true, cuff: true, hem: true }, tags: ['modest', 'long', 'high-neck'] }),
  D({ id: 'kaftan',      name: 'Kaftan',            hem: 622, fit: 'over',   neck: 'v',      sleeve: 'three', slack: 14, flare: 20, trim: { yoke: true, cuff: true }, texture: 'dots', tags: ['modest', 'long'] }),
  D({ id: 'kurta-set',   name: 'Shalwar kameez',    hem: 520, fit: 'loose',  neck: 'henley', sleeve: 'three', slack: 6, flare: 6, trim: { yoke: true, cuff: true }, lower: 'shalwar', drape: true, tags: ['modest', 'traditional'] }),
  D({ id: 'modest-maxi', name: 'Long-sleeve maxi',  hem: 654, fit: 'loose',  neck: 'crew',   sleeve: 'long', slack: 5, flare: 26, belt: true, tags: ['modest', 'long', 'high-neck'] }),
];
DRESSES.forEach(regTop);
export const DRESS_BY_ID: Record<string, DressDef> = Object.fromEntries(DRESSES.map((d) => [d.id, d]));

export function renderDress(c: Ctx, def: DressDef, color: string): string {
  let out = '';
  if (def.lower) {
    const b = BOTTOM_BY_ID[def.lower];
    out += renderBottom(c, b, darken(color, 0.04));
  }
  out += renderTopTorso(c, def, color);
  if (def.drape) {
    // dupatta: a sheer sash across the chest
    const col = lighten(color, luma(color) > 0.6 ? -0.1 : 0.22);
    const sash = `M${CX - 48},${LM.shoulder + 4}Q${CX - 8},${LM.shoulder + 28} ${CX + 38},${LM.bust + 20}Q${CX + 56},${LM.waist - 10} ${CX + 62},${LM.hip}L${CX + 40},${LM.hip + 6}Q${CX + 34},${LM.waist} ${CX + 16},${LM.bust + 34}Q${CX - 16},${LM.bust + 6} ${CX - 52},${LM.shoulder + 30}Z`;
    out += `<path d="${sash}" fill="${col}" opacity=".93" stroke="${edge(col)}" stroke-width="1"/><path d="M${CX - 46},${LM.shoulder + 14}Q${CX - 6},${LM.shoulder + 36} ${CX + 36},${LM.bust + 26}Q${CX + 50},${LM.waist} ${CX + 54},${LM.hip - 6}" fill="none" stroke="${trimColor(color)}" stroke-width="1.8" stroke-dasharray="3 2.4" opacity=".8"/>`;
  }
  void n2;
  return out;
}
export const renderDressSleeve = (c: Ctx, def: DressDef, color: string, arm: Arm) => renderSleeve(c, def, color, arm);
export const dressIds = DRESSES.map((d) => d.id);
