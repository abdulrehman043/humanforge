// Colour palettes. Skin tones derive a full shading ramp; everything else is a plain swatch list.
import { darken, lighten, mix, tone } from './geom';

export interface Swatch { id: string; name: string; hex: string }
const sw = (id: string, name: string, hex: string): Swatch => ({ id, name, hex });

export const SKIN_TONES: Swatch[] = [
  sw('porcelain', 'Porcelain', '#fbe2d0'),
  sw('ivory', 'Ivory', '#f7d3bb'),
  sw('fair', 'Fair', '#f0c3a1'),
  sw('light', 'Light', '#e8b48c'),
  sw('golden', 'Golden', '#dda578'),
  sw('medium', 'Medium', '#d09468'),
  sw('tan', 'Tan', '#bf8259'),
  sw('caramel', 'Caramel', '#a86d46'),
  sw('brown', 'Brown', '#8d5638'),
  sw('deep', 'Deep', '#74432c'),
  sw('rich', 'Rich', '#5b3322'),
  sw('ebony', 'Ebony', '#442418'),
];

export interface SkinRamp { base: string; light: string; shade: string; deep: string; blush: string; lip: string; ear: string }
export function skinRamp(hex: string): SkinRamp {
  return {
    base: hex,
    light: lighten(tone(hex, 0, 0, 0.04), 0.075),
    shade: mix(darken(hex, 0.09), '#8a2f24', 0.14),
    deep: mix(darken(hex, 0.2), '#5a1d18', 0.28),
    blush: mix(hex, '#e0505c', 0.5),
    lip: mix(hex, '#b5545c', 0.55),
    ear: mix(hex, '#c4605a', 0.22),
  };
}

export const HAIR_COLORS: Swatch[] = [
  sw('black', 'Black', '#1d1613'),
  sw('espresso', 'Espresso', '#32201a'),
  sw('chestnut', 'Chestnut', '#5a3824'),
  sw('brown', 'Brown', '#77502f'),
  sw('caramel', 'Caramel', '#a06d3e'),
  sw('honey', 'Honey', '#c39a62'),
  sw('blonde', 'Blonde', '#dcbd86'),
  sw('platinum', 'Platinum', '#ece0c6'),
  sw('auburn', 'Auburn', '#86361f'),
  sw('ginger', 'Ginger', '#b5542a'),
  sw('silver', 'Silver', '#b8bbc2'),
  sw('burgundy', 'Burgundy', '#6d1d3a'),
  sw('rose', 'Rose', '#e5719f'),
  sw('lavender', 'Lavender', '#a78ce0'),
  sw('ocean', 'Ocean', '#3f78d2'),
  sw('teal', 'Teal', '#25aaa0'),
];
export const HIGHLIGHT_COLORS: Swatch[] = [
  sw('honey', 'Honey', '#d9ae72'),
  sw('blonde', 'Blonde', '#e8cf9a'),
  sw('caramel', 'Caramel', '#b8804a'),
  sw('copper', 'Copper', '#c4683a'),
  sw('rose', 'Rose', '#f08cb2'),
  sw('lilac', 'Lilac', '#b9a0ee'),
  sw('sky', 'Sky', '#6aa4ee'),
  sw('mint', 'Mint', '#5fd0b8'),
];

export const EYE_COLORS: Swatch[] = [
  sw('brown', 'Brown', '#7a4a26'),
  sw('dark', 'Dark brown', '#3d2517'),
  sw('hazel', 'Hazel', '#92712f'),
  sw('amber', 'Amber', '#b9792a'),
  sw('green', 'Green', '#4f8c5d'),
  sw('blue', 'Blue', '#4f86c6'),
  sw('grey', 'Grey', '#8793a1'),
  sw('violet', 'Violet', '#8a5fd0'),
];

export const LIP_COLORS: Swatch[] = [
  sw('nude', 'Nude', '#c8828a'),
  sw('peach', 'Peach', '#e39a84'),
  sw('rose', 'Rose', '#c9626f'),
  sw('coral', 'Coral', '#e0705f'),
  sw('mauve', 'Mauve', '#a97080'),
  sw('berry', 'Berry', '#9c3c58'),
  sw('red', 'Red', '#b5252f'),
  sw('plum', 'Plum', '#6f2d4b'),
  sw('brown', 'Cocoa', '#8a4c41'),
];

export const SHADOW_COLORS: Swatch[] = [
  sw('none', 'None', '#00000000'),
  sw('taupe', 'Taupe', '#b58f80'),
  sw('rose', 'Rose', '#d98a9a'),
  sw('peach', 'Peach', '#e8a688'),
  sw('plum', 'Plum', '#8c5a82'),
  sw('smoke', 'Smoky', '#5c5f6b'),
  sw('green', 'Olive', '#8a9a5a'),
  sw('blue', 'Blue', '#6f8fd0'),
];

export const CLOTH_COLORS: Swatch[] = [
  sw('white', 'White', '#f3f0ea'),
  sw('cream', 'Cream', '#e8dcc4'),
  sw('black', 'Black', '#202126'),
  sw('charcoal', 'Charcoal', '#3d4048'),
  sw('grey', 'Grey', '#8c9097'),
  sw('silver', 'Silver', '#c5c8cd'),
  sw('navy', 'Navy', '#243255'),
  sw('cobalt', 'Cobalt', '#3b62c6'),
  sw('sky', 'Sky', '#9cc4ea'),
  sw('teal', 'Teal', '#2f8a8c'),
  sw('forest', 'Forest', '#2f5b4a'),
  sw('sage', 'Sage', '#9db69b'),
  sw('olive', 'Olive', '#6f7440'),
  sw('mustard', 'Mustard', '#d3a232'),
  sw('camel', 'Camel', '#b98c5c'),
  sw('brown', 'Chocolate', '#5a3a2a'),
  sw('rust', 'Rust', '#b4552f'),
  sw('coral', 'Coral', '#ea7a68'),
  sw('red', 'Red', '#b3243a'),
  sw('burgundy', 'Burgundy', '#762235'),
  sw('rose', 'Rose', '#d98aa1'),
  sw('blush', 'Blush', '#f0c4c8'),
  sw('lilac', 'Lilac', '#c4b6e6'),
  sw('plum', 'Plum', '#693565'),
];

export const DENIM_COLORS: Swatch[] = [
  sw('wash-light', 'Light wash', '#a9c3de'),
  sw('wash-mid', 'Mid wash', '#7396c0'),
  sw('wash-dark', 'Dark wash', '#36507a'),
  sw('grey', 'Washed grey', '#9a9da3'),
  sw('charcoal', 'Charcoal', '#4a4d55'),
  sw('black', 'Black', '#2a2b30'),
  sw('white', 'White', '#eceae4'),
  sw('khaki', 'Khaki', '#b8a67e'),
];

export const SHOE_COLORS: Swatch[] = [
  sw('white', 'White', '#f1efea'),
  sw('black', 'Black', '#26272b'),
  sw('brown', 'Brown', '#7a5236'),
  sw('tan', 'Tan', '#b48a5a'),
  sw('grey', 'Grey', '#8d9097'),
  sw('navy', 'Navy', '#2b3a5c'),
  sw('red', 'Red', '#b32d3a'),
  sw('pink', 'Pink', '#e9a7b6'),
  sw('cream', 'Cream', '#e6dac0'),
];

export const METAL_COLORS: Swatch[] = [
  sw('gold', 'Gold', '#e0b24c'),
  sw('silver', 'Silver', '#cfd3da'),
  sw('rose', 'Rose gold', '#e0a08a'),
  sw('black', 'Black', '#2a2a2e'),
  sw('pearl', 'Pearl', '#f3ece0'),
];

export const FRAME_COLORS: Swatch[] = [
  sw('black', 'Black', '#25252a'),
  sw('tortoise', 'Tortoise', '#7b4a2b'),
  sw('gold', 'Gold', '#d8ac4a'),
  sw('silver', 'Silver', '#c5c9d0'),
  sw('clear', 'Clear', '#d7d9de'),
  sw('red', 'Red', '#b2303d'),
  sw('blue', 'Blue', '#3d5fb0'),
];

export const HEAD_COLORS = CLOTH_COLORS;

export const paletteById = (list: Swatch[], id: string) => list.find((s) => s.id === id);
export const hexIn = (list: Swatch[], hex: string) => list.some((s) => s.hex.toLowerCase() === hex.toLowerCase());
