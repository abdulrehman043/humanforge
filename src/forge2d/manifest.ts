// The asset manifest: one entry per selectable option, built from the live template registries (plus plug-in assets).
import { CANVAS, CX } from './geom';
import { LAYER_ORDER, LayerId } from './layers';
import { EXPRESSIONS, EYE_STYLES, BROW_STYLES, NOSE_STYLES, MOUTH_STYLES, FACE_SHAPES } from './face';
import { SKIN_TONES } from './palette';
import { HAIRS } from './hairs';
import { HEADWEAR } from './headwear';
import { TOPS, OUTER } from './tops';
import { BOTTOMS } from './bottoms';
import { DRESSES } from './dresses';
import { SHOES } from './shoes';
import { GLASSES, EARRINGS, NECKLACES, SCARVES, BAGS, HAIR_ACCESSORIES } from './accessories';
import { POSES } from './body';
import { listExternal } from './external';
import { SK } from './body';

export type Category =
  | 'faceShape' | 'skin' | 'eyes' | 'brows' | 'nose' | 'mouth' | 'hair' | 'headwear'
  | 'top' | 'outer' | 'bottom' | 'dress' | 'shoes' | 'glasses' | 'earrings' | 'necklace' | 'scarf' | 'bag' | 'hairAccessory' | 'expression' | 'pose';
export type AssetStatus = 'draft' | 'tested' | 'approved';

export const ANCHORS = {
  head: [CX, 111], eyeLine: [CX, 111], chin: [CX, 174], neckBase: [CX, 206], shoulderL: [146, 219], shoulderR: [254, 219],
  waist: [CX, 306], hip: [CX, SK.hipY], ground: [CX, SK.groundY],
} as const;
export type AnchorName = keyof typeof ANCHORS;

export interface AssetEntry {
  id: string;                    // "hair.long-center"
  optionId: string;              // "long-center"
  category: Category;
  name: string;
  kind: 'procedural-svg' | 'svg-fragment';
  /** file path for fragment assets; procedural templates have none */
  path: string | null;
  template: string | null;
  size: { w: number; h: number };
  layers: { layer: LayerId; order: number }[];
  anchors: Partial<Record<AnchorName, readonly [number, number]>>;
  variants: { colors?: string; fabrics?: boolean; textures?: string[] };
  compat: { tags: string[]; excludesHairTags?: string[]; hides?: string[] };
  status: AssetStatus;
  source: { type: 'original-procedural' | 'plugin'; author: string; license: string; note?: string };
}

const SRC = { type: 'original-procedural', author: 'HumanForge', license: 'MIT', note: 'Drawn in code for this project; no third-party artwork.' } as const;
const L = (...ids: LayerId[]) => ids.map((layer) => ({ layer, order: LAYER_ORDER[layer] }));
const A = (...names: AnchorName[]) => Object.fromEntries(names.map((n) => [n, ANCHORS[n]])) as AssetEntry['anchors'];

function entry(category: Category, optionId: string, name: string, layers: LayerId[], anchors: AnchorName[], extra: Partial<AssetEntry> = {}): AssetEntry {
  return {
    id: `${category}.${optionId}`, optionId, category, name, kind: 'procedural-svg', path: null, template: `${category}/${optionId}`,
    size: { w: CANVAS.w, h: CANVAS.h }, layers: L(...layers), anchors: A(...anchors), variants: {}, compat: { tags: [] },
    status: 'draft', source: SRC, ...extra,
  };
}

export function buildManifest(): AssetEntry[] {
  const m: AssetEntry[] = [];
  FACE_SHAPES.forEach((s) => m.push(entry('faceShape', s, s[0].toUpperCase() + s.slice(1), ['face', 'ears'], ['head', 'chin'])));
  SKIN_TONES.forEach((s) => m.push(entry('skin', s.id, s.name, ['legs', 'torso', 'face', 'arms.mid', 'arms.front'], ['head', 'neckBase'], { variants: { colors: 'skin' } })));
  Object.entries(EYE_STYLES).forEach(([id, e]) => m.push(entry('eyes', id, e.name, ['face.features'], ['eyeLine'], { variants: { colors: 'eye' } })));
  Object.entries(BROW_STYLES).forEach(([id, e]) => m.push(entry('brows', id, e.name, ['face.features'], ['eyeLine'])));
  Object.entries(NOSE_STYLES).forEach(([id, e]) => m.push(entry('nose', id, e.name, ['face.features'], ['eyeLine'])));
  Object.entries(MOUTH_STYLES).forEach(([id, e]) => m.push(entry('mouth', id, e.name, ['face.features'], ['chin'], { variants: { colors: 'lip' } })));
  HAIRS.forEach((h) => m.push(entry('hair', h.id, h.name, ['hair.back', 'hair.front'], ['head'], { variants: { colors: 'hair', textures: [h.texture] }, compat: { tags: h.tags } })));
  HEADWEAR.forEach((h) => m.push(entry('headwear', h.id, h.name, ['headwear.back', 'headwear.front'], ['head', 'neckBase'], {
    variants: { colors: 'cloth', fabrics: h.kind === 'hijab' || h.kind === 'turban' },
    compat: { tags: h.tags ?? [], excludesHairTags: h.excludesHair, hides: h.coverage === 'full' ? ['hair', 'hairAccessory', 'earrings'] : [] },
  })));
  TOPS.forEach((t) => m.push(entry('top', t.id, t.name, ['top'], ['shoulderL', 'shoulderR', 'waist'], { variants: { colors: 'cloth', textures: t.texture ? [t.texture] : [] }, compat: { tags: t.tags ?? [] } })));
  OUTER.forEach((t) => m.push(entry('outer', t.id, t.name, ['outer'], ['shoulderL', 'shoulderR', 'waist'], { variants: { colors: 'cloth' }, compat: { tags: t.tags ?? [] } })));
  BOTTOMS.forEach((b) => m.push(entry('bottom', b.id, b.name, ['bottoms'], ['waist', 'hip', 'ground'], { variants: { colors: b.denim ? 'denim' : 'cloth' }, compat: { tags: b.tags ?? [] } })));
  DRESSES.forEach((d) => m.push(entry('dress', d.id, d.name, ['dress'], ['shoulderL', 'shoulderR', 'waist', 'ground'], { variants: { colors: 'cloth' }, compat: { tags: d.tags ?? [] } })));
  SHOES.forEach((s) => m.push(entry('shoes', s.id, s.name, ['shoes'], ['ground'], { variants: { colors: 'shoe' }, compat: { tags: s.tags ?? [] } })));
  GLASSES.forEach((g) => m.push(entry('glasses', g.id, g.name, ['accessory.head'], ['eyeLine'], { variants: { colors: 'frame' }, compat: { tags: g.tags ?? [] } })));
  EARRINGS.forEach((g) => m.push(entry('earrings', g.id, g.name, ['accessory.head'], ['head'], { variants: { colors: 'metal' }, compat: { tags: g.tags ?? [] } })));
  NECKLACES.forEach((g) => m.push(entry('necklace', g.id, g.name, ['accessory.body'], ['neckBase'], { variants: { colors: 'metal' } })));
  SCARVES.forEach((g) => m.push(entry('scarf', g.id, g.name, ['accessory.body'], ['neckBase'], { variants: { colors: 'cloth' } })));
  BAGS.forEach((g) => m.push(entry('bag', g.id, g.name, ['accessory.bag'], ['shoulderL', 'hip'], { variants: { colors: 'cloth' } })));
  HAIR_ACCESSORIES.forEach((g) => m.push(entry('hairAccessory', g.id, g.name, ['accessory.head'], ['head'], { variants: { colors: 'cloth' } })));
  Object.keys(EXPRESSIONS).forEach((id) => m.push(entry('expression', id, id[0].toUpperCase() + id.slice(1), ['face.features'], ['eyeLine', 'chin'])));
  Object.entries(POSES).forEach(([id, p]) => m.push(entry('pose', id, p.name, ['arms.mid', 'arms.front'], ['shoulderL', 'shoulderR'])));
  // plug-in assets
  for (const a of listExternal()) {
    const layers = Object.keys(a.layers) as LayerId[];
    m.push({
      ...entry(a.category as Category, a.id, a.name, layers, ['head']),
      kind: 'svg-fragment', template: null, path: `plugin:${a.category}/${a.id}`, compat: { tags: a.tags ?? [] },
      source: { type: 'plugin', author: a.source.author, license: a.source.license },
    });
  }
  return m;
}

export const MANIFEST_VERSION = 1;

/** Apply a review file ({ tested: ids[], approved: ids[] }) to the manifest entries. */
export function applyReview(entries: AssetEntry[], review: { tested?: string[]; approved?: string[] } | null | undefined): AssetEntry[] {
  const t = new Set(review?.tested ?? []), a = new Set(review?.approved ?? []);
  return entries.map((e) => ({ ...e, status: a.has(e.id) ? 'approved' : t.has(e.id) ? 'tested' : 'draft' }));
}

export const byCategory = (m: AssetEntry[], c: Category) => m.filter((e) => e.category === c);
