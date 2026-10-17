// Avatar configuration: the single source of truth. Everything (mesh, UI, codec)
// is derived from this plain JSON object, so it is cheap to store and sync.

export const HAIR_STYLES = ['bald', 'buzz', 'short', 'sidepart', 'curly', 'bob', 'long', 'ponytail', 'bun', 'afro'] as const;
export const FACIAL_HAIR = ['none', 'stubble', 'mustache', 'goatee', 'beard'] as const;
export const BROWS = ['none', 'thin', 'thick', 'arched'] as const;
export const NOSES = ['button', 'straight', 'wide'] as const;
export const MOUTHS = ['smile', 'neutral', 'open'] as const;
export const TOPS = ['tank', 'tshirt', 'longsleeve', 'hoodie', 'kurta', 'dress'] as const;
export const BOTTOMS = ['pants', 'shorts', 'skirt', 'longskirt'] as const;
export const SHOES = ['sneakers', 'boots', 'sandals'] as const;
export const HEADWEAR = ['none', 'cap', 'beanie', 'kufi', 'hijab'] as const;
export const GLASSES = ['none', 'round', 'square'] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type Brow = (typeof BROWS)[number];
export type Nose = (typeof NOSES)[number];
export type Mouth = (typeof MOUTHS)[number];
export type Top = (typeof TOPS)[number];
export type Bottom = (typeof BOTTOMS)[number];
export type Shoe = (typeof SHOES)[number];
export type Headwear = (typeof HEADWEAR)[number];
export type Glasses = (typeof GLASSES)[number];

/** All sliders are normalised 0..1 (0.5 = neutral). Colors are '#rrggbb'. */
export interface AvatarConfig {
  skin: string;
  // face
  headWidth: number;
  jaw: number;
  chin: number;
  eyeSize: number;
  eyeSpacing: number;
  eyeColor: string;
  brows: Brow;
  nose: Nose;
  noseSize: number;
  mouth: Mouth;
  mouthWidth: number;
  lipColor: string;
  earSize: number;
  // hair
  hair: HairStyle;
  hairColor: string;
  facialHair: FacialHair;
  // body
  height: number;
  build: number;
  chest: number;
  hips: number;
  // outfit
  top: Top;
  topColor: string;
  bottom: Bottom;
  bottomColor: string;
  shoes: Shoe;
  shoesColor: string;
  // extras
  headwear: Headwear;
  headwearColor: string;
  glasses: Glasses;
  glassesColor: string;
}

export const SKIN_TONES = ['#ffdbc4', '#f1c27d', '#e0ac69', '#c68642', '#a1665e', '#8d5524', '#5c3a21', '#3b2219'];
export const HAIR_COLORS = ['#0e0b0a', '#2c1b10', '#4a2f1b', '#7a4a26', '#a76b3a', '#d6b370', '#e8d8b0', '#9a9a9a', '#b5452e', '#6b3fa0'];
export const EYE_COLORS = ['#3b2314', '#5b3a1e', '#8a6a2f', '#4f7a3a', '#3a6f9a', '#6e7f8c', '#1a1a1a'];
export const LIP_COLORS = ['#c97a6d', '#b3615a', '#9c4f4a', '#d98c8c', '#8a3b3b', '#b0475f'];
export const CLOTH_COLORS = [
  '#f5f5f0', '#1d1d1f', '#2f3e5c', '#3f6fb5', '#8fb4d9', '#2f6b4f', '#7fae7a', '#c9a227',
  '#e07a2e', '#b23a3a', '#d77fa1', '#6b4c9a', '#8b6b4e', '#c8b89a', '#5a5a5a',
];

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: SKIN_TONES[2],
  headWidth: 0.5,
  jaw: 0.5,
  chin: 0.5,
  eyeSize: 0.5,
  eyeSpacing: 0.5,
  eyeColor: EYE_COLORS[1],
  brows: 'thick',
  nose: 'button',
  noseSize: 0.5,
  mouth: 'smile',
  mouthWidth: 0.5,
  lipColor: LIP_COLORS[0],
  earSize: 0.5,
  hair: 'short',
  hairColor: HAIR_COLORS[1],
  facialHair: 'none',
  height: 0.5,
  build: 0.5,
  chest: 0.5,
  hips: 0.5,
  top: 'tshirt',
  topColor: CLOTH_COLORS[3],
  bottom: 'pants',
  bottomColor: CLOTH_COLORS[2],
  shoes: 'sneakers',
  shoesColor: CLOTH_COLORS[0],
  headwear: 'none',
  headwearColor: CLOTH_COLORS[0],
  glasses: 'none',
  glassesColor: CLOTH_COLORS[1],
};

/** Fill missing/invalid fields with defaults (safe to call on untrusted input). */
export function normalizeConfig(input: Partial<AvatarConfig> | null | undefined): AvatarConfig {
  const out: AvatarConfig = { ...DEFAULT_AVATAR };
  if (!input || typeof input !== 'object') return out;
  for (const k of Object.keys(DEFAULT_AVATAR) as (keyof AvatarConfig)[]) {
    const v = (input as any)[k];
    const d = DEFAULT_AVATAR[k];
    if (typeof d === 'number' && typeof v === 'number' && isFinite(v)) (out as any)[k] = Math.min(1, Math.max(0, v));
    else if (typeof d === 'string' && typeof v === 'string') {
      if (d.startsWith('#')) {
        if (/^#[0-9a-f]{6}$/i.test(v)) (out as any)[k] = v.toLowerCase();
      } else if (ENUMS[k]?.includes(v)) (out as any)[k] = v;
    }
  }
  return out;
}

export const ENUMS: Partial<Record<keyof AvatarConfig, readonly string[]>> = {
  brows: BROWS,
  nose: NOSES,
  mouth: MOUTHS,
  hair: HAIR_STYLES,
  facialHair: FACIAL_HAIR,
  top: TOPS,
  bottom: BOTTOMS,
  shoes: SHOES,
  headwear: HEADWEAR,
  glasses: GLASSES,
};

const pick = <T,>(arr: readonly T[], r: () => number) => arr[Math.floor(r() * arr.length)];

/** Random avatar. Pass a seeded rng for reproducible results. */
export function randomAvatar(rng: () => number = Math.random): AvatarConfig {
  const slider = () => 0.2 + rng() * 0.6;
  const hairColor = pick(HAIR_COLORS.slice(0, 8), rng);
  const feminine = rng() < 0.5;
  return {
    skin: pick(SKIN_TONES, rng),
    headWidth: slider(),
    jaw: slider(),
    chin: slider(),
    eyeSize: slider(),
    eyeSpacing: slider(),
    eyeColor: pick(EYE_COLORS, rng),
    brows: pick(feminine ? (['thin', 'arched'] as const) : (['thick', 'thin'] as const), rng),
    nose: pick(NOSES, rng),
    noseSize: slider(),
    mouth: pick(MOUTHS, rng),
    mouthWidth: slider(),
    lipColor: pick(LIP_COLORS, rng),
    earSize: slider(),
    hair: pick(feminine ? (['bob', 'long', 'ponytail', 'bun', 'curly', 'afro'] as const) : (['buzz', 'short', 'sidepart', 'curly', 'bald'] as const), rng),
    hairColor,
    facialHair: feminine ? 'none' : pick(FACIAL_HAIR, rng),
    height: slider(),
    build: slider(),
    chest: feminine ? 0.55 + rng() * 0.3 : 0.3 + rng() * 0.3,
    hips: feminine ? 0.55 + rng() * 0.35 : 0.2 + rng() * 0.3,
    top: pick(feminine ? (['tshirt', 'longsleeve', 'dress', 'kurta'] as const) : (['tshirt', 'longsleeve', 'hoodie', 'kurta', 'tank'] as const), rng),
    topColor: pick(CLOTH_COLORS, rng),
    bottom: pick(feminine ? BOTTOMS : (['pants', 'shorts'] as const), rng),
    bottomColor: pick(CLOTH_COLORS, rng),
    shoes: pick(SHOES, rng),
    shoesColor: pick(CLOTH_COLORS, rng),
    headwear: rng() < 0.75 ? 'none' : pick(feminine ? (['hijab', 'beanie'] as const) : (['cap', 'beanie', 'kufi'] as const), rng),
    headwearColor: pick(CLOTH_COLORS, rng),
    glasses: rng() < 0.7 ? 'none' : pick(['round', 'square'] as const, rng),
    glassesColor: pick(['#1d1d1f', '#8b6b4e', '#c9a227', '#5a5a5a'], rng),
  };
}
