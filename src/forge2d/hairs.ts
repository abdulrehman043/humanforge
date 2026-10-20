// Hair registry: every hairstyle template, keyed by id.
import { HAIR_FAMILY_DEFS, HairDef } from './hair';
import { HAIR_CUSTOM_DEFS } from './hair2';

export const HAIRS: HairDef[] = [...HAIR_FAMILY_DEFS, ...HAIR_CUSTOM_DEFS];
export const HAIR_BY_ID: Record<string, HairDef> = Object.fromEntries(HAIRS.map((h) => [h.id, h]));
