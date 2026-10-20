// Configuration validation and normalisation (defaults + graceful fallback for missing assets).
import { SCHEMA, SCHEMA_VERSION, STYLE_VERSION, AvatarConfig } from './types';
import { DEFAULT_CONFIG } from './defaults';
import { buildManifest, Category } from './manifest';
import { checkRules } from './compat';
import { isHex } from './geom';

export interface ValidationIssue { path: string; code: 'schema' | 'version' | 'type' | 'enum' | 'color' | 'missing-asset' | 'rule'; severity: 'error' | 'warning' | 'info'; message: string }

type Spec =
  | { path: string; kind: 'asset'; category: Category; none?: boolean }
  | { path: string; kind: 'hex' }
  | { path: string; kind: 'hexAlpha' }
  | { path: string; kind: 'hexOrNull' }
  | { path: string; kind: 'enum'; values: readonly (string | number)[] }
  | { path: string; kind: 'bool' };

const SPECS: Spec[] = [
  { path: 'face.shape', kind: 'asset', category: 'faceShape' }, { path: 'face.skin', kind: 'asset', category: 'skin' },
  { path: 'face.eyes', kind: 'asset', category: 'eyes' }, { path: 'face.brows', kind: 'asset', category: 'brows' },
  { path: 'face.nose', kind: 'asset', category: 'nose' }, { path: 'face.mouth', kind: 'asset', category: 'mouth' },
  { path: 'face.eyeColor', kind: 'hex' }, { path: 'face.lipColor', kind: 'hex' }, { path: 'face.eyeshadow', kind: 'hexAlpha' },
  { path: 'face.cheeks', kind: 'enum', values: [0, 1, 2, 3] }, { path: 'face.freckles', kind: 'enum', values: [0, 1, 2] },
  { path: 'face.mole', kind: 'enum', values: ['none', 'cheek', 'lip', 'chin'] }, { path: 'face.lashes', kind: 'bool' },
  { path: 'hair.style', kind: 'asset', category: 'hair', none: true }, { path: 'hair.color', kind: 'hex' },
  { path: 'hair.highlight', kind: 'hexOrNull' }, { path: 'hair.highlightStyle', kind: 'enum', values: ['streaks', 'balayage', 'tips'] },
  { path: 'headwear.style', kind: 'asset', category: 'headwear', none: true }, { path: 'headwear.color', kind: 'hex' },
  { path: 'headwear.fabric', kind: 'enum', values: ['matte', 'satin', 'chiffon', 'jersey'] }, { path: 'headwear.undercap', kind: 'bool' },
  { path: 'outfit.top', kind: 'asset', category: 'top' }, { path: 'outfit.topColor', kind: 'hex' },
  { path: 'outfit.bottom', kind: 'asset', category: 'bottom' }, { path: 'outfit.bottomColor', kind: 'hex' },
  { path: 'outfit.dress', kind: 'asset', category: 'dress', none: true }, { path: 'outfit.dressColor', kind: 'hex' },
  { path: 'outfit.outer', kind: 'asset', category: 'outer', none: true }, { path: 'outfit.outerColor', kind: 'hex' },
  { path: 'outfit.shoes', kind: 'asset', category: 'shoes' }, { path: 'outfit.shoesColor', kind: 'hex' },
  { path: 'accessories.glasses', kind: 'asset', category: 'glasses', none: true }, { path: 'accessories.glassesColor', kind: 'hex' },
  { path: 'accessories.earrings', kind: 'asset', category: 'earrings', none: true }, { path: 'accessories.metal', kind: 'hex' },
  { path: 'accessories.necklace', kind: 'asset', category: 'necklace', none: true },
  { path: 'accessories.bag', kind: 'asset', category: 'bag', none: true }, { path: 'accessories.bagColor', kind: 'hex' },
  { path: 'accessories.scarf', kind: 'asset', category: 'scarf', none: true }, { path: 'accessories.scarfColor', kind: 'hex' },
  { path: 'accessories.hairAccessory', kind: 'asset', category: 'hairAccessory', none: true }, { path: 'accessories.hairAccessoryColor', kind: 'hex' },
  { path: 'expression', kind: 'asset', category: 'expression' }, { path: 'pose', kind: 'asset', category: 'pose' },
];

let idCache: Record<string, Set<string>> | null = null;
let idCacheKey = -1;
export function knownIds(): Record<string, Set<string>> {
  const m = buildManifest();
  if (idCache && idCacheKey === m.length) return idCache;
  const out: Record<string, Set<string>> = {};
  for (const e of m) (out[e.category] ??= new Set()).add(e.optionId);
  idCache = out; idCacheKey = m.length;
  return out;
}

const get = (o: any, path: string) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const set = (o: any, path: string, v: unknown) => {
  const p = path.split('.');
  let t = o;
  for (let i = 0; i < p.length - 1; i++) t = t[p[i]] ??= {};
  t[p[p.length - 1]] = v;
};
const deep = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Fills missing fields from the default, replaces invalid values with the default and reports each fix. */
export function normalizeConfig(input: unknown): { config: AvatarConfig; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const cfg = deep(DEFAULT_CONFIG) as any;
  if (!input || typeof input !== 'object') {
    issues.push({ path: '', code: 'schema', severity: 'error', message: 'Configuration must be an object; using the default avatar.' });
    return { config: cfg, issues };
  }
  const src = input as any;
  if (src.schema !== SCHEMA) issues.push({ path: 'schema', code: 'schema', severity: 'warning', message: `Expected schema "${SCHEMA}".` });
  if (typeof src.version !== 'number' || src.version > SCHEMA_VERSION) issues.push({ path: 'version', code: 'version', severity: 'warning', message: `Unsupported config version ${String(src.version)}; reading it as version ${SCHEMA_VERSION}.` });
  const ids = knownIds();
  for (const sp of SPECS) {
    const v = get(src, sp.path);
    const def = get(DEFAULT_CONFIG, sp.path);
    if (v === undefined) { set(cfg, sp.path, def); continue; }
    let ok = true, code: ValidationIssue['code'] = 'type', msg = '';
    switch (sp.kind) {
      case 'asset':
        ok = typeof v === 'string' && ((sp.none && v === 'none') || ids[sp.category]?.has(v));
        code = 'missing-asset'; msg = `Unknown ${sp.category} "${String(v)}"`;
        break;
      case 'hex': ok = isHex(v); code = 'color'; msg = `Invalid colour "${String(v)}"`; break;
      case 'hexAlpha': ok = typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v); code = 'color'; msg = `Invalid colour "${String(v)}"`; break;
      case 'hexOrNull': ok = v === null || isHex(v); code = 'color'; msg = `Invalid colour "${String(v)}"`; break;
      case 'enum': ok = sp.values.includes(v as never); code = 'enum'; msg = `"${String(v)}" is not one of ${sp.values.join(', ')}`; break;
      case 'bool': ok = typeof v === 'boolean'; msg = 'Expected true or false'; break;
    }
    if (ok) set(cfg, sp.path, v);
    else { set(cfg, sp.path, def); issues.push({ path: sp.path, code, severity: code === 'missing-asset' ? 'warning' : 'error', message: `${msg}; using "${String(def)}".` }); }
  }
  cfg.schema = SCHEMA; cfg.version = SCHEMA_VERSION; cfg.style = typeof src.style === 'string' ? src.style : STYLE_VERSION;
  for (const i of checkRules(cfg)) issues.push({ path: i.paths[0], code: 'rule', severity: i.kind === 'error' ? 'warning' : 'info', message: i.message });
  return { config: cfg as AvatarConfig, issues };
}

/** Strict check: ok only when nothing had to be repaired and no rule is violated. */
export function validateConfig(input: unknown): { ok: boolean; issues: ValidationIssue[]; config: AvatarConfig } {
  const { config, issues } = normalizeConfig(input);
  return { ok: !issues.some((i) => i.severity === 'error' || i.severity === 'warning'), issues, config };
}
