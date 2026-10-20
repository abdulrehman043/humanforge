// Plug-in artwork: register extra assets (authored SVG fragments on the 400x784 canvas) without touching the engine.
import type { LayerId } from './layers';

export type ExternalCategory = 'hair' | 'headwear' | 'top' | 'outer' | 'bottom' | 'dress' | 'shoes' | 'glasses' | 'earrings' | 'necklace' | 'scarf' | 'bag' | 'hairAccessory';
export interface ExternalAsset {
  id: string; category: ExternalCategory; name: string;
  /** SVG fragments per layer. `{{color}}` is replaced with the colour chosen for the slot; coordinates use the shared canvas. */
  layers: Partial<Record<LayerId, string>>;
  tags?: string[];
  source: { author: string; license: string; url?: string };
}
// kept on globalThis so duplicate module instances (bundlers, test loaders) share one registry
const registry: Map<string, ExternalAsset> = ((globalThis as any).__humanforgeForge2dAssets ??= new Map<string, ExternalAsset>());
export const registerAsset = (a: ExternalAsset) => { registry.set(`${a.category}:${a.id}`, a); };
export const unregisterAsset = (category: ExternalCategory, id: string) => registry.delete(`${category}:${id}`);
export const getExternal = (category: ExternalCategory, id: string) => registry.get(`${category}:${id}`);
export const listExternal = (category?: ExternalCategory) => [...registry.values()].filter((a) => !category || a.category === category);
