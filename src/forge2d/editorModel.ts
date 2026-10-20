// Pure editor logic shared by the web editor (ForgeEditor.tsx) and the React Native editor (native/ForgeEditorNative.tsx):
// thumbnail crops, neutral preview bases, clothing thumbnail colours, cache keys and tiny config helpers.
import type { AvatarConfig } from './types';
import { BOTTOM_BY_ID } from './bottoms';

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export function setPath(cfg: AvatarConfig, path: string, value: unknown): AvatarConfig {
  const c = clone(cfg) as any;
  const p = path.split('.');
  let o = c;
  for (let i = 0; i < p.length - 1; i++) o = o[p[i]];
  o[p[p.length - 1]] = value;
  return c;
}
export const getPath = (cfg: AvatarConfig, path: string) => path.split('.').reduce((a: any, k) => a?.[k], cfg);

export const CROP: Record<string, [number, number, number, number]> = {
  faceShape: [134, 56, 132, 126], skin: [134, 56, 132, 126], eyes: [146, 98, 108, 76], brows: [146, 92, 108, 76], nose: [158, 108, 84, 76], mouth: [158, 136, 84, 48],
  hair: [56, 14, 288, 340], headwear: [56, 8, 288, 330], top: [44, 194, 312, 262], outer: [36, 194, 328, 290], dress: [16, 188, 368, 512],
  bottom: [28, 322, 344, 366], shoes: [64, 552, 272, 142], glasses: [136, 94, 128, 80], earrings: [104, 96, 192, 120], necklace: [124, 196, 152, 112],
  scarf: [124, 190, 152, 124], bag: [56, 290, 300, 190], hairAccessory: [84, 22, 232, 150], expression: [134, 56, 132, 126], pose: [4, 10, 392, 470],
};
/** Neutral bases so each thumbnail shows the option rather than whatever would cover it. */
export function previewBase(cat: string, cfg: AvatarConfig): AvatarConfig {
  const c = clone(cfg);
  c.pose = cat === 'pose' ? c.pose : 'relaxed';
  const noHair = () => { c.hair.style = 'none'; c.headwear.style = 'none'; c.accessories.hairAccessory = 'none'; };
  const slim = () => { c.outfit.bottom = 'straight-jeans'; c.outfit.bottomColor = '#3d4048'; };
  switch (cat) {
    case 'faceShape': case 'eyes': case 'brows': case 'nose': case 'mouth': case 'expression': case 'skin': noHair(); c.accessories.glasses = 'none'; break;
    case 'hair': c.headwear.style = 'none'; c.accessories.hairAccessory = 'none'; c.outfit.outer = 'none'; c.outfit.dress = 'none'; c.outfit.top = 'tee'; c.outfit.topColor = '#2a2b30'; break;
    case 'headwear': c.accessories.hairAccessory = 'none'; c.hair.style = c.hair.style === 'none' ? 'long-center' : c.hair.style; break;
    case 'hairAccessory': c.headwear.style = 'none'; if (c.hair.style === 'none') c.hair.style = 'long-center'; break;
    case 'earrings': noHair(); c.hair.style = 'pony-high'; break;
    case 'glasses': noHair(); break;
    case 'top': noHair(); c.outfit.dress = 'none'; c.outfit.outer = 'none'; slim(); break;
    case 'outer': noHair(); c.outfit.dress = 'none'; c.outfit.top = 'tee'; c.outfit.topColor = '#f3f0ea'; slim(); break;
    case 'dress': noHair(); c.outfit.outer = 'none'; break;
    case 'bottom': noHair(); c.outfit.dress = 'none'; c.outfit.outer = 'none'; c.outfit.top = 'tee'; c.outfit.topColor = '#e8dcc4'; break;
    case 'shoes': noHair(); c.outfit.dress = 'none'; c.outfit.outer = 'none'; c.outfit.bottom = 'skinny-jeans'; c.outfit.bottomColor = '#3d4048'; break;
    case 'necklace': case 'scarf': noHair(); c.outfit.outer = 'none'; c.outfit.dress = 'none'; c.outfit.top = 'tee'; c.outfit.topColor = '#e8dcc4'; break;
    case 'bag': noHair(); c.outfit.outer = 'none'; break;
    case 'pose': noHair(); c.hair.style = 'bob-fringe'; c.outfit.outer = 'none'; c.outfit.dress = 'none'; break;
  }
  return c;
}


/** Clothing thumbnails use varied mid-tone colours (not the current colour) so every silhouette, collar and fold reads clearly. */
export const TINT_PATH: Record<string, string> = { top: 'outfit.topColor', outer: 'outfit.outerColor', dress: 'outfit.dressColor', bottom: 'outfit.bottomColor', shoes: 'outfit.shoesColor' };
export const TINTS = ['#9cc4ea', '#e9a3b4', '#8fb59a', '#e6d3a8', '#b9a8e0', '#e98a72', '#d9ae4a', '#6f93bf'];
export const DENIM_TINTS = ['#a9c3de', '#7396c0', '#9a9da3', '#4a4d55', '#36507a', '#b8a67e'];
export const SHOE_TINTS = ['#7a5236', '#f1efea', '#26272b', '#b48a5a', '#b32d3a', '#8d9097'];
const HEAD_CATS = new Set(['faceShape', 'skin', 'eyes', 'brows', 'nose', 'mouth', 'expression', 'hair', 'headwear', 'glasses', 'earrings', 'hairAccessory']);
const TIGHT_FACE = new Set(['faceShape', 'skin', 'eyes', 'brows', 'nose', 'mouth', 'expression', 'glasses', 'earrings']);
export function relevantKey(cat: string, c: AvatarConfig): string {
  const head = { face: c.face, hair: c.hair, headwear: c.headwear, acc: c.accessories, expr: c.expression };
  if (TIGHT_FACE.has(cat)) return JSON.stringify(head);
  if (HEAD_CATS.has(cat)) return JSON.stringify({ ...head, outfit: c.outfit });
  return JSON.stringify({ skin: c.face.skin, outfit: c.outfit, acc: c.accessories, pose: c.pose, hair: cat === 'pose' ? c.hair : null, face: cat === 'pose' ? c.face : null });
}


/** The thumbnail tint for option number `idx` of a category (denim tones for jeans, leather tones for shoes). */
export function thumbTint(cat: string, optionId: string, idx: number): string | undefined {
  if (!TINT_PATH[cat]) return undefined;
  if (cat === 'bottom' && BOTTOM_BY_ID[optionId]?.denim) return DENIM_TINTS[idx % DENIM_TINTS.length];
  if (cat === 'shoes') return SHOE_TINTS[idx % SHOE_TINTS.length];
  return TINTS[idx % TINTS.length];
}

/** Cache key for one thumbnail: only the state it actually shows. */
export const thumbKey = (cat: string, path: string, optionId: string, tint: string | undefined, baseKey: string) => `${cat}|${path}|${optionId}|${tint ?? ''}|${baseKey}`;

// ---------------------------------------------------------------- tabs and sections (used by the native editor)
import type { Swatch } from './palette';
import { CLOTH_COLORS, DENIM_COLORS, EYE_COLORS, FRAME_COLORS, HAIR_COLORS, HIGHLIGHT_COLORS, LIP_COLORS, METAL_COLORS, SHADOW_COLORS, SHOE_COLORS, SKIN_TONES } from './palette';
import type { Category } from './manifest';

export type SectionDef =
  | { kind: 'options'; title: string; cat: Category; path: string; optional?: boolean; /** picking an option also sets these paths */ also?: Record<string, string>; showIf?: (c: AvatarConfig) => boolean }
  | { kind: 'swatches'; title?: string; label?: string; path: string; palette: Swatch[] | ((c: AvatarConfig) => Swatch[]); none?: boolean; skin?: boolean; showIf?: (c: AvatarConfig) => boolean }
  | { kind: 'seg'; label: string; path: string; options: { v: string | number | boolean; label: string }[]; showIf?: (c: AvatarConfig) => boolean };

export interface TabDef { id: string; label: string; sections: SectionDef[] }

const isHijab = (c: AvatarConfig) => c.headwear.style.startsWith('hijab') || c.headwear.style === 'headwrap';
export const EDITOR_TABS: TabDef[] = [
  { id: 'face', label: 'Face', sections: [
    { kind: 'options', title: 'Face shape', cat: 'faceShape', path: 'face.shape' },
    { kind: 'options', title: 'Eyes', cat: 'eyes', path: 'face.eyes' },
    { kind: 'swatches', label: 'Eye colour', path: 'face.eyeColor', palette: EYE_COLORS },
    { kind: 'options', title: 'Eyebrows', cat: 'brows', path: 'face.brows' },
    { kind: 'options', title: 'Nose', cat: 'nose', path: 'face.nose' },
    { kind: 'options', title: 'Lips', cat: 'mouth', path: 'face.mouth' },
    { kind: 'swatches', label: 'Lip colour', path: 'face.lipColor', palette: LIP_COLORS },
    { kind: 'swatches', title: 'Makeup & details', label: 'Eyeshadow', path: 'face.eyeshadow', palette: SHADOW_COLORS },
    { kind: 'seg', label: 'Blush', path: 'face.cheeks', options: [{ v: 0, label: 'None' }, { v: 1, label: 'Light' }, { v: 2, label: 'Medium' }, { v: 3, label: 'Rosy' }] },
    { kind: 'seg', label: 'Lashes', path: 'face.lashes', options: [{ v: false, label: 'Off' }, { v: true, label: 'On' }] },
    { kind: 'seg', label: 'Freckles', path: 'face.freckles', options: [{ v: 0, label: 'None' }, { v: 1, label: 'Few' }, { v: 2, label: 'Many' }] },
    { kind: 'seg', label: 'Beauty mark', path: 'face.mole', options: [{ v: 'none', label: 'None' }, { v: 'cheek', label: 'Cheek' }, { v: 'lip', label: 'Lip' }, { v: 'chin', label: 'Chin' }] },
  ] },
  { id: 'skin', label: 'Skin', sections: [{ kind: 'swatches', title: 'Skin tone', path: 'face.skin', palette: SKIN_TONES, skin: true }] },
  { id: 'hair', label: 'Hair', sections: [
    { kind: 'options', title: 'Hairstyle', cat: 'hair', path: 'hair.style', optional: true },
    { kind: 'swatches', title: 'Colour', path: 'hair.color', palette: HAIR_COLORS },
    { kind: 'swatches', label: 'Highlights', path: 'hair.highlight', palette: HIGHLIGHT_COLORS, none: true },
    { kind: 'seg', label: 'Style', path: 'hair.highlightStyle', showIf: (c) => !!c.hair.highlight, options: [{ v: 'balayage', label: 'Balayage' }, { v: 'tips', label: 'Tips' }, { v: 'streaks', label: 'Streaks' }] },
    { kind: 'options', title: 'Hair accessory', cat: 'hairAccessory', path: 'accessories.hairAccessory', optional: true },
    { kind: 'swatches', label: 'Colour', path: 'accessories.hairAccessoryColor', palette: CLOTH_COLORS, showIf: (c) => c.accessories.hairAccessory !== 'none' },
  ] },
  { id: 'head', label: 'Head covering', sections: [
    { kind: 'options', title: 'Hijabs, turbans & hats', cat: 'headwear', path: 'headwear.style', optional: true },
    { kind: 'swatches', title: 'Colour & fabric', path: 'headwear.color', palette: CLOTH_COLORS, showIf: (c) => c.headwear.style !== 'none' },
    { kind: 'seg', label: 'Fabric', path: 'headwear.fabric', showIf: isHijab, options: [{ v: 'jersey', label: 'Jersey' }, { v: 'chiffon', label: 'Chiffon' }, { v: 'satin', label: 'Satin' }, { v: 'matte', label: 'Cotton' }] },
    { kind: 'seg', label: 'Undercap', path: 'headwear.undercap', showIf: isHijab, options: [{ v: false, label: 'Off' }, { v: true, label: 'On' }] },
  ] },
  { id: 'tops', label: 'Tops', sections: [
    { kind: 'options', title: 'Tops', cat: 'top', path: 'outfit.top', also: { 'outfit.dress': 'none' } },
    { kind: 'swatches', title: 'Colour', path: 'outfit.topColor', palette: CLOTH_COLORS },
  ] },
  { id: 'outer', label: 'Jackets', sections: [
    { kind: 'options', title: 'Jackets & coats', cat: 'outer', path: 'outfit.outer', optional: true },
    { kind: 'swatches', title: 'Colour', path: 'outfit.outerColor', palette: CLOTH_COLORS, showIf: (c) => c.outfit.outer !== 'none' },
  ] },
  { id: 'bottoms', label: 'Bottoms', sections: [
    { kind: 'options', title: 'Bottoms', cat: 'bottom', path: 'outfit.bottom', also: { 'outfit.dress': 'none' } },
    { kind: 'swatches', title: 'Colour', path: 'outfit.bottomColor', palette: (c) => (BOTTOM_BY_ID[c.outfit.bottom]?.denim ? DENIM_COLORS : CLOTH_COLORS) },
  ] },
  { id: 'dresses', label: 'Dresses', sections: [
    { kind: 'options', title: 'Dresses, modest & traditional wear', cat: 'dress', path: 'outfit.dress', optional: true },
    { kind: 'swatches', title: 'Colour', path: 'outfit.dressColor', palette: CLOTH_COLORS, showIf: (c) => c.outfit.dress !== 'none' },
  ] },
  { id: 'shoes', label: 'Shoes', sections: [
    { kind: 'options', title: 'Shoes', cat: 'shoes', path: 'outfit.shoes' },
    { kind: 'swatches', title: 'Colour', path: 'outfit.shoesColor', palette: SHOE_COLORS },
  ] },
  { id: 'acc', label: 'Accessories', sections: [
    { kind: 'options', title: 'Glasses', cat: 'glasses', path: 'accessories.glasses', optional: true },
    { kind: 'swatches', label: 'Frame', path: 'accessories.glassesColor', palette: FRAME_COLORS, showIf: (c) => c.accessories.glasses !== 'none' },
    { kind: 'options', title: 'Earrings', cat: 'earrings', path: 'accessories.earrings', optional: true },
    { kind: 'options', title: 'Necklaces', cat: 'necklace', path: 'accessories.necklace', optional: true },
    { kind: 'swatches', label: 'Metal', path: 'accessories.metal', palette: METAL_COLORS },
    { kind: 'options', title: 'Scarves', cat: 'scarf', path: 'accessories.scarf', optional: true },
    { kind: 'swatches', label: 'Colour', path: 'accessories.scarfColor', palette: CLOTH_COLORS, showIf: (c) => c.accessories.scarf !== 'none' },
    { kind: 'options', title: 'Bags', cat: 'bag', path: 'accessories.bag', optional: true },
    { kind: 'swatches', label: 'Colour', path: 'accessories.bagColor', palette: CLOTH_COLORS, showIf: (c) => c.accessories.bag !== 'none' },
  ] },
  { id: 'mood', label: 'Mood & pose', sections: [
    { kind: 'options', title: 'Expression', cat: 'expression', path: 'expression' },
    { kind: 'options', title: 'Pose', cat: 'pose', path: 'pose' },
  ] },
];
export { SKIN_TONES };
