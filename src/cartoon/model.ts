// Cartoon avatar model: config, asset manifest, layer order and slider transforms.
// Platform-neutral (no React): used by the RN viewer, the web viewer and the asset build.

export type CartoonBuild = 'female' | 'male';
export type ColorSlot = 'skin' | 'hair' | 'brow' | 'eye' | 'lip' | 'top' | 'bottom' | 'outfit' | 'shoes' | 'headwear' | 'facialHair';

/** The avatar as plain JSON (store it as-is). */
export interface CartoonConfig {
  build: CartoonBuild;
  skin: string;
  hair: string | null;
  hairColor: string;
  eyes: string;
  eyeColor: string;
  brows: string;
  browColor: string;
  nose: string;
  mouth: string;
  lipColor: string;
  facialHair: string | null;
  glasses: string | null;
  headwear: string | null;
  headwearColor: string;
  top: string | null;
  topColor: string;
  bottom: string | null;
  bottomColor: string;
  /** One-piece outfit (abaya, dress, jalabiya…); replaces top and bottom while set. */
  outfit: string | null;
  outfitColor: string;
  shoes: string | null;
  shoesColor: string;
  /** Shape sliders, -1..1 (see CARTOON_SLIDERS). */
  shape: Partial<Record<CartoonSliderId, number>>;
}

export const DEFAULT_CARTOON: CartoonConfig = {
  build: 'female', skin: '#f1c7a5', hair: 'long_wavy', hairColor: '#3a2418', eyes: 'lashes', eyeColor: '#5b3a1e',
  brows: 'soft', browColor: '#3a2418', nose: 'button', mouth: 'smile', lipColor: '#d9777b', facialHair: null, glasses: null,
  headwear: null, headwearColor: '#3b4a6b', top: 'cardigan', topColor: '#e6c34a', bottom: 'jeans', bottomColor: '#3d5a8a',
  outfit: null, outfitColor: '#1f1f24', shoes: 'sneakers', shoesColor: '#f4f4f4', shape: {},
};

// ---------------------------------------------------------------- manifest
export interface CartoonLayerFile {
  /** file name relative to <baseUrl>/<density>/ */
  f: string;
  /** tint: white mask coloured by `slot`; detail: drawn as-is over it; under: drawn as-is beneath it */
  kind: 'tint' | 'detail' | 'under';
  slot?: ColorSlot;
  /** placement in canvas units */
  x: number; y: number; w: number; h: number;
}
export interface CartoonItem { id: string; fit: 'female' | 'male' | 'unisex'; modest?: boolean; hidesHair?: boolean; coversEars?: boolean; color?: string; preview?: string }
export type CartoonItemSlot = 'hair' | 'eyes' | 'brows' | 'nose' | 'mouth' | 'facialHair' | 'glasses' | 'headwear' | 'top' | 'bottom' | 'outfit' | 'shoes';
export interface CartoonView {
  id: string;
  /** art source: front / three / side */
  src: string;
  /** flipped horizontally (the left-facing views reuse the right-facing art) */
  mirror: boolean;
  yaw: number;
}
/** Transform pivots of one art source (canvas units). neck / head / feet fall back to PIVOTS. */
export interface CartoonPivots {
  eyes: [number, number]; nose: [number, number]; mouth: [number, number]; brows: [number, number];
  neck?: [number, number]; head?: [number, number]; feet?: [number, number];
}
export interface CartoonRect { x: number; y: number; w: number; h: number }
export interface CartoonManifest {
  format: 'humanforge-cartoon';
  version: number;
  canvas: { w: number; h: number };
  densities: number[];
  views: CartoonView[];
  /** layers[src][key] = sub-layers in paint order */
  layers: Record<string, Record<string, CartoonLayerFile[]>>;
  /** transform pivots per art source (canvas units) */
  pivots: Record<string, CartoonPivots>;
  /** per-build overrides of `pivots` (art drawn for builds of different height or proportions) */
  buildPivots?: Partial<Record<CartoonBuild, Record<string, CartoonPivots>>>;
  items: Record<CartoonItemSlot, CartoonItem[]>;
  builds: CartoonBuild[];
  /** tab icons per editor section (relative paths) */
  icons?: Record<string, string>;
  /** crop rects (canvas units) for CartoonView framings; defaults suit the built-in chibi art */
  frames?: Partial<Record<'full' | 'bust' | 'head', CartoonRect>>;
}

// ---------------------------------------------------------------- sliders
export type CartoonSliderId = 'headSize' | 'faceWidth' | 'eyeSize' | 'eyeHeight' | 'browHeight' | 'noseSize' | 'mouthWidth' | 'mouthHeight' | 'bodyWidth' | 'height';
export type TransformGroup = 'body' | 'head' | 'eyes' | 'brows' | 'nose' | 'mouth';

export interface CartoonSlider { id: CartoonSliderId; label: string; section: 'face' | 'body' }
export const CARTOON_SLIDERS: CartoonSlider[] = [
  { id: 'headSize', label: 'Head size', section: 'face' },
  { id: 'faceWidth', label: 'Face width', section: 'face' },
  { id: 'eyeSize', label: 'Eye size', section: 'face' },
  { id: 'eyeHeight', label: 'Eye height', section: 'face' },
  { id: 'browHeight', label: 'Brow height', section: 'face' },
  { id: 'noseSize', label: 'Nose size', section: 'face' },
  { id: 'mouthWidth', label: 'Mouth width', section: 'face' },
  { id: 'mouthHeight', label: 'Mouth height', section: 'face' },
  { id: 'bodyWidth', label: 'Build', section: 'body' },
  { id: 'height', label: 'Height', section: 'body' },
];

/** How much each slider moves its part at ±1 (canvas units / scale factors). */
export const SLIDER_GAIN = {
  headSize: 0.12, faceWidth: 0.1, eyeSize: 0.22, eyeHeight: -8, browHeight: -7, noseSize: 0.3,
  mouthWidth: 0.25, mouthHeight: -6, bodyWidth: 0.14, height: 0.1,
} as const;

/** Transform pivots for a build at one art source. */
export const cartoonPivots = (m: CartoonManifest, build: CartoonBuild, src: string): CartoonPivots => m.buildPivots?.[build]?.[src] ?? m.pivots[src];

/** Fallback body pivots (canvas units) for manifests without neck / head / feet pivots (the chibi art). */
export const PIVOTS = { neck: [200, 262] as [number, number], head: [200, 170] as [number, number], feet: [200, 610] as [number, number] };

/**
 * One step of a layer's transform, in canvas units: `t` = translate, `s` = scale about a pivot.
 * A layer's full transform is its groups' steps in order (outer group first).
 */
export type TransformStep =
  | { op: 'translateY'; slider: CartoonSliderId; gain: number }
  | { op: 'scale' | 'scaleX' | 'scaleY'; slider: CartoonSliderId; gain: number; pivot: [number, number] };

export function groupSteps(group: TransformGroup, pivots: CartoonPivots): TransformStep[] {
  const P = { neck: pivots.neck ?? PIVOTS.neck, head: pivots.head ?? PIVOTS.head, feet: pivots.feet ?? PIVOTS.feet };
  switch (group) {
    case 'body': return [
      { op: 'scaleX', slider: 'bodyWidth', gain: SLIDER_GAIN.bodyWidth, pivot: P.feet },
      { op: 'scaleY', slider: 'height', gain: SLIDER_GAIN.height, pivot: P.feet },
    ];
    case 'head': return [
      // the head rides on top of the body: taller body -> head moves up by the stretched body height
      { op: 'translateY', slider: 'height', gain: -SLIDER_GAIN.height * (P.feet[1] - P.neck[1]) },
      { op: 'scale', slider: 'headSize', gain: SLIDER_GAIN.headSize, pivot: P.neck },
      { op: 'scaleX', slider: 'faceWidth', gain: SLIDER_GAIN.faceWidth, pivot: P.head },
    ];
    case 'eyes': return [
      { op: 'translateY', slider: 'eyeHeight', gain: SLIDER_GAIN.eyeHeight },
      { op: 'scale', slider: 'eyeSize', gain: SLIDER_GAIN.eyeSize, pivot: pivots.eyes },
    ];
    case 'brows': return [
      { op: 'translateY', slider: 'eyeHeight', gain: SLIDER_GAIN.eyeHeight },
      { op: 'translateY', slider: 'browHeight', gain: SLIDER_GAIN.browHeight },
    ];
    case 'nose': return [{ op: 'scale', slider: 'noseSize', gain: SLIDER_GAIN.noseSize, pivot: pivots.nose }];
    case 'mouth': return [
      { op: 'translateY', slider: 'mouthHeight', gain: SLIDER_GAIN.mouthHeight },
      { op: 'scaleX', slider: 'mouthWidth', gain: SLIDER_GAIN.mouthWidth, pivot: pivots.mouth },
    ];
  }
}

// ---------------------------------------------------------------- layer order
export interface ResolvedLayer {
  /** stable role id (same for a slot whatever item fills it, so swaps reuse the same view) */
  role: string;
  key: string;
  file: CartoonLayerFile;
  groups: TransformGroup[];
  /** color for tint layers */
  color?: string;
}

/** Layer key aliases: commissioned art names the beard slot facial_hair. */
const keyAlias = (key: string) => (key.startsWith('facialHair.') ? `facial_hair.${key.slice(11)}` : undefined);
const hasKey = (m: CartoonManifest, key: string) => Object.values(m.layers).some((lib) => !!lib[key]);

const itemOf = (m: CartoonManifest, slot: CartoonItemSlot, id: string | null | undefined) => (id ? m.items[slot]?.find((i) => i.id === id) : undefined);

/** Item keys of a config in paint order, with their transform groups (no colors). */
export function cartoonParts(m: CartoonManifest, c: CartoonConfig): { role: string; key: string; groups: TransformGroup[] }[] {
  const b = c.build;
  const hw = itemOf(m, 'headwear', c.headwear);
  const hairItem = hw?.hidesHair ? undefined : itemOf(m, 'hair', c.hair);
  const earsOnTop = !!hairItem && !hairItem.coversEars;
  const H: TransformGroup[] = ['head'];
  const B: TransformGroup[] = ['body'];
  const out: { role: string; key: string; groups: TransformGroup[] }[] = [];
  const push = (role: string, key: string | null, groups: TransformGroup[]) => { if (key) out.push({ role, key, groups }); };
  const wear: [CartoonItemSlot, string | null][] = c.outfit
    ? [['shoes', c.shoes], ['outfit', c.outfit]]
    : [['shoes', c.shoes], ['bottom', c.bottom], ['top', c.top]];
  push('hairBack', hairItem ? `hair.${hairItem.id}.back` : null, H);
  for (const band of ['back', 'mid', 'front'] as const) {
    push(`body.${band}`, `body.${b}.${band}`, B);
    for (const [slot, id] of wear) push(`${slot}.${band}`, id ? `${slot}.${id}.${b}.${band}` : null, B);
  }
  // ears may be drawn per build (ears.female.front) or shared (ears.front)
  const ear = (band: 'back' | 'front') => (hasKey(m, `ears.${b}.${band}`) ? `ears.${b}.${band}` : `ears.${band}`);
  if (!hw?.hidesHair) push('ears.back', ear('back'), H);
  // commissioned art draws a head per build (head.female / head.male); the chibi art shares one
  push('head', hasKey(m, `head.${b}`) ? `head.${b}` : 'head', H);
  if (!hw?.hidesHair && !earsOnTop) push('ears.front', ear('front'), H);
  push('nose', `nose.${c.nose}`, [...H, 'nose']);
  push('mouth', `mouth.${c.mouth}`, [...H, 'mouth']);
  push('facialHair', c.facialHair ? `facialHair.${c.facialHair}` : null, H);
  push('eyes', `eyes.${c.eyes}`, [...H, 'eyes']);
  push('brows', `brows.${c.brows}`, [...H, 'brows']);
  push('hairFront', hairItem ? `hair.${hairItem.id}.front` : null, H);
  if (earsOnTop) push('ears.front', ear('front'), H);
  push('glasses', c.glasses ? `glasses.${c.glasses}` : null, [...H, 'eyes']);
  push('headwear', hw ? `headwear.${hw.id}.${b}` : null, H);
  return out;
}

const SLOT_COLOR: Record<ColorSlot, (c: CartoonConfig) => string> = {
  skin: (c) => c.skin, hair: (c) => c.hairColor, brow: (c) => c.browColor, eye: (c) => c.eyeColor, lip: (c) => c.lipColor,
  top: (c) => c.topColor, bottom: (c) => c.bottomColor, outfit: (c) => c.outfitColor, shoes: (c) => c.shoesColor,
  headwear: (c) => c.headwearColor, facialHair: (c) => c.hairColor,
};
export const slotColor = (slot: ColorSlot, c: CartoonConfig) => SLOT_COLOR[slot](c);

/** Every image layer of a config for one art source, in paint order, with tint colors. */
export function cartoonLayers(m: CartoonManifest, c: CartoonConfig, src: string): ResolvedLayer[] {
  const lib = m.layers[src] ?? {};
  const out: ResolvedLayer[] = [];
  for (const p of cartoonParts(m, c)) {
    const alias = keyAlias(p.key);
    (lib[p.key] ?? (alias && lib[alias]) ?? []).forEach((file, i) => {
      out.push({ role: `${p.role}.${i}`, key: p.key, file, groups: p.groups, color: file.kind === 'tint' && file.slot ? slotColor(file.slot, c) : undefined });
    });
  }
  return out;
}

/** Files (relative to the density folder) a config needs for the given views. */
export function cartoonFiles(m: CartoonManifest, c: CartoonConfig, views: CartoonView[] = m.views): string[] {
  const srcs = [...new Set(views.map((v) => v.src))];
  return [...new Set(srcs.flatMap((s) => cartoonLayers(m, c, s).map((l) => l.file.f)))];
}

/** Item signature: changes when any image file changes (not on color or slider edits). */
export const cartoonItemKey = (m: CartoonManifest, c: CartoonConfig) => cartoonParts(m, c).map((p) => p.key).join('|');

/** Static (non-animated) 2D affine for a layer: [a, b, c, d, e, f] in canvas units. */
export function layerMatrix(steps: TransformStep[], shape: CartoonConfig['shape']): [number, number, number, number, number, number] {
  let M: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  const mul = (N: typeof M) => {
    const [a, b, c, d, e, f] = M, [A, B, C, D, E, F] = N;
    M = [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
  };
  for (const st of steps) {
    const v = shape[st.slider] ?? 0;
    if (st.op === 'translateY') { mul([1, 0, 0, 1, 0, v * st.gain]); continue; }
    const k = 1 + v * st.gain;
    const sx = st.op === 'scaleY' ? 1 : k, sy = st.op === 'scaleX' ? 1 : k;
    const [px, py] = st.pivot;
    mul([sx, 0, 0, sy, px - sx * px, py - sy * py]);
  }
  return M;
}
