// Platform-neutral editor model for the cartoon avatar, same pattern as createHumanEditor:
// developer options decide what users may edit; the model turns the manifest into sections
// and controls (pictures, swatches, sliders) that <CartoonEditor> renders.
//
//   const editor = createCartoonEditor(pkg, { gender: 'female', modest: true, exclude: ['glasses'] });
import { CARTOON_SLIDERS, CartoonBuild, CartoonConfig, CartoonItemSlot, CartoonManifest, CartoonSliderId, DEFAULT_CARTOON } from './model';
import type { CartoonPackage } from './package';

export type CartoonGender = 'female' | 'male' | 'any';
export type CartoonSectionId = 'skin' | 'face' | 'eyes' | 'brows' | 'nose' | 'mouth' | 'hair' | 'facialHair' | 'glasses' | 'headwear' | 'outfit' | 'top' | 'bottom' | 'shoes' | 'body';
export const CARTOON_SECTIONS: CartoonSectionId[] = ['skin', 'face', 'eyes', 'brows', 'nose', 'mouth', 'hair', 'facialHair', 'glasses', 'headwear', 'outfit', 'top', 'bottom', 'shoes', 'body'];

export const CARTOON_SKIN_TONES = ['#fbe3d3', '#f6d2b8', '#f1c7a5', '#e8b48f', '#d9a07a', '#c68a62', '#b0754f', '#97603f', '#7d4c31', '#653a25', '#4f2c1c', '#3b2116'];
export const CARTOON_HAIR_COLORS = ['#141010', '#2a1c14', '#3a2418', '#5a3a22', '#7a4a26', '#a0612f', '#c58b4a', '#e2c07a', '#f1e2b8', '#9a9a9a', '#e9e6e0', '#b5452e', '#6a3d8f', '#2f6db5'];
export const CARTOON_EYE_COLORS = ['#3b2414', '#5b3a1e', '#7a5a2a', '#4f6b3a', '#3f7a6a', '#4a6f9a', '#2f4f8a', '#7b8a8f'];
export const CARTOON_LIP_COLORS = ['#d9777b', '#c95f6a', '#b8505c', '#e6918f', '#a8606a', '#8f4a4a', '#d98a7a'];
export const CARTOON_FABRIC_COLORS = ['#1f1f24', '#3b3b44', '#f4f4f4', '#e8e4dc', '#d9c7b0', '#c9a227', '#e6c34a', '#e07a3f', '#b04a5a', '#d9667a', '#7b4a8c', '#3b4a6b', '#3f7fd6', '#9cc3e6', '#2f4f4f', '#4f7a4a', '#5c6b7a', '#5a3a28'];

export interface CartoonEditorOptions {
  /** Lock the avatar to one body/style set; hides the build choice and filters items. Default 'any'. */
  gender?: CartoonGender;
  /** Only modest garments (long sleeves, long hems, abaya, jalabiya, hijab, al-amira…). */
  modest?: boolean;
  sections?: CartoonSectionId[];
  /** Section or control ids to hide: 'glasses', 'face.headSize', 'hair.color'… */
  exclude?: string[];
  include?: string[];
  /** Allowed item ids per slot. */
  items?: Partial<Record<CartoonItemSlot, string[]>>;
  colors?: { skin?: string[]; hair?: string[]; eyes?: string[]; lips?: string[]; fabric?: string[] };
  /** Slots that offer "none". Default: facialHair, glasses, headwear, outfit. */
  optional?: Partial<Record<'hair' | 'facialHair' | 'glasses' | 'headwear' | 'shoes', boolean>>;
  /** Slider range 0..1 (default 1). */
  sliderRange?: number;
  defaults?: Partial<CartoonConfig>;
  locked?: Partial<CartoonConfig>;
  labels?: Record<string, string>;
}

interface Base { id: string; label: string }
export interface CartoonOption { id: string | null; label: string; preview?: string; swatch?: string }
export interface CartoonChoice extends Base { kind: 'choice'; display: 'image' | 'swatch'; tall?: boolean; options: CartoonOption[]; value(c: CartoonConfig): string | null; apply(c: CartoonConfig, v: string | null): CartoonConfig }
export interface CartoonSliderControl extends Base { kind: 'slider'; slider: CartoonSliderId; min: number; max: number; value(c: CartoonConfig): number; apply(c: CartoonConfig, v: number): CartoonConfig }
export type CartoonControl = CartoonChoice | CartoonSliderControl;
export interface CartoonSection { id: CartoonSectionId; label: string; /** preview/swatch for icon tabs */ icon(c: CartoonConfig): { preview?: string; swatch?: string }; controls: CartoonControl[] }

export interface CartoonEditorModel {
  options: CartoonEditorOptions;
  sections: CartoonSection[];
  initial: CartoonConfig;
  normalize(c?: Partial<CartoonConfig> | null): CartoonConfig;
  randomize(rand?: () => number): CartoonConfig;
  allowed: Record<CartoonItemSlot, string[]>;
}

const LABELS: Record<CartoonSectionId, string> = {
  skin: 'Skin', face: 'Face', eyes: 'Eyes', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', hair: 'Hair', facialHair: 'Beard', glasses: 'Glasses',
  headwear: 'Headwear', outfit: 'Outfit', top: 'Top', bottom: 'Bottom', shoes: 'Shoes', body: 'Body',
};
const GENDER_DEFAULTS: Record<CartoonBuild, Partial<CartoonConfig>> = {
  female: { build: 'female', hair: 'long_wavy', eyes: 'lashes', brows: 'soft', top: 'cardigan', bottom: 'jeans', shoes: 'sneakers', facialHair: null },
  male: { build: 'male', hair: 'side_part', eyes: 'round', brows: 'straight', top: 'tshirt', topColor: '#3f7fd6', bottom: 'jeans', shoes: 'sneakers', facialHair: null },
};
const MODEST_DEFAULTS: Record<CartoonBuild, Partial<CartoonConfig>> = {
  female: { outfit: 'abaya', outfitColor: '#1f1f24', headwear: 'hijab', headwearColor: '#3b4a6b', shoes: 'flats', shoesColor: '#2b2b2b' },
  male: { outfit: 'jalabiya', outfitColor: '#f1ede4', top: 'longsleeve', bottom: 'trousers', shoes: 'sandals', shoesColor: '#a8754a' },
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

export function createCartoonEditor(source: CartoonPackage | CartoonManifest, options: CartoonEditorOptions = {}): CartoonEditorModel {
  const m: CartoonManifest = 'manifest' in source ? source.manifest : source;
  const preview = (rel?: string) => (rel ? ('manifest' in source ? source.previewUri(rel) : rel) : undefined);
  const gender = options.gender ?? 'any';
  const exclude = new Set(options.exclude ?? []);
  const include = options.include ? new Set(options.include) : null;
  const range = Math.min(1, Math.max(0, options.sliderRange ?? 1));
  const label = (id: string, fb: string) => options.labels?.[id] ?? fb;
  const optional = { facialHair: true, glasses: true, headwear: true, hair: true, shoes: false, ...options.optional };
  const fitsBuild = (fit: string, b: CartoonBuild | 'any') => b === 'any' || fit === 'unisex' || fit === b;

  const allowedFor = (slot: CartoonItemSlot, b: CartoonBuild | 'any') => {
    let list = (m.items[slot] ?? []).filter((i) => fitsBuild(i.fit, b));
    if (options.modest && ['top', 'bottom', 'outfit'].includes(slot)) list = list.filter((i) => i.modest);
    const only = options.items?.[slot];
    return (only ? list.filter((i) => only.includes(i.id)) : list).map((i) => i.id);
  };
  const allowed = Object.fromEntries((Object.keys(m.items) as CartoonItemSlot[]).map((s) => [s, allowedFor(s, gender === 'any' ? 'any' : gender)])) as Record<CartoonItemSlot, string[]>;
  const palettes = {
    skin: options.colors?.skin ?? CARTOON_SKIN_TONES, hair: options.colors?.hair ?? CARTOON_HAIR_COLORS, eyes: options.colors?.eyes ?? CARTOON_EYE_COLORS,
    lips: options.colors?.lips ?? CARTOON_LIP_COLORS, fabric: options.colors?.fabric ?? CARTOON_FABRIC_COLORS,
  };

  const itemPreview = (slot: CartoonItemSlot, id: string | null) => preview(m.items[slot]?.find((i) => i.id === id)?.preview);
  const none = (on: boolean): CartoonOption[] => (on ? [{ id: null, label: label('none', 'None') }] : []);
  const choice = (section: CartoonSectionId, slot: CartoonItemSlot, key: keyof CartoonConfig, canBeEmpty: boolean, extra: (c: CartoonConfig, v: string | null) => Partial<CartoonConfig> = () => ({})): CartoonChoice => ({
    kind: 'choice', id: 'style', label: label(`${section}.style`, LABELS[section]), display: 'image', tall: ['outfit', 'top', 'bottom'].includes(slot),
    options: [...none(canBeEmpty), ...allowed[slot].map((id) => ({ id, label: label(id, cap(id)), preview: itemPreview(slot, id) }))],
    value: (c) => c[key] as string | null,
    apply: (c, v) => ({ ...c, [key]: v, ...extra(c, v) }),
  });
  const swatches = (id: string, lbl: string, colors: string[], key: keyof CartoonConfig, extra: (c: CartoonConfig, v: string) => Partial<CartoonConfig> = () => ({})): CartoonChoice => ({
    kind: 'choice', id, label: label(id, lbl), display: 'swatch',
    options: colors.map((col) => ({ id: col, label: col, swatch: col })),
    value: (c) => c[key] as string,
    apply: (c, v) => (v ? { ...c, [key]: v, ...extra(c, v) } : c),
  });
  const slider = (id: CartoonSliderId): CartoonSliderControl => ({
    kind: 'slider', id, slider: id, label: label(id, CARTOON_SLIDERS.find((s) => s.id === id)!.label), min: -range, max: range,
    value: (c) => c.shape[id] ?? 0, apply: (c, v) => ({ ...c, shape: { ...c.shape, [id]: v } }),
  });
  const itemColor = (slot: CartoonItemSlot, id: string | null) => m.items[slot]?.find((i) => i.id === id)?.color;

  const build: Record<CartoonSectionId, () => CartoonControl[]> = {
    skin: () => [swatches('tone', 'Skin tone', palettes.skin, 'skin')],
    face: () => [slider('headSize'), slider('faceWidth')],
    eyes: () => [choice('eyes', 'eyes', 'eyes', false), swatches('color', 'Eye color', palettes.eyes, 'eyeColor'), slider('eyeSize'), slider('eyeHeight')],
    brows: () => [choice('brows', 'brows', 'brows', false), swatches('color', 'Brow color', palettes.hair, 'browColor'), slider('browHeight')],
    nose: () => [choice('nose', 'nose', 'nose', false), slider('noseSize')],
    mouth: () => [choice('mouth', 'mouth', 'mouth', false), swatches('color', 'Lip color', palettes.lips, 'lipColor'), slider('mouthWidth'), slider('mouthHeight')],
    hair: () => [choice('hair', 'hair', 'hair', optional.hair),
      // brows follow the hair color unless the user picked them separately
      swatches('color', 'Hair color', palettes.hair, 'hairColor', (c, v) => (c.browColor === c.hairColor ? { browColor: v } : {}))],
    facialHair: () => (gender === 'female' ? [] : [choice('facialHair', 'facialHair', 'facialHair', true)]),
    glasses: () => [choice('glasses', 'glasses', 'glasses', optional.glasses)],
    headwear: () => [choice('headwear', 'headwear', 'headwear', optional.headwear, (_c, v) => ({ headwearColor: itemColor('headwear', v) ?? _c.headwearColor })), swatches('color', 'Color', palettes.fabric, 'headwearColor')],
    // one-piece outfits; picking a top or bottom later takes it off
    outfit: () => [choice('outfit', 'outfit', 'outfit', true, (c, v) => ({ outfitColor: itemColor('outfit', v) ?? c.outfitColor })), swatches('color', 'Color', palettes.fabric, 'outfitColor')],
    top: () => [choice('top', 'top', 'top', false, (c, v) => ({ outfit: null, topColor: itemColor('top', v) ?? c.topColor })), swatches('color', 'Color', palettes.fabric, 'topColor')],
    bottom: () => [choice('bottom', 'bottom', 'bottom', false, (c, v) => ({ outfit: null, bottomColor: itemColor('bottom', v) ?? c.bottomColor })), swatches('color', 'Color', palettes.fabric, 'bottomColor')],
    shoes: () => [choice('shoes', 'shoes', 'shoes', optional.shoes, (c, v) => ({ shoesColor: itemColor('shoes', v) ?? c.shoesColor })), swatches('color', 'Color', palettes.fabric, 'shoesColor')],
    body: () => [
      ...(gender === 'any' ? [{
        kind: 'choice', id: 'build', label: label('body.build', 'Body'), display: 'image',
        options: m.builds.map((b) => ({ id: b, label: label(b, cap(b)), preview: preview(m.items.top?.find((i) => fitsBuild(i.fit, b))?.preview) })),
        value: (c: CartoonConfig) => c.build, apply: (c: CartoonConfig, v: string | null) => ({ ...c, build: (v ?? c.build) as CartoonBuild }),
      } as CartoonChoice] : []),
      slider('bodyWidth'), slider('height'),
    ],
  };
  const icons: Record<CartoonSectionId, (c: CartoonConfig) => { preview?: string; swatch?: string }> = {
    skin: (c) => ({ swatch: c.skin }), face: () => ({ preview: itemPreview('nose', allowed.nose[0] ?? null) }),
    eyes: (c) => ({ preview: itemPreview('eyes', c.eyes) }), brows: (c) => ({ preview: itemPreview('brows', c.brows) }),
    nose: (c) => ({ preview: itemPreview('nose', c.nose) }), mouth: (c) => ({ preview: itemPreview('mouth', c.mouth) }),
    hair: (c) => ({ preview: itemPreview('hair', c.hair ?? allowed.hair[0] ?? null) }), facialHair: (c) => ({ preview: itemPreview('facialHair', c.facialHair ?? allowed.facialHair[0] ?? null) }),
    glasses: (c) => ({ preview: itemPreview('glasses', c.glasses ?? allowed.glasses[0] ?? null) }), headwear: (c) => ({ preview: itemPreview('headwear', c.headwear ?? allowed.headwear[0] ?? null) }),
    outfit: (c) => ({ preview: itemPreview('outfit', c.outfit ?? allowed.outfit[0] ?? null) }), top: (c) => ({ preview: itemPreview('top', c.top) }),
    bottom: (c) => ({ preview: itemPreview('bottom', c.bottom) }), shoes: (c) => ({ preview: itemPreview('shoes', c.shoes ?? allowed.shoes[0] ?? null) }),
    body: (c) => ({ preview: itemPreview(c.outfit ? 'outfit' : 'top', c.outfit ?? c.top) }),
  };
  // static section icons from the package (tight crops), falling back to the current item's preview
  for (const k of Object.keys(icons) as CartoonSectionId[]) {
    const rel = m.icons?.[k === 'skin' ? '' : k];
    if (rel) { const dyn = icons[k]; icons[k] = (c) => (k === 'skin' ? dyn(c) : { preview: preview(rel) }); }
  }
  const shown = (s: CartoonSectionId, id: string) => !exclude.has(s) && !exclude.has(`${s}.${id}`) && (!include || include.has(`${s}.${id}`) || include.has(s));
  const sections: CartoonSection[] = [];
  for (const id of options.sections ?? CARTOON_SECTIONS) {
    if (exclude.has(id)) continue;
    const controls = build[id]().filter((ctl) => shown(id, ctl.id)).filter((ctl) => ctl.kind !== 'choice' || ctl.options.some((o) => o.id !== null));
    if (controls.length) sections.push({ id, label: label(id, LABELS[id]), icon: icons[id], controls });
  }

  // ---- normalize
  const genderBase = gender === 'any' ? {} : { ...GENDER_DEFAULTS[gender], ...(options.modest ? MODEST_DEFAULTS[gender] : {}) };
  const base = { ...DEFAULT_CARTOON, ...(options.modest && gender === 'any' ? MODEST_DEFAULTS.female : {}), ...genderBase, ...options.defaults } as CartoonConfig;
  const pick = (slot: CartoonItemSlot, want: string | null | undefined, fallback: string | null | undefined, canBeEmpty: boolean, b: CartoonBuild) => {
    const ok = allowedFor(slot, gender === 'any' ? b : gender);
    if (want === null && canBeEmpty) return null;
    if (want && ok.includes(want)) return want;
    if (fallback && ok.includes(fallback)) return fallback;
    return canBeEmpty ? null : ok[0] ?? null;
  };
  function normalize(input?: Partial<CartoonConfig> | null): CartoonConfig {
    const c = { ...base, ...input, ...options.locked, shape: { ...base.shape, ...input?.shape, ...options.locked?.shape } } as CartoonConfig;
    if (gender !== 'any') c.build = gender;
    const b = c.build;
    for (const [k, v] of Object.entries(c.shape)) c.shape[k as CartoonSliderId] = Math.max(-range, Math.min(range, Number(v) || 0));
    c.hair = pick('hair', c.hair, base.hair, optional.hair, b);
    c.eyes = pick('eyes', c.eyes, base.eyes, false, b) ?? c.eyes;
    c.brows = pick('brows', c.brows, base.brows, false, b) ?? c.brows;
    c.nose = pick('nose', c.nose, base.nose, false, b) ?? c.nose;
    c.mouth = pick('mouth', c.mouth, base.mouth, false, b) ?? c.mouth;
    c.facialHair = b === 'female' ? null : pick('facialHair', c.facialHair, null, true, b);
    c.glasses = pick('glasses', c.glasses, null, true, b);
    c.headwear = pick('headwear', c.headwear, null, true, b);
    c.outfit = pick('outfit', c.outfit, null, true, b);
    c.top = pick('top', c.top, base.top, false, b);
    c.bottom = pick('bottom', c.bottom, base.bottom, false, b);
    c.shoes = pick('shoes', c.shoes, base.shoes, optional.shoes, b);
    return c;
  }
  function randomize(rand: () => number = Math.random): CartoonConfig {
    const any = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
    const c = normalize();
    const b = gender === 'any' ? any(m.builds) : gender;
    const ok = (s: CartoonItemSlot) => allowedFor(s, b);
    const hairColor = any(palettes.hair.slice(0, 9));
    return normalize({
      ...c, build: b, skin: any(palettes.skin), hair: any(ok('hair')), hairColor, browColor: hairColor,
      eyes: any(ok('eyes')), eyeColor: any(palettes.eyes), brows: any(ok('brows')), nose: any(ok('nose')), mouth: any(ok('mouth')),
      facialHair: b === 'male' && rand() < 0.4 ? any(ok('facialHair')) : null,
      top: any(ok('top')), topColor: any(palettes.fabric), bottom: any(ok('bottom')), bottomColor: any(palettes.fabric),
      outfit: options.modest || rand() < 0.2 ? any(ok('outfit')) ?? null : null, outfitColor: any(palettes.fabric),
      headwear: options.modest && b === 'female' ? any(ok('headwear').filter((h) => m.items.headwear.find((i) => i.id === h)?.hidesHair)) ?? null : c.headwear,
      shoes: any(ok('shoes')), shoesColor: any(palettes.fabric),
    });
  }
  return { options, sections, initial: normalize(), normalize, randomize, allowed };
}

/** Every pickable attribute with previews/swatches, for building your own UI. */
export function getCartoonCatalog(source: CartoonPackage | CartoonManifest | CartoonEditorModel, options?: CartoonEditorOptions) {
  const e = 'sections' in source ? source : createCartoonEditor(source, options);
  return e.sections.flatMap((s) => s.controls.filter((ctl): ctl is CartoonChoice => ctl.kind === 'choice').map((ctl) => ({
    key: `${s.id}.${ctl.id}`, section: s.id, label: ctl.label, display: ctl.display, options: ctl.options,
    value: ctl.value, apply: (c: CartoonConfig, id: string | null) => e.normalize(ctl.apply(c, id)),
  })));
}
