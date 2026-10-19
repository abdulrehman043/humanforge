// Tiny 2.5D helpers for the cartoon art generator: parts are defined on simple 3D shapes
// (head ellipsoid, body cylinders) and projected for each yaw, so the front, three-quarter and
// profile drawings come from one definition and stay consistent.

export type Pt = [number, number];

/** Canvas: 400 x 640 units (rasterized at 2x / 3x). */
export const W = 400;
export const H = 640;

export const rad = (deg: number) => (deg * Math.PI) / 180;
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/** Rotate a 3D point about the vertical axis (yaw > 0: the figure turns to face the viewer's right). */
export function yawRot([x, y, z]: [number, number, number], yaw: number): [number, number, number] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x * c + z * s, y, -x * s + z * c];
}

/** Closed smooth path through points (Catmull-Rom -> cubic Bezier). */
export function smoothPath(pts: Pt[], closed = true, tension = 0.5): string {
  if (pts.length < 2) return '';
  const n = pts.length;
  const p = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
    const k = tension / 3;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}
export const f = (v: number) => (Math.round(v * 10) / 10).toString();
export const poly = (pts: Pt[]) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L') + 'Z';

export function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 24, rot = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = Math.cos(t) * rx, y = Math.sin(t) * ry;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return out;
}

/** Head ellipsoid used by face features and hair. */
export const HEAD = { cx: 200, cy: 170, a: 98, b: 104, c: 94 };

/** Project a point on the head ellipsoid (u longitude: 0 = nose, +right; v latitude: +up), scaled by s. */
export function headPoint(u: number, v: number, yaw: number, s = 1): { x: number; y: number; z: number; facing: number } {
  const { cx, cy, a, b, c } = HEAD;
  const P: [number, number, number] = [a * s * Math.sin(u) * Math.cos(v), b * s * Math.sin(v), c * s * Math.cos(u) * Math.cos(v)];
  const [x, y, z] = yawRot(P, yaw);
  // cartoon faces are flatter than an ellipsoid: pull features in from the edge as the head turns
  const inset = 1 - 0.12 * Math.abs(Math.sin(yaw)) * Math.cos(v);
  return { x: cx + x * inset, y: cy - y, z, facing: Math.cos(u + yaw) * Math.cos(v) };
}

/**
 * Head outline at a yaw: the ellipsoid silhouette with a cartoon jaw (narrower toward a soft chin)
 * whose chin moves toward the face side as the head turns.
 */
export function headOutline(yaw: number, s = 1, jaw = 1, n = 64): Pt[] {
  const { cx, cy, a, b, c } = HEAD;
  const A = Math.sqrt((a * Math.cos(yaw)) ** 2 + (c * Math.sin(yaw)) ** 2) * s;
  const B = b * s;
  const faceX = cx + Math.sin(yaw) * c * s * 0.55; // the jaw narrows toward the face side
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    let x = cx + Math.sin(t) * A;
    let y = cy - Math.cos(t) * B;
    const below = (y - cy) / B; // 0 at center, 1 at chin
    if (below > 0) {
      const k = 1 - jaw * 0.32 * smooth(0.05, 1, below) - jaw * 0.1 * smooth(0.6, 1, below);
      x = faceX + (x - faceX) * k;
      y = cy + (y - cy) * (1 - 0.04 * jaw);
    }
    pts.push([x, y]);
  }
  return pts;
}
