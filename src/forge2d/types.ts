// Versioned avatar configuration (plain JSON) and the rendering context passed to every template.
import type { Defs } from './geom';
import type { SkinRamp } from './palette';

export const SCHEMA = 'humanforge.avatar2d' as const;
export const SCHEMA_VERSION = 1 as const;
export const STYLE_VERSION = 'forge-2d-v2' as const;

export type FaceShapeId = 'oval' | 'round' | 'heart' | 'square' | 'long' | 'diamond';
export type ExpressionId = 'happy' | 'neutral' | 'excited' | 'thoughtful' | 'confident' | 'sad' | 'surprised';
export type PoseId = 'relaxed' | 'crossed' | 'shy' | 'shrug' | 'wave' | 'hip' | 'chin';
export type Fabric = 'matte' | 'satin' | 'chiffon' | 'jersey';

export interface AvatarConfig {
  schema: typeof SCHEMA;
  version: typeof SCHEMA_VERSION;
  style: string;
  face: {
    shape: FaceShapeId;
    skin: string;          // SKIN_TONES id
    eyes: string;
    eyeColor: string;      // hex
    brows: string;
    nose: string;
    mouth: string;
    lipColor: string;      // hex
    cheeks: 0 | 1 | 2 | 3; // blush strength
    freckles: 0 | 1 | 2;
    mole: 'none' | 'cheek' | 'lip' | 'chin';
    eyeshadow: string;     // hex or '#00000000' for none
    lashes: boolean;
  };
  hair: { style: string; color: string; highlight: string | null; highlightStyle: 'streaks' | 'balayage' | 'tips' };
  headwear: { style: string; color: string; fabric: Fabric; undercap: boolean };
  outfit: {
    top: string; topColor: string;
    bottom: string; bottomColor: string;
    dress: string; dressColor: string;
    outer: string; outerColor: string;
    shoes: string; shoesColor: string;
  };
  accessories: {
    glasses: string; glassesColor: string;
    earrings: string; metal: string;
    necklace: string;
    bag: string; bagColor: string;
    scarf: string; scarfColor: string;
    hairAccessory: string; hairAccessoryColor: string;
  };
  expression: ExpressionId;
  pose: PoseId;
}

/** Everything a template needs to draw itself. */
export interface Ctx {
  d: Defs;
  cfg: AvatarConfig;
  skin: SkinRamp;
  face: import('./face').FaceGeom;
  hairColor: string;
  browColor: string;
}
