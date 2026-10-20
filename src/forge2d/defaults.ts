import { SCHEMA, SCHEMA_VERSION, STYLE_VERSION, AvatarConfig } from './types';

export const DEFAULT_CONFIG: AvatarConfig = {
  schema: SCHEMA, version: SCHEMA_VERSION, style: STYLE_VERSION,
  face: { shape: 'oval', skin: 'golden', eyes: 'almond', eyeColor: '#7a4a26', brows: 'soft', nose: 'soft', mouth: 'balanced', lipColor: '#c8727d', cheeks: 2, freckles: 0, mole: 'none', eyeshadow: '#00000000', lashes: true },
  hair: { style: 'long-center', color: '#8a5a34', highlight: '#d9ae72', highlightStyle: 'balayage' },
  headwear: { style: 'none', color: '#9db69b', fabric: 'jersey', undercap: false },
  outfit: { top: 'long-sleeve', topColor: '#2a2b30', bottom: 'wide-jeans', bottomColor: '#9a9da3', dress: 'none', dressColor: '#2f5b4a', outer: 'puffer-crop', outerColor: '#e6dcc8', shoes: 'fluffy-boots', shoesColor: '#7a5236' },
  accessories: { glasses: 'none', glassesColor: '#25252a', earrings: 'none', metal: '#e0b24c', necklace: 'none', bag: 'none', bagColor: '#7a5236', scarf: 'none', scarfColor: '#c4b6e6', hairAccessory: 'none', hairAccessoryColor: '#f3f0ea' },
  expression: 'neutral',
  pose: 'relaxed',
};
