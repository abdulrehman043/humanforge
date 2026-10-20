// Geometry and colour helpers shared by every Forge2D illustration template.
// All artwork is authored on one fixed canvas (see CANVAS) as short point lists that are smoothed
// into cubic Béziers, so shapes stay easy to edit and always join cleanly.

export type Pt = [number, number];

/** Top padding keeps tall hair (buns, afros, hats) inside the canvas. */
export const TOP_PAD = 12;
export const CANVAS = { w: 400, h: 700 } as const;
export const CX = 200;
/** Head layers are drawn at this scale about the chin (1 = as authored). */
export const HEAD_SCALE = 1;
export const HEAD_PIVOT: [number, number] = [200, 176];

export const n2 = (v: number) => String(Math.round(v * 100) / 100);
export const P = (p: Pt) => `${n2(p[0])},${n2(p[1])}`;

/** Catmull-Rom spline through `pts` as cubic Béziers. `move:false` omits the leading M so segments can be chained. */
export function spline(pts: Pt[], closed = false, k = 1 / 6, move = true): string {
  const n = pts.length;
  if (n < 2) return '';
  const get = (i: number): Pt => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = move ? `M${P(pts[0])}` : '';
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += `C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return closed ? d + 'Z' : d;
}

/** Bézier points of the spline (for lookups and strands). */
export function sampleSpline(pts: Pt[], per = 8, k = 1 / 6): Pt[] {
  const n = pts.length;
  const get = (i: number): Pt => pts[Math.max(0, Math.min(n - 1, i))];
  const out: Pt[] = [pts[0]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    for (let s = 1; s <= per; s++) {
      const t = s / per, u = 1 - t;
      out.push([
        u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
        u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1],
      ]);
    }
  }
  return out;
}

export const mirrorPts = (pts: Pt[], cx = CX): Pt[] => pts.map(([x, y]) => [2 * cx - x, y]);

/** Closed symmetric outline from the right half (first and last points lie on the axis). */
export function symLoop(right: Pt[], cx = CX): Pt[] {
  const inner = right.slice(1, -1);
  return [...right, ...mirrorPts(inner, cx).reverse()];
}
export const symPath = (right: Pt[], k = 1 / 6, cx = CX) => spline(symLoop(right, cx), true, k);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const polyline = (pts: Pt[]) => 'M' + pts.map(P).join('L');

/** A filled ribbon of varying width along a centre curve (brows, strands, brush strokes). */
export function ribbon(center: Pt[], widths: number[], k = 1 / 6): string {
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i < center.length; i++) {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(center.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const w = (widths[i] ?? widths[widths.length - 1]) / 2;
    left.push([center[i][0] - dy * w, center[i][1] + dx * w]);
    right.push([center[i][0] + dy * w, center[i][1] - dx * w]);
  }
  return spline(left, false, k) + 'L' + P(right[right.length - 1]) + spline(right.reverse(), false, k, false).replace(/^/, '') + 'Z';
}

/** Deterministic PRNG (mulberry32) so illustrations and randomisation are reproducible. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- colour
export type RGB = [number, number, number];
export const hex2rgb = (h: string): RGB => {
  const s = h.replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
export const rgb2hex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
};
export function rgb2hsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hsl2rgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
/** Shift lightness (dl, -1..1) and optionally hue (deg) / saturation. */
export function tone(hex: string, dl: number, dh = 0, ds = 0) {
  const [h, s, l] = rgb2hsl(hex2rgb(hex));
  return rgb2hex(hsl2rgb(h + dh, clamp(s + ds, 0, 1), clamp(l + dl, 0, 1)));
}
export const darken = (hex: string, t: number) => tone(hex, -t, -3, 0.02);
export const lighten = (hex: string, t: number) => tone(hex, t, 2, -0.02);
export const luma = (hex: string) => {
  const [r, g, b] = hex2rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);

// ---------------------------------------------------------------- svg defs
/** Collects gradients, clips and masks for one rendered avatar; ids are namespaced so several avatars can share a page. */
export class Defs {
  private items: string[] = [];
  private n = 0;
  /** `noBlur`: skip soft blurred decorations (fast thumbnails). `portable`: emit no SVG filters at all (react-native-svg); volume comes from bevels. */
  constructor(public readonly uid: string, public noBlur = false, public readonly portable = false, /** thumbnails: drop fine detail (single-stroke softness, fewer strands) */ public readonly thin = false) {
    if (portable) this.noBlur = true;
  }
  private nid(name: string) { return `${this.uid}${name}${this.n++}`; }
  private stopsXml(stops: [number, string, number?][]) {
    return stops.map(([o, c, a]) => `<stop offset="${n2(o)}" stop-color="${c}"${a !== undefined && a < 1 ? ` stop-opacity="${n2(a)}"` : ''}/>`).join('');
  }
  linear(x1: number, y1: number, x2: number, y2: number, stops: [number, string, number?][]) {
    const id = this.nid('g');
    this.items.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}">${this.stopsXml(stops)}</linearGradient>`);
    return `url(#${id})`;
  }
  radial(cx: number, cy: number, r: number, stops: [number, string, number?][], fx = cx, fy = cy, transform = '') {
    const id = this.nid('r');
    this.items.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}" fx="${n2(fx)}" fy="${n2(fy)}"${transform ? ` gradientTransform="${transform}"` : ''}>${this.stopsXml(stops)}</radialGradient>`);
    return `url(#${id})`;
  }
  clip(inner: string) {
    const id = this.nid('c');
    this.items.push(`<clipPath id="${id}">${inner}</clipPath>`);
    return `url(#${id})`;
  }
  mask(inner: string) {
    const id = this.nid('m');
    this.items.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${CANVAS.w}" height="${CANVAS.h}">${inner}</mask>`);
    return `url(#${id})`;
  }
  pattern(w: number, h: number, inner: string, transform = '') {
    const id = this.nid('p');
    this.items.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${n2(w)}" height="${n2(h)}"${transform ? ` patternTransform="${transform}"` : ''}>${inner}</pattern>`);
    return `url(#${id})`;
  }
  /** Dimensional shading: the group's alpha is blurred into a height map and lit from the upper left (diffuse + a little specular). */
  lit(o: { blur?: number; scale?: number; spec?: number; kd?: number; el?: number; az?: number } = {}) {
    const key = JSON.stringify(o);
    const hit = this.litCache.get(key);
    if (hit) return hit;
    const { blur = 6, scale = 5, kd = 1.28, el = 56, az = 235 } = o;
    if (blur < 3) return 'none'; // tiny details are shaded with plain gradients (a filter would cost more than it adds)
    const spec = (o.spec ?? 0.25) < 0.2 ? 0 : (o.spec ?? 0.25);
    const id = this.nid('l');
    const light = `<feDistantLight azimuth="${az}" elevation="${el}"/>`;
    this.items.push(`<filter id="${id}" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${n2(blur)}" result="h"/>` +
      `<feDiffuseLighting in="h" surfaceScale="${n2(scale)}" diffuseConstant="${n2(kd)}" lighting-color="#ffffff" result="d">${light}</feDiffuseLighting>` +
      `<feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="0.72" k2="0.3" k3="0" k4="0" result="lit"/>` +
      (spec > 0 ? `<feSpecularLighting in="h" surfaceScale="${n2(scale)}" specularConstant="${n2(spec)}" specularExponent="24" lighting-color="#ffffff" result="s">${light}</feSpecularLighting><feComposite in="s" in2="lit" operator="arithmetic" k1="0" k2="0.6" k3="1" k4="0" result="o"/>` : `<feComposite in="lit" in2="lit" operator="over" result="o"/>`) +
      `<feComposite in="o" in2="SourceAlpha" operator="in"/></filter>`);
    const url = `url(#${id})`;
    this.litCache.set(key, url);
    return url;
  }
  private litCache = new Map<string, string>();

  /** An elliptical soft blob with no filter: a radial gradient in bounding-box units (works everywhere). */
  radialBox(color: string, alpha: number, inner = 0) {
    const id = this.nid('b');
    this.items.push(`<radialGradient id="${id}" cx=".5" cy=".5" r=".5"><stop offset="${n2(inner)}" stop-color="${color}" stop-opacity="${n2(alpha)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`);
    return `url(#${id})`;
  }

  /** A soft elliptical glow or shadow without any filter. */
  glow(cx: number, cy: number, rx: number, ry: number, color: string, op: number, extra = '') {
    return `<ellipse cx="${n2(cx)}" cy="${n2(cy)}" rx="${n2(rx)}" ry="${n2(ry)}" fill="${this.radialBox(color, op)}"${extra}/>`;
  }
  /** A soft stroke without any filter: three stacked strokes of decreasing width. */
  softStroke(d: string, color: string, w: number, op: number, extra = '') {
    if (this.thin) return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${n2(w * 1.3)}" stroke-linecap="round" stroke-linejoin="round" opacity="${n2(op * 0.9)}"${extra}/>`;
    let o = '';
    for (const [m, a] of [[1.9, 0.3], [1.3, 0.4], [0.75, 0.55]] as const) o += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${n2(w * m)}" stroke-linecap="round" stroke-linejoin="round" opacity="${n2(op * a)}"${extra}/>`;
    return o;
  }
  /** A soft contact shadow of a shape: a real blur on the web, a few offset copies when filters are unavailable. */
  shadowOf(path: string, color: string, op: number, dx: number, dy: number, std: number) {
    if (!this.noBlur) return `<path d="${path}" fill="${color}" opacity="${n2(op)}" transform="translate(${n2(dx)} ${n2(dy)})" filter="${this.blur(std)}"/>`;
    return [0.45, 0.8, 1.15].map((m) => `<path d="${path}" fill="${color}" opacity="${n2(op * 0.34)}" transform="translate(${n2(dx * m)} ${n2(dy * m)})"/>`).join('');
  }
  /**
   * Dimensional shading for a group of shapes. On the web the content is lit by an SVG lighting filter; in portable mode
   * (no filters) the same volume is built from stepped inner bevels: a dark rim along the lower-right inside edge and a
   * light rim along the upper-left, clipped to the shapes. `shapes` are the path data of the silhouette(s).
   */
  volume(content: string, shapes: string[], o: { blur?: number; scale?: number; spec?: number } = {}): string {
    if (!this.portable) {
      const f = this.lit(o);
      return f === 'none' ? content : `<g filter="${f}">${content}</g>`;
    }
    return content + this.bevel(shapes, o);
  }
  private bevel(shapes: string[], o: { blur?: number; scale?: number }): string {
    const blur = o.blur ?? 6, scale = o.scale ?? 5;
    if (blur < 3 || !shapes.length) return '';
    const w = clamp(blur * 1.15, 3.4, 12), amp = clamp(scale / 5, 0.4, 1.5);
    // every silhouette is written once and reused with <use>, so the bands do not repeat the path data
    const ids = shapes.map((d) => { const id = this.nid('s'); this.items.push(`<path id="${id}" d="${d}"/>`); return id; });
    const clip = this.clip(shapes.map((d) => `<path d="${d}"/>`).join(''));
    const band = (dx: number, dy: number, color: string, op: number) => {
      const id = this.nid('v');
      this.items.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="-60" y="-60" width="520" height="820"><rect x="-60" y="-60" width="520" height="820" fill="#fff"/><g transform="translate(${n2(dx)} ${n2(dy)})" fill="#000">${ids.map((i) => `<use href="#${i}"/>`).join('')}</g></mask>`);
      return `<rect x="-60" y="-60" width="520" height="820" fill="${color}" opacity="${n2(op)}" mask="url(#${id})"/>`;
    };
    let out = `<g clip-path="${clip}">`;
    for (const [f, a] of [[0.4, 0.12], [1, 0.07]] as const) {
      const k = w * f;
      out += band(k, k * 1.15, '#ffffff', a * amp * 1.0) + band(-k, -k * 1.15, '#1a0f0a', a * amp * 1.3);
    }
    return out + '</g>';
  }
  blur(std: number) {
    if (this.noBlur) return 'none';
    const id = this.nid('f');
    this.items.push(`<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${CANVAS.w}" height="${CANVAS.h}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${n2(std)}"/></filter>`);
    return `url(#${id})`;
  }
  toString() { return this.items.length ? `<defs>${this.items.join('')}</defs>` : ''; }
}

/** Rotation about a point written as translate/rotate/translate (every SVG parser, including react-native-svg, handles this). */
export const rot = (deg: number, cx: number | string, cy: number | string) => `translate(${n2(+cx)} ${n2(+cy)}) rotate(${n2(deg)}) translate(${n2(-cx)} ${n2(-cy)})`;
export const stripNoopFilters = (svg: string) => svg.replace(/ filter="none"/g, '');
/** Portable output only: one decimal for coordinates of 10 or more (0.1 px at the 400 px canvas), which trims the file by about a fifth. */
export const slimNumbers = (svg: string) => svg.replace(/(\d{2,})\.(\d)\d+/g, '$1.$2');


/** Short stable id prefix for a string (unique SVG ids per avatar or tile when several share one document). */
export const hashId = (str: string) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(36); };

/**
 * Portable output only: a long path that appears more than once (fill, outline, strands clip...) is written once in <defs>
 * and reused with <use>. clipPath children are left alone (clip paths keep their own copy).
 */
export function dedupePaths(svg: string, uid: string): string {
  const parts = svg.split(/(<clipPath[\s\S]*?<\/clipPath>)/g);
  const counts = new Map<string, number>();
  for (const p of parts) {
    if (p.startsWith('<clipPath')) continue;
    for (const m of p.matchAll(/<path d="([^"]{160,})"/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  const ids = new Map<string, string>();
  let defs = '';
  for (const [d, n] of counts) if (n >= 2) { const id = `${uid}d${ids.size}`; ids.set(d, id); defs += `<path id="${id}" d="${d}"/>`; }
  if (!ids.size) return svg;
  const body = parts.map((p) => (p.startsWith('<clipPath') ? p : p.replace(/<path d="([^"]{160,})"([^>]*)\/>/g, (m, d, rest) => (ids.has(d) ? `<use href="#${ids.get(d)}"${rest}/>` : m)))).join('');
  return /<defs>/.test(body) ? body.replace('<defs>', `<defs>${defs}`) : body.replace(/(<svg[^>]*>)/, `$1<defs>${defs}</defs>`);
}
