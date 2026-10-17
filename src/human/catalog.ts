// Item metadata for the editor: display names, which gender an item suits, and slot.
// Ids match the asset package manifest (pkg.manifest). Items missing here still work;
// they get a generated label and are treated as unisex.

export type Fit = 'female' | 'male' | 'unisex';
export type ClothingSlot = 'outfit' | 'shoes' | 'hat';

export interface ItemInfo { label: string; fit: Fit }

export const HAIR: Record<string, ItemInfo> = {
  long01: { label: 'Long straight', fit: 'female' },
  ponytail01: { label: 'Ponytail', fit: 'female' },
  bob02: { label: 'Bob', fit: 'female' },
  bob01: { label: 'Swept bob', fit: 'female' },
  braid01: { label: 'Braid', fit: 'female' },
  afro01: { label: 'Afro', fit: 'unisex' },
  short01: { label: 'Short textured', fit: 'unisex' },
  short02: { label: 'Short tousled', fit: 'male' },
  short03: { label: 'Side fringe', fit: 'unisex' },
  short04: { label: 'Slicked back', fit: 'male' },
};

export const CLOTHES: Record<string, ItemInfo & { slot: ClothingSlot }> = {
  female_casualsuit01: { label: 'Casual tee', fit: 'female', slot: 'outfit' },
  female_casualsuit02: { label: 'Casual layers', fit: 'female', slot: 'outfit' },
  female_elegantsuit01: { label: 'Elegant', fit: 'female', slot: 'outfit' },
  female_sportsuit01: { label: 'Sport', fit: 'female', slot: 'outfit' },
  male_casualsuit01: { label: 'Casual 1', fit: 'male', slot: 'outfit' },
  male_casualsuit02: { label: 'Casual 2', fit: 'male', slot: 'outfit' },
  male_casualsuit03: { label: 'Casual 3', fit: 'male', slot: 'outfit' },
  male_casualsuit04: { label: 'Casual 4', fit: 'male', slot: 'outfit' },
  male_casualsuit05: { label: 'Casual 5', fit: 'male', slot: 'outfit' },
  male_casualsuit06: { label: 'Casual 6', fit: 'male', slot: 'outfit' },
  male_elegantsuit01: { label: 'Suit', fit: 'male', slot: 'outfit' },
  male_worksuit01: { label: 'Workwear', fit: 'male', slot: 'outfit' },
  shoes01: { label: 'Shoes 1', fit: 'unisex', slot: 'shoes' },
  shoes02: { label: 'Shoes 2', fit: 'unisex', slot: 'shoes' },
  shoes03: { label: 'Shoes 3', fit: 'unisex', slot: 'shoes' },
  shoes04: { label: 'Shoes 4', fit: 'unisex', slot: 'shoes' },
  shoes05: { label: 'Shoes 5', fit: 'unisex', slot: 'shoes' },
  shoes06: { label: 'Shoes 6', fit: 'unisex', slot: 'shoes' },
  fedora01: { label: 'Fedora', fit: 'unisex', slot: 'hat' },
  fedora_cocked: { label: 'Fedora (tilted)', fit: 'unisex', slot: 'hat' },
};

export const EYE_LABELS: Record<string, string> = {
  brown: 'Dark brown', brownlight: 'Brown', green: 'Green', blue: 'Blue', deepblue: 'Deep blue',
  lightblue: 'Light blue', bluegreen: 'Blue-green', grey: 'Grey', ice: 'Ice',
};

/** Swatch colors for eye chips (approximate iris color). */
export const EYE_SWATCH: Record<string, string> = {
  brown: '#3b1d0e', brownlight: '#6b4a22', green: '#3f6a3a', blue: '#2f5f74', deepblue: '#38376a',
  lightblue: '#6aa3b8', bluegreen: '#5f9a8a', grey: '#86928a', ice: '#9ab8a8',
};

/**
 * Natural hair colors, as the tint multiplied over the grey hair textures (they average ~70%
 * brightness, so tints are a bit lighter than the visible result).
 */
export const HUMAN_HAIR_COLORS: { id: string; label: string; color: string }[] = [
  { id: 'black', label: 'Black', color: '#1a1412' },
  { id: 'darkbrown', label: 'Dark brown', color: '#3d2618' },
  { id: 'brown', label: 'Brown', color: '#6b4428' },
  { id: 'lightbrown', label: 'Light brown', color: '#9a6a40' },
  { id: 'auburn', label: 'Auburn', color: '#8e3b1f' },
  { id: 'copper', label: 'Copper', color: '#c0602c' },
  { id: 'darkblonde', label: 'Dark blonde', color: '#b88c55' },
  { id: 'blonde', label: 'Blonde', color: '#e6c88a' },
  { id: 'platinum', label: 'Platinum', color: '#f2ead8' },
  { id: 'grey', label: 'Grey', color: '#a8a39c' },
  { id: 'white', label: 'White', color: '#f4f2ee' },
];

/** Skin tint presets (multiplied over the skin texture; white = texture as-is). */
export const SKIN_TINTS = ['#ffffff', '#fbefe6', '#f5e3d3', '#ffe9dc', '#efe2d6', '#e8d4c4'];

const words = (s: string) => s.replace(/_/g, ' ').replace(/(\d+)$/, ' $1').replace(/\s+/g, ' ').trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function hairInfo(id: string): ItemInfo { return HAIR[id] ?? { label: cap(words(id)), fit: 'unisex' }; }
export function clothingInfo(id: string): ItemInfo & { slot: ClothingSlot } {
  if (CLOTHES[id]) return CLOTHES[id];
  const slot: ClothingSlot = id.startsWith('shoes') ? 'shoes' : /hat|fedora|cap|helmet/.test(id) ? 'hat' : 'outfit';
  const fit: Fit = id.startsWith('female') ? 'female' : id.startsWith('male') ? 'male' : 'unisex';
  return { label: cap(words(id.replace(/^(fe)?male_/, ''))), fit, slot };
}
export function skinInfo(id: string, tags: string[]): ItemInfo {
  const fit: Fit = tags.some((t) => t.startsWith('female')) ? 'female' : tags.some((t) => t.startsWith('male')) ? 'male' : 'unisex';
  const age = tags.includes('young') ? 'Young' : tags.includes('middleage') ? 'Middle-aged' : tags.includes('old') ? 'Older' : '';
  const eth = tags.includes('african') ? 'African' : tags.includes('asian') ? 'Asian' : tags.includes('caucasian') ? 'European' : '';
  const variant = /2$/.test(id) ? ' 2' : '';
  return { label: [age, eth].filter(Boolean).join(' ') + variant || cap(words(id)), fit };
}
export const fits = (fit: Fit, gender: 'female' | 'male' | 'any') => gender === 'any' || fit === 'unisex' || fit === gender;
