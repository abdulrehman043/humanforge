// Turn generated sub-layers into SVG documents: one per layer (white tint masks / detail) for the
// asset build, or a single colored composite for previews and thumbnails.
import { H, W } from './geom';
import type { ColorSlot, SubLayer } from './head';

/** Shared defs every layer may reference. */
export const DEFS = `<defs>
<filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="blur3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
<radialGradient id="irisShade" cx="0.5" cy="0.25" r="0.75"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.18"/></radialGradient>
</defs>`;

export const svgDoc = (inner: string, w = W, h = H) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${W} ${H}">${DEFS}${inner}</svg>`;

/** Color a tint layer: its white fills become the slot color. */
export const colorize = (svg: string, color: string) => svg.replace(/fill="#fff"/g, `fill="${color}"`);

export function compositeSvg(layers: SubLayer[], colors: Partial<Record<ColorSlot, string>>) {
  return svgDoc(layers.map((l) => (l.kind === 'tint' ? `<g>${colorize(l.svg, colors[l.slot!] ?? '#ccc')}</g>` : `<g>${l.svg}</g>`)).join(''));
}
