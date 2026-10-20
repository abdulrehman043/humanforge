// Combination statistics computed from the real manifest and compatibility rules.
// theoretical      = every option independent
// permitted        = combinations that violate no error rule
// visuallyDistinct = permitted combinations that still differ after hidden elements are collapsed
import { buildManifest, Category } from './manifest';
import { DEFAULT_CONFIG } from './defaults';
import { checkRules } from './compat';
import { CLOTH_COLORS, DENIM_COLORS, EYE_COLORS, FRAME_COLORS, HAIR_COLORS, HIGHLIGHT_COLORS, LIP_COLORS, METAL_COLORS, SHADOW_COLORS, SHOE_COLORS } from './palette';
import type { AvatarConfig } from './types';

const OPTIONAL: Category[] = ['hair', 'headwear', 'outer', 'dress', 'glasses', 'earrings', 'necklace', 'scarf', 'bag', 'hairAccessory'];

export interface ComboStats {
  options: Record<string, number>;
  theoretical: bigint; permitted: bigint; visuallyDistinct: bigint;
  /** the same three with every colour choice multiplied in */
  withColours: { theoretical: bigint; permitted: bigint; visuallyDistinct: bigint };
  tested: number; approved: number;
}

export function computeStats(review?: { configsTested?: number; approvedConfigs?: number }): ComboStats {
  const m = buildManifest();
  const ids = (c: Category) => m.filter((e) => e.category === c).map((e) => e.optionId);
  const n = (c: Category) => ids(c).length + (OPTIONAL.includes(c) ? 1 : 0);
  const options: Record<string, number> = {};
  (['faceShape', 'skin', 'eyes', 'brows', 'nose', 'mouth', 'hair', 'headwear', 'top', 'outer', 'bottom', 'dress', 'shoes', 'glasses', 'earrings', 'necklace', 'scarf', 'bag', 'hairAccessory', 'expression', 'pose'] as Category[]).forEach((c) => (options[c] = n(c)));

  const theoretical = Object.values(options).reduce((a, v) => a * BigInt(v), 1n);

  const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AvatarConfig;
  const withNone = (c: Category) => (OPTIONAL.includes(c) ? ['none', ...ids(c)] : ids(c));
  const hairs = withNone('hair'), heads = withNone('headwear'), haccs = withNone('hairAccessory'), ears = withNone('earrings');
  const noErr = () => !checkRules(cfg).some((i) => i.kind === 'error');
  // head group: only hair / headwear / hair accessory can raise errors
  let validHead = 0;
  for (const h of heads) for (const x of hairs) for (const a of haccs) { cfg.headwear.style = h; cfg.hair.style = x; cfg.accessories.hairAccessory = a; if (noErr()) validHead++; }
  const headRaw = BigInt(heads.length * hairs.length * haccs.length);
  const permitted = theoretical / headRaw * BigInt(validHead);

  // visually distinct: head group (h, hair, hairAcc, earrings) and neck group (garment, outer, scarf, necklace) per headwear
  const tops = ids('top'), dresses = withNone('dress').filter((d) => d !== 'none'), outers = withNone('outer'), scarves = withNone('scarf'), necks = withNone('necklace');
  const bottoms = ids('bottom').length;
  cfg.headwear.style = 'none'; cfg.hair.style = 'none'; cfg.accessories.hairAccessory = 'none'; cfg.accessories.earrings = 'none';
  let distinctPerHeadwear = 0n;
  for (const h of heads) {
    cfg.headwear.style = h;
    const headKeys = new Set<string>();
    for (const x of hairs) for (const a of haccs) for (const e of ears) {
      cfg.hair.style = x; cfg.accessories.hairAccessory = a; cfg.accessories.earrings = e;
      const iss = checkRules(cfg);
      if (iss.some((i) => i.kind === 'error')) continue;
      const has = (r: string) => iss.some((i) => i.rule === r);
      headKeys.add(`${has('covering-hides-hair') ? '-' : x}|${has('covering-hides-hairacc') ? '-' : a}|${has('covering-hides-ears') ? '-' : e}`);
    }
    cfg.hair.style = 'none'; cfg.accessories.hairAccessory = 'none'; cfg.accessories.earrings = 'none';
    const neckKeys = new Set<string>();
    const run = (mode: 'top' | 'dress', g: string) => {
      cfg.outfit.dress = mode === 'dress' ? g : 'none'; if (mode === 'top') cfg.outfit.top = g;
      for (const o of outers) for (const s of scarves) for (const nk of necks) {
        cfg.outfit.outer = o; cfg.accessories.scarf = s; cfg.accessories.necklace = nk;
        const iss = checkRules(cfg);
        const has = (r: string) => iss.some((i) => i.rule === r);
        const hideN = has('hijab-hides-necklace') || has('highneck-hides-necklace') || has('scarf-hides-necklace');
        neckKeys.add(`${mode}:${g}|${o}|${has('hijab-hides-scarf') ? '-' : s}|${hideN ? '-' : nk}`);
      }
    };
    tops.forEach((t) => run('top', t)); dresses.forEach((d) => run('dress', d));
    let neckCount = 0n;
    for (const k of neckKeys) neckCount += k.startsWith('top:') ? BigInt(bottoms) : 1n;
    distinctPerHeadwear += BigInt(headKeys.size) * neckCount;
  }
  cfg.headwear.style = 'none'; cfg.outfit.dress = 'none'; cfg.outfit.outer = 'none';
  const independent = (['faceShape', 'skin', 'eyes', 'brows', 'nose', 'mouth', 'shoes', 'glasses', 'bag', 'expression', 'pose'] as Category[]).reduce((a, c) => a * BigInt(options[c]), 1n);
  const visuallyDistinct = independent * distinctPerHeadwear;

  // colour multipliers (hair colour x highlight, eyes, lips, shadow, per-garment colours, fabrics, ...)
  const hairColours = BigInt(HAIR_COLORS.length) * BigInt(1 + HIGHLIGHT_COLORS.length * 3);
  const colourMult = hairColours * BigInt(EYE_COLORS.length) * BigInt(LIP_COLORS.length) * BigInt(SHADOW_COLORS.length) * 4n * 3n * 4n /* cheeks, freckles, moles */
    * BigInt(CLOTH_COLORS.length) ** 3n * BigInt(SHOE_COLORS.length) * BigInt(CLOTH_COLORS.length * 4) * BigInt(FRAME_COLORS.length) * BigInt(METAL_COLORS.length);
  void DENIM_COLORS;
  return {
    options, theoretical, permitted, visuallyDistinct,
    withColours: { theoretical: theoretical * colourMult, permitted: permitted * colourMult, visuallyDistinct: visuallyDistinct * colourMult },
    tested: review?.configsTested ?? 0, approved: review?.approvedConfigs ?? 0,
  };
}

export const formatBig = (v: bigint) => {
  const s = v.toString();
  if (s.length <= 9) return Number(v).toLocaleString('en-US');
  return `${s[0]}.${s.slice(1, 3)}e${s.length - 1}`;
};
