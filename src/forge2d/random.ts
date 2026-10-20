// Seeded randomisation that only produces valid, coordinated looks.
import { rng } from './geom';
import { DEFAULT_CONFIG } from './defaults';
import type { AvatarConfig, ExpressionId, Fabric, FaceShapeId, PoseId } from './types';
import { buildManifest } from './manifest';
import { CLOTH_COLORS, DENIM_COLORS, EYE_COLORS, FRAME_COLORS, HAIR_COLORS, HIGHLIGHT_COLORS, LIP_COLORS, METAL_COLORS, SHADOW_COLORS, SHOE_COLORS, SKIN_TONES } from './palette';
import { checkRules } from './compat';
import { BOTTOM_BY_ID } from './bottoms';
import { DRESS_BY_ID } from './dresses';

export interface RandomOptions { modest?: boolean; keep?: Partial<Record<'skin' | 'expression' | 'pose', boolean>>; base?: AvatarConfig }

export function randomConfig(seed = Math.floor(Math.random() * 2 ** 31), opt: RandomOptions = {}): AvatarConfig {
  const r = rng(seed);
  const ids = (cat: string) => buildManifest().filter((e) => e.category === cat).map((e) => e.optionId);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const chance = (p: number) => r() < p;
  const base = JSON.parse(JSON.stringify(opt.base ?? DEFAULT_CONFIG)) as AvatarConfig;

  for (let attempt = 0; attempt < 40; attempt++) {
    const c = JSON.parse(JSON.stringify(base)) as AvatarConfig;
    if (!opt.keep?.skin) c.face.skin = pick(SKIN_TONES).id;
    c.face.shape = pick(ids('faceShape')) as FaceShapeId;
    c.face.eyes = pick(ids('eyes')); c.face.brows = pick(ids('brows')); c.face.nose = pick(ids('nose')); c.face.mouth = pick(ids('mouth'));
    c.face.eyeColor = pick(EYE_COLORS).hex; c.face.lipColor = pick(LIP_COLORS).hex;
    c.face.cheeks = pick([0, 1, 1, 2, 3]) as 0 | 1 | 2 | 3; c.face.freckles = pick([0, 0, 0, 1, 2]) as 0 | 1 | 2; c.face.mole = pick(['none', 'none', 'none', 'cheek', 'lip', 'chin']);
    c.face.eyeshadow = chance(0.3) ? pick(SHADOW_COLORS.slice(1)).hex : '#00000000';
    if (!opt.keep?.expression) c.expression = pick(['happy', 'neutral', 'excited', 'thoughtful', 'confident', 'sad', 'surprised', 'happy', 'neutral'] as ExpressionId[]);
    if (!opt.keep?.pose) c.pose = pick(['relaxed', 'relaxed', 'relaxed', 'crossed', 'shy', 'shrug', 'wave', 'hip'] as PoseId[]);
    const naturalHair = HAIR_COLORS.slice(0, 11), allHair = HAIR_COLORS;
    c.hair.style = pick(ids('hair')); c.hair.color = pick(chance(0.85) ? naturalHair : allHair).hex;
    c.hair.highlight = chance(0.25) ? pick(HIGHLIGHT_COLORS).hex : null; c.hair.highlightStyle = pick(['streaks', 'balayage', 'tips']);

    // head covering
    const hwIds = ids('headwear');
    const modest = !!opt.modest;
    c.headwear.style = modest || chance(0.28) ? pick(modest ? hwIds.filter((i) => i.startsWith('hijab')) : hwIds) : 'none';
    c.headwear.color = pick(CLOTH_COLORS).hex; c.headwear.fabric = pick(['matte', 'satin', 'chiffon', 'jersey'] as Fabric[]); c.headwear.undercap = chance(0.3);

    // outfit: coordinated palette
    const scheme = [pick(CLOTH_COLORS).hex, pick(CLOTH_COLORS).hex, pick(CLOTH_COLORS.slice(0, 6)).hex];
    const dress = modest ? chance(0.7) : chance(0.3);
    c.outfit.dress = dress ? pick(modest ? ids('dress').filter((i) => DRESS_BY_ID[i]?.tags?.includes('modest')) : ids('dress')) : 'none';
    c.outfit.dressColor = scheme[0];
    c.outfit.top = pick(ids('top')); c.outfit.topColor = scheme[1];
    c.outfit.bottom = pick(modest ? ids('bottom').filter((i) => !['mini-skirt', 'denim-shorts', 'bike-shorts', 'denim-skirt'].includes(i)) : ids('bottom'));
    c.outfit.bottomColor = BOTTOM_BY_ID[c.outfit.bottom]?.denim ? pick(DENIM_COLORS).hex : scheme[2];
    c.outfit.outer = chance(0.45) ? pick(ids('outer')) : 'none'; c.outfit.outerColor = pick([scheme[0], scheme[2], pick(CLOTH_COLORS).hex]);
    c.outfit.shoes = pick(ids('shoes')); c.outfit.shoesColor = pick(SHOE_COLORS).hex;
    if (!modest && c.outfit.dress === 'none' && chance(0.7)) { const L = pick(LOOKS); Object.assign(c.outfit, { top: L.top, topColor: L.topColor, bottom: L.bottom, bottomColor: L.bottomColor, outer: L.outer, outerColor: L.outerColor, shoes: L.shoes, shoesColor: L.shoesColor }); }

    // accessories
    const opt2 = (cat: string, p: number) => (chance(p) ? pick(ids(cat)) : 'none');
    c.accessories.glasses = opt2('glasses', 0.25); c.accessories.glassesColor = pick(FRAME_COLORS).hex;
    c.accessories.earrings = opt2('earrings', 0.5); c.accessories.metal = pick(METAL_COLORS).hex;
    c.accessories.necklace = opt2('necklace', 0.3); c.accessories.bag = opt2('bag', 0.25); c.accessories.bagColor = pick(CLOTH_COLORS).hex;
    c.accessories.scarf = opt2('scarf', 0.12); c.accessories.scarfColor = pick(CLOTH_COLORS).hex;
    c.accessories.hairAccessory = opt2('hairAccessory', 0.2); c.accessories.hairAccessoryColor = pick(CLOTH_COLORS).hex;
    if (!checkRules(c).some((i) => i.kind === 'error')) return c;
  }
  return base;
}

/** Curated, coordinated outfits (not a recoloured tee + jeans): used by randomise so looks are visibly different. */
export const LOOKS: { name: string; top: string; topColor: string; bottom: string; bottomColor: string; outer: string; outerColor: string; shoes: string; shoesColor: string }[] = [
  { name: 'Cozy puffer',   top: 'long-sleeve', topColor: '#2a2b30', bottom: 'wide-jeans',  bottomColor: '#9a9da3', outer: 'puffer-crop', outerColor: '#e6dcc8', shoes: 'fluffy-boots', shoesColor: '#7a5236' },
  { name: 'Zip & grey',    top: 'tee',         topColor: '#f3f0ea', bottom: 'wide-jeans',  bottomColor: '#4a4d55', outer: 'zip-hoodie',  outerColor: '#f1efe8', shoes: 'chunky-sneakers', shoesColor: '#f1efea' },
  { name: 'Crop & denim',  top: 'crop-long',   topColor: '#202126', bottom: 'straight-jeans', bottomColor: '#7396c0', outer: 'none', outerColor: '#e6dcc8', shoes: 'sneakers', shoesColor: '#26272b' },
  { name: 'Burgundy knit', top: 'sweater',     topColor: '#762235', bottom: 'wide-jeans',  bottomColor: '#36507a', outer: 'none', outerColor: '#e6dcc8', shoes: 'fluffy-boots', shoesColor: '#7a5236' },
  { name: 'Hoodie green',  top: 'hoodie',      topColor: '#2f5b4a', bottom: 'joggers',     bottomColor: '#3d4048', outer: 'none', outerColor: '#e6dcc8', shoes: 'chunky-sneakers', shoesColor: '#f1efea' },
  { name: 'Vest layers',   top: 'long-sleeve', topColor: '#243255', bottom: 'bike-shorts', bottomColor: '#202126', outer: 'puffer-vest', outerColor: '#26272b', shoes: 'fluffy-boots', shoesColor: '#7a5236' },
  { name: 'Smart blazer',  top: 'shirt',       topColor: '#f3f0ea', bottom: 'trousers',    bottomColor: '#3d4048', outer: 'blazer', outerColor: '#6f7440', shoes: 'loafers', shoesColor: '#5a3a2a' },
  { name: 'Knot & flare',  top: 'knot-shirt',  topColor: '#9cc4ea', bottom: 'flare-jeans', bottomColor: '#4a4d55', outer: 'none', outerColor: '#e6dcc8', shoes: 'chelsea-boots', shoesColor: '#5a3a2a' },
  { name: 'Cardi & skirt', top: 'cami',        topColor: '#f0c4c8', bottom: 'pleated-skirt', bottomColor: '#3d4048', outer: 'cardigan', outerColor: '#e8dcc4', shoes: 'flats', shoesColor: '#202126' },
  { name: 'Denim on denim',top: 'tank',        topColor: '#f3f0ea', bottom: 'denim-skirt', bottomColor: '#36507a', outer: 'denim-jacket', outerColor: '#7396c0', shoes: 'knee-boots', shoesColor: '#5a3a2a' },
  { name: 'Bomber & joggers', top: 'turtleneck', topColor: '#e8dcc4', bottom: 'joggers',  bottomColor: '#8c9097', outer: 'bomber', outerColor: '#2f5b4a', shoes: 'sneakers', shoesColor: '#f1efea' },
  { name: 'Coat & knit',   top: 'cable-knit',  topColor: '#e8dcc4', bottom: 'skinny-jeans', bottomColor: '#202126', outer: 'long-coat', outerColor: '#b98c5c', shoes: 'chelsea-boots', shoesColor: '#26272b' },
  { name: 'Square crop',   top: 'square-crop', topColor: '#202126', bottom: 'wide-jeans',  bottomColor: '#9a9da3', outer: 'none', outerColor: '#e6dcc8', shoes: 'chunky-sneakers', shoesColor: '#f1efea' },
  { name: 'Tee & culottes',top: 'breton',      topColor: '#f3f0ea', bottom: 'culottes',    bottomColor: '#b98c5c', outer: 'none', outerColor: '#e6dcc8', shoes: 'loafers', shoesColor: '#202126' },
];
