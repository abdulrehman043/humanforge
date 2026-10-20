// Composition engine: config -> ordered layers -> one SVG string (or one standalone SVG per layer). Pure and deterministic.
// Every layer group gets its own Defs with ids derived from the uid and the group name, so a layer's markup depends only on
// the options that affect it: unchanged layers keep an identical string and can be cached as images by the editor.
import { CANVAS, CX, Defs, HEAD_PIVOT, HEAD_SCALE, TOP_PAD, dedupePaths, mix, rot, slimNumbers, stripNoopFilters } from './geom';
import { SKIN_TONES, skinRamp } from './palette';
import { buildFace, renderEars, renderFaceBase, renderFaceFeatures } from './face';
import { POSES, SK, buildArm, renderArmSkin, renderHand, renderLegsSkin, renderNeckTorsoSkin } from './body';
import { TOP_BY_ID, renderSleeve, renderTopTorso } from './tops';
import { BOTTOM_BY_ID, renderBottom } from './bottoms';
import { SHOE_BY_ID, renderShoes } from './shoes';
import { DRESS_BY_ID, renderDress, renderDressSleeve } from './dresses';
import { HAIR_BY_ID } from './hairs';
import { HEADWEAR_BY_ID, renderHeadwear } from './headwear';
import { renderAccessories } from './accessories';
import { resolveConfig } from './compat';
import { normalizeConfig } from './validate';
import { getExternal, ExternalCategory } from './external';
import type { AvatarConfig, Ctx } from './types';
import { LAYER_ORDER, LAYER_Y } from './layers';

export interface RenderOptions {
  /** Pixel width of the root <svg>; height follows the viewBox aspect. */
  width?: number;
  /** Crop, in canvas units. Default is the whole canvas. */
  viewBox?: [number, number, number, number];
  uid?: string;
  /** Skip soft blurs and shadows (fast thumbnails). */
  fast?: boolean;
  /** Emit no SVG filters at all (for react-native-svg): volume comes from bevels and gradients instead of lighting filters. */
  portable?: boolean;
  /** Called with a message when a referenced asset is missing and a fallback was drawn. */
  onWarn?: (msg: string) => void;
  title?: string;
}

/** `defs` holds the gradients, clips and filters this layer's group needs (shared by layers of the same group). */
export interface LayerOut { id: string; order: number; svg: string; defs: string }

let uidCounter = 0;

/** Build the ordered layer list for an avatar (also used by QA to inspect layering). */
export function buildLayers(input: AvatarConfig, d: Defs, warn: (m: string) => void = () => {}): LayerOut[] {
  return buildLayerGroups(input, d.uid, d.noBlur, warn, d.portable);
}

function buildLayerGroups(input: AvatarConfig, uid: string, fast: boolean, warn: (m: string) => void, portable = false, cropY?: [number, number]): LayerOut[] {
  const norm = normalizeConfig(input);
  norm.issues.filter((i) => i.code === 'missing-asset' || i.severity === 'error').forEach((i) => warn(`${i.path}: ${i.message}`));
  const r = resolveConfig(norm.config);
  const cfg = r.cfg;
  const skinSw = SKIN_TONES.find((s) => s.id === cfg.face.skin) ?? SKIN_TONES[4];
  const skin = skinRamp(skinSw.hex);
  const face = buildFace(cfg.face.shape);
  const hairColor = cfg.hair.color;
  const browColor = mix(hairColor, '#2a1a12', 0.55);
  const base = { cfg, skin, face, hairColor, browColor };
  const ctxs = new Map<string, Ctx>();
  const ctx = (key: string): Ctx => {
    let c = ctxs.get(key);
    if (!c) { c = { ...base, d: new Defs(`${uid}${key}`, fast, portable, fast) }; ctxs.set(key, c); }
    return c;
  };
  const L: (LayerOut & { key: string })[] = [];
  const pose = POSES[cfg.pose] ?? POSES.relaxed;
  const HEAD_LAYERS = new Set<string>(['hair.back', 'headwear.back', 'ears', 'face', 'face.features', 'hair.front', 'headwear.front', 'accessory.head']);
  // poses lean the head a few degrees about the neck (not with a hijab: its drape belongs to the shoulders)
  const tilt = pose.tilt && !HEADWEAR_BY_ID[cfg.headwear.style]?.coversNeck ? pose.tilt : 0;
  const headT = `<g transform="${rot(tilt, HEAD_PIVOT[0], HEAD_PIVOT[1] + 6)} translate(${HEAD_PIVOT[0]} ${HEAD_PIVOT[1]}) scale(${HEAD_SCALE}) translate(${-HEAD_PIVOT[0]} ${-HEAD_PIVOT[1]})">`;
  const add = (id: keyof typeof LAYER_ORDER, key: string, svg: string) => { if (cropY && (LAYER_Y[id][1] < cropY[0] || LAYER_Y[id][0] > cropY[1])) return; if (svg) L.push({ id, order: LAYER_ORDER[id], key, defs: '', svg: HEAD_LAYERS.has(id) ? `${headT}${svg}</g>` : svg }); };
  const armL = buildArm(pose.L), armR = buildArm(pose.R);

  // ---- soft contact shadow so the figure does not float
  const gd = ctx('gs').d;
  add('ground.shadow', 'gs', gd.glow(CX, SK.groundY + 2, 84, 11, '#2a2250', 0.34));

  // ---- hair
  const hairDef = HAIR_BY_ID[cfg.hair.style];
  if (!hairDef && cfg.hair.style !== 'none') warn(`missing hair "${cfg.hair.style}"`);
  const hairOut = !r.hideHair && hairDef ? hairDef.render(ctx('hair')) : { back: '', front: '' };
  add('hair.back', 'hair', hairOut.back);

  // ---- headwear (back part sits behind the body)
  const hw = HEADWEAR_BY_ID[cfg.headwear.style];
  if (!hw && cfg.headwear.style !== 'none') warn(`missing headwear "${cfg.headwear.style}"`);
  const hwOut = hw ? renderHeadwear(ctx('hw'), hw) : { back: '', front: '' };
  add('headwear.back', 'hw', hwOut.back);

  // ---- body
  add('legs', 'legs', renderLegsSkin(ctx('legs')));
  const shoe = SHOE_BY_ID[cfg.outfit.shoes];
  if (!shoe) warn(`missing shoes "${cfg.outfit.shoes}"`);
  add('shoes', 'shoes', shoe ? renderShoes(ctx('shoes'), shoe, cfg.outfit.shoesColor) : '');
  add('torso', 'torso', renderNeckTorsoSkin(ctx('torso')));

  // ---- clothing
  const dress = r.showDress ? DRESS_BY_ID[cfg.outfit.dress] : undefined;
  if (r.showDress && !dress) warn(`missing dress "${cfg.outfit.dress}"`);
  const bottom = !dress ? BOTTOM_BY_ID[cfg.outfit.bottom] : undefined;
  if (!dress && !bottom) warn(`missing bottom "${cfg.outfit.bottom}"`);
  const top = !dress ? TOP_BY_ID[cfg.outfit.top] : undefined;
  if (!dress && !top) warn(`missing top "${cfg.outfit.top}"`);
  const outer = cfg.outfit.outer !== 'none' ? TOP_BY_ID[cfg.outfit.outer] : undefined;
  if (cfg.outfit.outer !== 'none' && !outer) warn(`missing outerwear "${cfg.outfit.outer}"`);
  if (dress) add('dress', 'dress', renderDress(ctx('dress'), dress, cfg.outfit.dressColor));
  if (bottom) add('bottoms', 'bottoms', renderBottom(ctx('bottoms'), bottom, cfg.outfit.bottomColor));
  if (top) add('top', 'top', renderTopTorso(ctx('top'), top, cfg.outfit.topColor));
  if (outer) {
    // an outer layer is never narrower than what it covers
    const rank = { fitted: 0, loose: 1, boxy: 2, over: 3 } as const;
    const under = dress ?? top;
    const fit = under && rank[under.fit] > rank[outer.fit] ? (under.fit === 'over' ? 'over' : 'boxy') : outer.fit;
    add('outer', 'outer', renderTopTorso(ctx('outer'), fit === outer.fit ? outer : { ...outer, fit }, cfg.outfit.outerColor));
  }

  // ---- accessories (necklace, scarf, bag, glasses, earrings, hair accessories)
  const acc = renderAccessories(ctx('acc'), r);
  add('accessory.body', 'acc', acc.body);
  add('accessory.bag', 'acc', acc.bag);

  // ---- arms: sleeves follow the same skeleton as the arm skin
  const ac = ctx('arms');
  let armSvg = '';
  for (const [side, arm] of [[-1, armL], [1, armR]] as const) {
    armSvg += renderArmSkin(ac, arm);
    if (dress) armSvg += renderDressSleeve(ac, dress, cfg.outfit.dressColor, arm);
    else if (top) armSvg += renderSleeve(ac, top, cfg.outfit.topColor, arm);
    if (outer) armSvg += renderSleeve(ac, outer, cfg.outfit.outerColor, arm);
    armSvg += renderHand(ac, arm, side === 1);
  }
  add(pose.front ? 'arms.front' : 'arms.mid', 'arms', armSvg);

  // ---- head
  const fc = ctx('face');
  add('ears', 'face', renderEars(fc));
  add('face', 'face', renderFaceBase(fc));
  add('face.features', 'face', renderFaceFeatures(fc));
  add('hair.front', 'hair', hairOut.front);
  add('headwear.front', 'hw', hwOut.front);
  add('accessory.head', 'acc', acc.head);

  // ---- plug-in assets (authored fragments) for ids the built-in registries do not know
  const extSlots: [ExternalCategory, string, string, boolean][] = [
    ['hair', cfg.hair.style, cfg.hair.color, !r.hideHair], ['headwear', cfg.headwear.style, cfg.headwear.color, true],
    ['top', cfg.outfit.top, cfg.outfit.topColor, !dress], ['outer', cfg.outfit.outer, cfg.outfit.outerColor, true],
    ['bottom', cfg.outfit.bottom, cfg.outfit.bottomColor, !dress], ['dress', cfg.outfit.dress, cfg.outfit.dressColor, !!dress],
    ['shoes', cfg.outfit.shoes, cfg.outfit.shoesColor, true], ['glasses', cfg.accessories.glasses, cfg.accessories.glassesColor, true],
    ['earrings', cfg.accessories.earrings, cfg.accessories.metal, !r.hideEarrings], ['necklace', cfg.accessories.necklace, cfg.accessories.metal, !r.hideNecklace],
    ['scarf', cfg.accessories.scarf, cfg.accessories.scarfColor, !r.hideScarf], ['bag', cfg.accessories.bag, cfg.accessories.bagColor, true],
    ['hairAccessory', cfg.accessories.hairAccessory, cfg.accessories.hairAccessoryColor, !r.hideHairAcc],
  ];
  for (const [cat, id, color, visible] of extSlots) {
    const ext = visible && id !== 'none' ? getExternal(cat, id) : undefined;
    if (!ext) continue;
    for (const [layer, svg] of Object.entries(ext.layers)) add(layer as keyof typeof LAYER_ORDER, `x${cat}`, (svg as string).replace(/\{\{color\}\}/g, color));
  }
  for (const l of L) l.defs = ctx(l.key).d.toString();
  return L.sort((a, b) => a.order - b.order).map(({ key: _k, ...rest }) => rest);
}

const viewOf = (opts: RenderOptions) => {
  const vb = opts.viewBox ?? [0, 0, CANVAS.w, CANVAS.h];
  const w = opts.width ?? vb[2];
  return { vb, w, h: Math.round(((w * vb[3]) / vb[2]) * 100) / 100 };
};

export function renderAvatarSvg(cfg: AvatarConfig, opts: RenderOptions = {}): string {
  const uid = opts.uid ?? `hf${(uidCounter++).toString(36)}`;
  const cropY = opts.viewBox ? ([opts.viewBox[1], opts.viewBox[1] + opts.viewBox[3]] as [number, number]) : undefined;
  const layers = buildLayerGroups(cfg, uid, !!opts.fast, opts.onWarn ?? (() => {}), !!opts.portable, cropY);
  const { vb, w, h } = viewOf(opts);
  const title = opts.title ? `<title>${opts.title.replace(/[<>&]/g, '')}</title>` : '';
  const defs = [...new Set(layers.map((l) => l.defs))].join('');
  const body = layers.map((l) => (opts.portable ? `<g>${l.svg}</g>` : `<g data-layer="${l.id}">${l.svg}</g>`)).join('');
  const out = stripNoopFilters(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${w}" height="${h}"${opts.portable ? '' : ' role="img"'}>${opts.portable ? '' : title}${defs}<g transform="translate(0 ${TOP_PAD})">${body}</g></svg>`);
  return opts.portable ? dedupePaths(slimNumbers(out), uid) : out;
}

/** One standalone SVG per layer (same viewBox, ascending order): stack them as images and unchanged layers stay cached. */
export function renderAvatarLayers(cfg: AvatarConfig, opts: RenderOptions = {}): { id: string; order: number; svg: string }[] {
  const uid = opts.uid ?? 'hfl';
  const cropY = opts.viewBox ? ([opts.viewBox[1], opts.viewBox[1] + opts.viewBox[3]] as [number, number]) : undefined;
  const layers = buildLayerGroups(cfg, uid, !!opts.fast, opts.onWarn ?? (() => {}), !!opts.portable, cropY);
  const { vb, w, h } = viewOf(opts);
  return layers.map((l) => ({
    id: l.id, order: l.order,
    svg: (() => { const x = stripNoopFilters(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${w}" height="${h}">${l.defs}<g transform="translate(0 ${TOP_PAD})">${l.svg}</g></svg>`); return opts.portable ? dedupePaths(slimNumbers(x), `${uid}${l.id.replace(/\W/g, '')}`) : x; })(),
  }));
}
