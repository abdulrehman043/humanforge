// Editor schema: drives both the React Native creator and the web demo, so adding
// a field here is all it takes to expose it in every UI.
import {
  AvatarConfig, BOTTOMS, BROWS, CLOTH_COLORS, EYE_COLORS, FACIAL_HAIR, GLASSES, HAIR_COLORS,
  HAIR_STYLES, HEADWEAR, LIP_COLORS, MOUTHS, NOSES, SHOES, SKIN_TONES, TOPS,
} from './config';

export type Control =
  | { key: keyof AvatarConfig; label: string; type: 'enum'; options: readonly string[] }
  | { key: keyof AvatarConfig; label: string; type: 'color'; palette: readonly string[] }
  | { key: keyof AvatarConfig; label: string; type: 'slider' };

export interface Section {
  id: string;
  label: string;
  /** Camera framing that best shows this section. */
  focus: 'face' | 'body';
  controls: Control[];
}

export const EDITOR_SCHEMA: Section[] = [
  {
    id: 'face', label: 'Face', focus: 'face', controls: [
      { key: 'skin', label: 'Skin tone', type: 'color', palette: SKIN_TONES },
      { key: 'headWidth', label: 'Face width', type: 'slider' },
      { key: 'jaw', label: 'Jaw', type: 'slider' },
      { key: 'chin', label: 'Chin', type: 'slider' },
      { key: 'earSize', label: 'Ears', type: 'slider' },
    ],
  },
  {
    id: 'eyes', label: 'Eyes', focus: 'face', controls: [
      { key: 'eyeColor', label: 'Eye color', type: 'color', palette: EYE_COLORS },
      { key: 'eyeSize', label: 'Eye size', type: 'slider' },
      { key: 'eyeSpacing', label: 'Eye spacing', type: 'slider' },
      { key: 'brows', label: 'Brows', type: 'enum', options: BROWS },
      { key: 'glasses', label: 'Glasses', type: 'enum', options: GLASSES },
      { key: 'glassesColor', label: 'Frame color', type: 'color', palette: ['#1d1d1f', '#8b6b4e', '#c9a227', '#5a5a5a', '#b23a3a', '#3f6fb5'] },
    ],
  },
  {
    id: 'mouth', label: 'Nose & Mouth', focus: 'face', controls: [
      { key: 'nose', label: 'Nose', type: 'enum', options: NOSES },
      { key: 'noseSize', label: 'Nose size', type: 'slider' },
      { key: 'mouth', label: 'Mouth', type: 'enum', options: MOUTHS },
      { key: 'mouthWidth', label: 'Mouth width', type: 'slider' },
      { key: 'lipColor', label: 'Lip color', type: 'color', palette: LIP_COLORS },
    ],
  },
  {
    id: 'hair', label: 'Hair', focus: 'face', controls: [
      { key: 'hair', label: 'Style', type: 'enum', options: HAIR_STYLES },
      { key: 'hairColor', label: 'Color', type: 'color', palette: HAIR_COLORS },
      { key: 'facialHair', label: 'Facial hair', type: 'enum', options: FACIAL_HAIR },
      { key: 'headwear', label: 'Headwear', type: 'enum', options: HEADWEAR },
      { key: 'headwearColor', label: 'Headwear color', type: 'color', palette: CLOTH_COLORS },
    ],
  },
  {
    id: 'body', label: 'Body', focus: 'body', controls: [
      { key: 'height', label: 'Height', type: 'slider' },
      { key: 'build', label: 'Build', type: 'slider' },
      { key: 'chest', label: 'Chest', type: 'slider' },
      { key: 'hips', label: 'Hips', type: 'slider' },
    ],
  },
  {
    id: 'outfit', label: 'Outfit', focus: 'body', controls: [
      { key: 'top', label: 'Top', type: 'enum', options: TOPS },
      { key: 'topColor', label: 'Top color', type: 'color', palette: CLOTH_COLORS },
      { key: 'bottom', label: 'Bottom', type: 'enum', options: BOTTOMS },
      { key: 'bottomColor', label: 'Bottom color', type: 'color', palette: CLOTH_COLORS },
      { key: 'shoes', label: 'Shoes', type: 'enum', options: SHOES },
      { key: 'shoesColor', label: 'Shoe color', type: 'color', palette: CLOTH_COLORS },
    ],
  },
];

export const prettyLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2');
