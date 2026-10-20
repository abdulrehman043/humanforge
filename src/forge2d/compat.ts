// Compatibility rules. Two severities:
//   error  - the combination would look wrong; the editor disables it, random never produces it and the
//            renderer repairs it (drops the lesser item).
//   hidden - the combination is allowed, but one element is covered, so it is simply not drawn.
import type { AvatarConfig } from './types';
import { HEADWEAR_BY_ID } from './headwear';
import { HAIR_BY_ID } from './hairs';
import { TOP_BY_ID } from './tops';
import { DRESS_BY_ID } from './dresses';

export interface Resolved {
  cfg: AvatarConfig;
  hideHair: boolean; showDress: boolean; hideEarrings: boolean; hideNecklace: boolean; hideScarf: boolean; hideHairAcc: boolean;
  /** human-readable notes for the UI ("Hair is covered by the hijab") */
  notes: string[];
  repairs: string[];
}

export type RuleKind = 'error' | 'hidden';
export interface Issue { rule: string; kind: RuleKind; message: string; paths: string[] }

const hairTags = (c: AvatarConfig) => HAIR_BY_ID[c.hair.style]?.tags ?? [];
const garmentTags = (c: AvatarConfig): string[] => {
  const dress = c.outfit.dress !== 'none' ? DRESS_BY_ID[c.outfit.dress] : undefined;
  const top = dress ?? TOP_BY_ID[c.outfit.top];
  const outer = c.outfit.outer !== 'none' ? TOP_BY_ID[c.outfit.outer] : undefined;
  return [...(top?.tags ?? []), ...(outer?.tags ?? [])];
};

interface Rule { id: string; kind: RuleKind; paths: string[]; message: string; test: (c: AvatarConfig) => boolean; repair?: (c: AvatarConfig) => void }

const hw = (c: AvatarConfig) => HEADWEAR_BY_ID[c.headwear.style];

export const RULES: Rule[] = [
  {
    id: 'hat-vs-updo', kind: 'error', paths: ['headwear.style', 'hair.style'],
    message: 'Hats do not fit over updos, buns or wide hairstyles.',
    test: (c) => { const h = hw(c); return !!h?.excludesHair && hairTags(c).some((t) => h.excludesHair!.includes(t)); },
    repair: (c) => { c.headwear.style = 'none'; },
  },
  {
    id: 'headband-vs-hat', kind: 'error', paths: ['headwear.style', 'accessories.hairAccessory'],
    message: 'A headband cannot be worn under a hat.',
    test: (c) => hw(c)?.coverage === 'partial' && c.accessories.hairAccessory === 'headband',
    repair: (c) => { c.accessories.hairAccessory = 'none'; },
  },
  { id: 'covering-hides-hair', kind: 'hidden', paths: ['headwear.style', 'hair.style'], message: 'Hair is covered by the head covering.', test: (c) => hw(c)?.coverage === 'full' && c.hair.style !== 'none' },
  { id: 'covering-hides-hairacc', kind: 'hidden', paths: ['headwear.style', 'accessories.hairAccessory'], message: 'Hair accessories are covered by the head covering.', test: (c) => hw(c)?.coverage === 'full' && c.accessories.hairAccessory !== 'none' },
  { id: 'covering-hides-ears', kind: 'hidden', paths: ['headwear.style', 'accessories.earrings'], message: 'Earrings are covered by the head covering.', test: (c) => !!hw(c)?.hidesEars && c.accessories.earrings !== 'none' },
  { id: 'hijab-hides-scarf', kind: 'hidden', paths: ['headwear.style', 'accessories.scarf'], message: 'The scarf is covered by the hijab drape.', test: (c) => !!hw(c)?.coversNeck && c.accessories.scarf !== 'none' },
  { id: 'hijab-hides-necklace', kind: 'hidden', paths: ['headwear.style', 'accessories.necklace'], message: 'The necklace is covered by the hijab drape.', test: (c) => !!hw(c)?.coversNeck && c.accessories.necklace !== 'none' },
  { id: 'highneck-hides-necklace', kind: 'hidden', paths: ['outfit.top', 'outfit.dress', 'outfit.outer', 'accessories.necklace'], message: 'The necklace is covered by the high neckline.', test: (c) => garmentTags(c).includes('high-neck') && c.accessories.necklace !== 'none' },
  { id: 'scarf-hides-necklace', kind: 'hidden', paths: ['accessories.scarf', 'accessories.necklace'], message: 'The necklace is covered by the scarf.', test: (c) => c.accessories.scarf !== 'none' && c.accessories.necklace !== 'none' },
  { id: 'dress-replaces-outfit', kind: 'hidden', paths: ['outfit.dress', 'outfit.top', 'outfit.bottom'], message: 'The dress replaces the top and bottom.', test: (c) => c.outfit.dress !== 'none' },
];

export function checkRules(cfg: AvatarConfig): Issue[] {
  return RULES.filter((r) => r.test(cfg)).map((r) => ({ rule: r.id, kind: r.kind, message: r.message, paths: r.paths }));
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Repairs error rules (drops the lesser element) and computes what is visible. */
export function resolveConfig(input: AvatarConfig): Resolved {
  const cfg = clone(input);
  const repairs: string[] = [];
  for (let pass = 0; pass < 4; pass++) {
    const bad = RULES.find((r) => r.kind === 'error' && r.test(cfg));
    if (!bad) break;
    bad.repair?.(cfg);
    repairs.push(bad.id);
  }
  const h = hw(cfg);
  const issues = checkRules(cfg);
  const has = (id: string) => issues.some((i) => i.rule === id);
  return {
    cfg,
    hideHair: has('covering-hides-hair'),
    showDress: cfg.outfit.dress !== 'none',
    hideEarrings: has('covering-hides-ears'),
    hideNecklace: has('hijab-hides-necklace') || has('highneck-hides-necklace') || has('scarf-hides-necklace'),
    hideScarf: has('hijab-hides-scarf'),
    hideHairAcc: has('covering-hides-hairacc'),
    notes: issues.filter((i) => i.kind === 'hidden' && i.rule !== 'dress-replaces-outfit').map((i) => i.message),
    repairs,
  };
}

// ---- helpers used by the editor (disable options) and the statistics module
/** Errors that would arise if `path` were set to `value`. */
export function errorsIfSet(cfg: AvatarConfig, path: string, value: string): Issue[] {
  const c = clone(cfg) as any;
  const parts = path.split('.');
  let o = c;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
  return checkRules(c).filter((i) => i.kind === 'error' && i.paths.includes(path));
}


