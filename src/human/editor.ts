// Platform-neutral avatar editor model. It turns the asset manifest plus developer options
// (gender lock, which sections/attributes/items are editable) into a list of sections and
// controls that the web and React Native <HumanEditor> components render.
//
//   const editor = createHumanEditor(pkg.manifest, { gender: 'female', exclude: ['ears', 'body.muscle'] });
//   editor.sections   -> [{ id: 'face', label: 'Face', controls: [...] }, ...]
//   editor.initial    -> a valid HumanConfig that respects the options
//   editor.normalize(savedConfig) -> clamps/repairs any config to the options (use on load)
import { DEFAULT_HUMAN, HumanConfig, HumanManifest } from './runtime';
import { DETAIL_SLIDERS, MACRO_SLIDERS } from './sliders';
import { EYE_LABELS, EYE_SWATCH, GARMENT_COLORS, HUMAN_HAIR_COLORS, SKIN_TINTS, clothingInfo, fits, hairInfo, skinInfo } from './catalog';

export type EditorGender = 'female' | 'male' | 'any';
export type SectionId = 'body' | 'face' | 'skin' | 'eyes' | 'brows' | 'nose' | 'mouth' | 'ears' | 'hair' | 'headwear' | 'outfit' | 'shoes' | 'hat';
export type ItemSlot = 'hair' | 'headwear' | 'outfit' | 'shoes' | 'hat' | 'skin' | 'eyes' | 'eyebrows' | 'eyelashes';

export const ALL_SECTIONS: SectionId[] = ['face', 'skin', 'eyes', 'brows', 'nose', 'mouth', 'ears', 'hair', 'headwear', 'body', 'outfit', 'shoes', 'hat'];

export interface HumanEditorOptions {
  /** Lock the avatar to one gender: hides the gender slider and filters hair, clothes and skins. Default 'any'. */
  gender?: EditorGender;
  /** Sections to show, in order. Default ALL_SECTIONS. */
  sections?: SectionId[];
  /** Section ids or control ids to hide, e.g. ['ears', 'body.muscle', 'nose.noseHump', 'hair.color']. */
  exclude?: string[];
  /** If set, only these control ids are shown (sections without any are dropped). */
  include?: string[];
  /** Allowed item ids per slot (default: everything that fits the gender). */
  items?: Partial<Record<ItemSlot, string[]>>;
  /** Color palettes. */
  colors?: { hair?: string[]; eyebrows?: string[]; skinTint?: string[]; garments?: string[] };
  /** Slots that may be empty ("None" option). Default: hat, headwear and eyebrows. */
  optional?: Partial<Record<'hair' | 'hat' | 'headwear' | 'eyebrows' | 'shoes', boolean>>;
  /** Max magnitude of face/body detail sliders (0..1). Lower keeps faces more natural. Default 1. */
  detailRange?: number;
  /** Starting values (merged over the gender's default look). */
  defaults?: Partial<HumanConfig>;
  /** Values always enforced, whatever the user or a saved config says. */
  locked?: Partial<HumanConfig>;
  /** Label overrides by section or control id (e.g. for translation). */
  labels?: Record<string, string>;
}

interface Base { id: string; label: string }
export interface SliderControl extends Base { kind: 'slider'; min: number; max: number; step: number; value(c: HumanConfig): number; apply(c: HumanConfig, v: number): HumanConfig }
export interface ChoiceOption { id: string | null; label: string; swatch?: string }
export interface ChoiceControl extends Base { kind: 'choice'; options: ChoiceOption[]; value(c: HumanConfig): string | null; apply(c: HumanConfig, v: string | null): HumanConfig }
export interface ColorControl extends Base { kind: 'color'; colors: string[]; value(c: HumanConfig): string; apply(c: HumanConfig, v: string): HumanConfig }
export type EditorControl = SliderControl | ChoiceControl | ColorControl;
export interface EditorSection { id: SectionId; label: string; framing: 'face' | 'body'; controls: EditorControl[] }

export interface HumanEditorModel {
  options: HumanEditorOptions;
  sections: EditorSection[];
  /** Starting config that satisfies the options. */
  initial: HumanConfig;
  /** Repair any (saved or partial) config so it satisfies the options. */
  normalize(c?: Partial<HumanConfig> | null): HumanConfig;
  /** A random look within the allowed items and natural slider ranges. */
  randomize(rand?: () => number): HumanConfig;
  /** Allowed item ids per slot after gender filtering. */
  allowed: Record<ItemSlot, string[]>;
}

const SECTION_LABELS: Record<SectionId, string> = {
  body: 'Body', face: 'Face', skin: 'Skin', eyes: 'Eyes', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', ears: 'Ears',
  hair: 'Hair', headwear: 'Headwear', outfit: 'Outfit', shoes: 'Shoes', hat: 'Hat',
};
const FACE_SECTIONS: SectionId[] = ['face', 'skin', 'eyes', 'brows', 'nose', 'mouth', 'ears', 'hair', 'headwear', 'hat'];
type WearSlot = 'outfit' | 'shoes' | 'hat' | 'headwear';
/** Slots that can't be worn together: choosing one takes off the other. */
const CONFLICTS: Partial<Record<WearSlot, WearSlot>> = { hat: 'headwear', headwear: 'hat' };
const BROW_SLIDERS = ['browHeight', 'browAngle', 'browDepth'];

const GENDER_DEFAULTS: Record<'female' | 'male', Partial<HumanConfig>> = {
  female: {
    gender: 0, skin: 'young_caucasian_female', hair: 'long01', hairColor: '#6b4428', eyebrows: 'eyebrow002', eyebrowColor: '#3d2618',
    eyelashes: 'eyelashes02', clothes: ['female_casualsuit02', 'shoes02'],
  },
  male: {
    gender: 1, skin: 'young_caucasian_male', hair: 'short02', hairColor: '#3d2618', eyebrows: 'eyebrow001', eyebrowColor: '#2a1c14',
    eyelashes: 'eyelashes01', clothes: ['male_casualsuit02', 'shoes01'],
  },
};

const withDetail = (c: HumanConfig, id: string, v: number): HumanConfig => ({ ...c, detail: { ...c.detail, [id]: v } });

export function createHumanEditor(manifest: HumanManifest, options: HumanEditorOptions = {}): HumanEditorModel {
  const gender = options.gender ?? 'any';
  const exclude = new Set(options.exclude ?? []);
  const include = options.include ? new Set(options.include) : null;
  const range = Math.min(1, Math.max(0, options.detailRange ?? 1));
  const label = (id: string, fallback: string) => options.labels?.[id] ?? fallback;
  const optional = { hat: true, headwear: true, eyebrows: true, hair: false, shoes: false, ...options.optional };

  // ---- allowed items
  const restrict = (slot: ItemSlot, ids: string[]) => {
    const only = options.items?.[slot];
    return only ? ids.filter((id) => only.includes(id)) : ids;
  };
  const clothes = manifest.proxies.filter((p) => p.kind === 'clothes').map((p) => p.id);
  const bySlot = (slot: WearSlot) => clothes.filter((id) => clothingInfo(id).slot === slot && fits(clothingInfo(id).fit, gender));
  const allowed: Record<ItemSlot, string[]> = {
    hair: restrict('hair', manifest.proxies.filter((p) => p.kind === 'hair').map((p) => p.id).filter((id) => fits(hairInfo(id).fit, gender))),
    headwear: restrict('headwear', bySlot('headwear')),
    outfit: restrict('outfit', bySlot('outfit')),
    shoes: restrict('shoes', bySlot('shoes')),
    hat: restrict('hat', bySlot('hat')),
    skin: restrict('skin', manifest.skins.filter((s) => fits(skinInfo(s.id, s.tags).fit, gender)).map((s) => s.id)),
    eyes: restrict('eyes', manifest.eyes),
    eyebrows: restrict('eyebrows', manifest.proxies.filter((p) => p.kind === 'eyebrows').map((p) => p.id)),
    eyelashes: restrict('eyelashes', manifest.proxies.filter((p) => p.kind === 'eyelashes').map((p) => p.id)),
  };
  // order hair by the catalog (best-looking first), then anything extra
  allowed.hair.sort((a, b) => order(a) - order(b));

  const hairColors = options.colors?.hair ?? HUMAN_HAIR_COLORS.map((h) => h.color);
  const browColors = options.colors?.eyebrows ?? hairColors;
  const tints = options.colors?.skinTint ?? SKIN_TINTS;
  const garmentColors = options.colors?.garments ?? GARMENT_COLORS.map((g) => g.color);
  const tintable = (id: string) => !!manifest.proxies.find((p) => p.kind === 'clothes' && p.id === id)?.tintable;
  const defaultColor = (id: string | undefined) => manifest.proxies.find((p) => p.kind === 'clothes' && p.id === id)?.color;

  // ---- controls
  const shown = (section: SectionId, id: string) => !exclude.has(section) && !exclude.has(`${section}.${id}`) && !exclude.has(id) && (!include || include.has(`${section}.${id}`) || include.has(id));
  const macro = (id: (typeof MACRO_SLIDERS)[number]['id'], lbl: string, min = 0, max = 1): SliderControl => ({
    kind: 'slider', id, label: label(id, lbl), min, max, step: 0.01,
    value: (c) => c[id], apply: (c, v) => ({ ...c, [id]: v }),
  });
  const detail = (id: string): SliderControl => {
    const s = DETAIL_SLIDERS.find((d) => d.id === id)!;
    return {
      kind: 'slider', id, label: label(id, s.label), min: s.neg.length ? -range : 0, max: range, step: 0.01,
      value: (c) => c.detail[id] ?? 0, apply: (c, v) => withDetail(c, id, v),
    };
  };
  const choice = (id: string, lbl: string, opts: ChoiceOption[], value: ChoiceControl['value'], apply: ChoiceControl['apply']): ChoiceControl =>
    ({ kind: 'choice', id, label: label(id, lbl), options: opts, value, apply });
  const color = (id: string, lbl: string, colors: string[], value: ColorControl['value'], apply: ColorControl['apply']): ColorControl =>
    ({ kind: 'color', id, label: label(id, lbl), colors, value, apply });
  const none = (on: boolean): ChoiceOption[] => (on ? [{ id: null, label: label('none', 'None') }] : []);
  const worn = (c: HumanConfig, slot: WearSlot) => c.clothes.find((id) => clothingInfo(id).slot === slot);
  const clothingChoice = (slot: WearSlot, lbl: string, canBeEmpty: boolean) => choice('style', lbl,
    [...none(canBeEmpty), ...allowed[slot].map((id) => ({ id, label: label(id, clothingInfo(id).label) }))],
    (c) => worn(c, slot) ?? null,
    (c, v) => ({ ...c, clothes: [...c.clothes.filter((id) => clothingInfo(id).slot !== slot && !(v && clothingInfo(id).slot === CONFLICTS[slot])), ...(v ? [v] : [])] }));
  /** Fabric color of the tintable garment in a slot (only shown when the slot offers one). */
  const garmentColor = (slot: WearSlot): EditorControl[] => (allowed[slot].some(tintable)
    ? [color('color', 'Color', garmentColors, (c) => c.garmentColors?.[slot] ?? defaultColor(worn(c, slot)) ?? garmentColors[0],
      (c, v) => ({ ...c, garmentColors: { ...c.garmentColors, [slot]: v } }))]
    : []);

  const build: Record<SectionId, () => EditorControl[]> = {
    face: () => [
      ...(['african', 'asian', 'caucasian'] as const).map((k) => macro(k, { african: 'African features', asian: 'Asian features', caucasian: 'European features' }[k])),
      ...DETAIL_SLIDERS.filter((d) => d.group === 'head').map((d) => detail(d.id)),
    ],
    skin: () => [
      choice('tone', 'Skin', allowed.skin.map((id) => ({ id, label: label(id, skinInfo(id, manifest.skins.find((s) => s.id === id)?.tags ?? []).label) })),
        (c) => c.skin, (c, v) => ({ ...c, skin: v ?? c.skin })),
      color('tint', 'Tint', tints, (c) => c.skinTint, (c, v) => ({ ...c, skinTint: v })),
    ],
    eyes: () => [
      choice('color', 'Eye color', allowed.eyes.map((id) => ({ id, label: label(id, EYE_LABELS[id] ?? id), swatch: EYE_SWATCH[id] })),
        (c) => c.eyes, (c, v) => ({ ...c, eyes: v ?? c.eyes })),
      choice('lashes', 'Lashes', [...none(true), ...allowed.eyelashes.map((id, i) => ({ id, label: `${i + 1}` }))],
        (c) => c.eyelashes, (c, v) => ({ ...c, eyelashes: v })),
      ...DETAIL_SLIDERS.filter((d) => d.group === 'eyes' && !BROW_SLIDERS.includes(d.id)).map((d) => detail(d.id)),
    ],
    brows: () => [
      choice('style', 'Brows', [...none(optional.eyebrows), ...allowed.eyebrows.map((id, i) => ({ id, label: `${i + 1}` }))],
        (c) => c.eyebrows, (c, v) => ({ ...c, eyebrows: v })),
      color('color', 'Brow color', browColors, (c) => c.eyebrowColor, (c, v) => ({ ...c, eyebrowColor: v })),
      ...BROW_SLIDERS.map(detail),
    ],
    nose: () => DETAIL_SLIDERS.filter((d) => d.group === 'nose').map((d) => detail(d.id)),
    mouth: () => DETAIL_SLIDERS.filter((d) => d.group === 'mouth').map((d) => detail(d.id)),
    ears: () => DETAIL_SLIDERS.filter((d) => d.group === 'ears').map((d) => detail(d.id)),
    hair: () => [
      choice('style', 'Hairstyle', [...none(optional.hair), ...allowed.hair.map((id) => ({ id, label: label(id, hairInfo(id).label) }))],
        (c) => c.hair, (c, v) => ({ ...c, hair: v })),
      color('color', 'Hair color', hairColors, (c) => c.hairColor, (c, v) => ({ ...c, hairColor: v })),
    ],
    body: () => [
      ...(gender === 'any' ? [macro('gender', 'Gender')] : []),
      macro('age', 'Age'), macro('weight', 'Weight'), macro('muscle', 'Muscle'), macro('height', 'Height'), macro('proportions', 'Proportions'),
      ...(gender !== 'male' ? [macro('cupSize', 'Bust'), macro('firmness', 'Firmness')] : []),
      ...DETAIL_SLIDERS.filter((d) => d.group === 'body').map((d) => detail(d.id)),
    ],
    headwear: () => [clothingChoice('headwear', 'Headwear', optional.headwear), ...garmentColor('headwear')],
    outfit: () => [clothingChoice('outfit', 'Outfit', false), ...garmentColor('outfit')],
    shoes: () => [clothingChoice('shoes', 'Shoes', optional.shoes)],
    hat: () => [clothingChoice('hat', 'Hat', optional.hat)],
  };

  const sections: EditorSection[] = [];
  for (const id of options.sections ?? ALL_SECTIONS) {
    if (exclude.has(id)) continue;
    const controls = build[id]().filter((ctl) => shown(id, ctl.id)).filter((ctl) => ctl.kind !== 'choice' || ctl.options.length > 1 || ctl.options[0]?.id !== null);
    if ((id === 'outfit' || id === 'shoes' || id === 'hat' || id === 'headwear') && !allowed[id].length) continue;
    if (controls.length) sections.push({ id, label: label(id, SECTION_LABELS[id]), framing: FACE_SECTIONS.includes(id) ? 'face' : 'body', controls });
  }

  // ---- normalize: defaults <- input <- locked, then repair anything not allowed
  const genderDefaults = gender === 'any' ? {} : GENDER_DEFAULTS[gender];
  const base: HumanConfig = { ...DEFAULT_HUMAN, ...genderDefaults, ...options.defaults, detail: { ...DEFAULT_HUMAN.detail, ...options.defaults?.detail } } as HumanConfig;
  const pick = (want: string | null | undefined, ids: string[], fallback: string | null | undefined) =>
    want && ids.includes(want) ? want : fallback && ids.includes(fallback) ? fallback : ids[0] ?? null;

  function normalize(input?: Partial<HumanConfig> | null): HumanConfig {
    const c: HumanConfig = { ...base, ...input, ...options.locked, detail: { ...base.detail, ...input?.detail, ...options.locked?.detail } } as HumanConfig;
    if (gender !== 'any') c.gender = options.locked?.gender ?? (gender === 'female' ? Math.min(c.gender, 0.3) : Math.max(c.gender, 0.7));
    for (const [k, v] of Object.entries(c.detail)) c.detail[k] = Math.max(-range, Math.min(range, v));
    c.skin = pick(c.skin, allowed.skin, closestSkin(c.skin, allowed.skin, manifest) ?? base.skin) ?? c.skin;
    c.eyes = pick(c.eyes, allowed.eyes, base.eyes) ?? c.eyes;
    c.hair = c.hair === null && optional.hair ? null : pick(c.hair, allowed.hair, base.hair);
    c.eyebrows = c.eyebrows === null && optional.eyebrows ? null : pick(c.eyebrows, allowed.eyebrows, base.eyebrows);
    c.eyelashes = c.eyelashes === null ? null : pick(c.eyelashes, allowed.eyelashes, base.eyelashes);
    const wear = (slot: WearSlot, canBeEmpty: boolean) => {
      const cur = c.clothes.find((id) => clothingInfo(id).slot === slot);
      const fallback = base.clothes.find((id) => clothingInfo(id).slot === slot);
      if (!cur && canBeEmpty) return [];
      const v = pick(cur, allowed[slot], fallback);
      return v ? [v] : [];
    };
    const headwear = wear('headwear', true);
    c.clothes = [...wear('outfit', false), ...wear('shoes', optional.shoes), ...headwear, ...(headwear.length ? [] : wear('hat', true))];
    if (c.garmentColors) c.garmentColors = Object.fromEntries(Object.entries(c.garmentColors).filter(([, v]) => typeof v === 'string'));
    return c;
  }

  function randomize(rand: () => number = Math.random): HumanConfig {
    const any = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
    const c = normalize();
    const mix = [rand(), rand(), rand()];
    const sum = mix[0] + mix[1] + mix[2];
    const detail: Record<string, number> = {};
    for (const d of DETAIL_SLIDERS) if (d.group !== 'body') detail[d.id] = d.neg.length ? (rand() * 2 - 1) * 0.35 * range : rand() * 0.25 * range;
    return normalize({
      ...c, detail,
      african: mix[0] / sum, asian: mix[1] / sum, caucasian: mix[2] / sum,
      age: rand() * 0.45, weight: 0.35 + rand() * 0.3, muscle: 0.35 + rand() * 0.3, height: 0.3 + rand() * 0.4,
      skin: any(allowed.skin) ?? c.skin, eyes: any(allowed.eyes) ?? c.eyes,
      hair: any(allowed.hair) ?? c.hair, hairColor: any(hairColors), eyebrows: any(allowed.eyebrows) ?? c.eyebrows,
      clothes: [any(allowed.outfit), any(allowed.shoes)].filter(Boolean) as string[],
    });
  }

  return { options, sections, initial: normalize(), normalize, randomize, allowed };
}

const HAIR_ORDER = ['long01', 'ponytail01', 'bob02', 'afro01', 'short02', 'short01', 'short04', 'bob01', 'braid01', 'short03'];
const order = (id: string) => { const i = HAIR_ORDER.indexOf(id); return i < 0 ? 100 : i; };

/** Same age/ethnicity skin among the allowed ones (used when gender filtering removes the current skin). */
function closestSkin(id: string, allowed: string[], manifest: HumanManifest) {
  const tags = manifest.skins.find((s) => s.id === id)?.tags ?? [];
  let best: string | null = null, score = -1;
  for (const a of allowed) {
    const t = manifest.skins.find((s) => s.id === a)?.tags ?? [];
    const sc = t.filter((x) => tags.includes(x)).length;
    if (sc > score) { score = sc; best = a; }
  }
  return best;
}
