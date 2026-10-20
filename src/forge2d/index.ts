// Public entry for the 2D avatar creator: `import { ... } from 'humanforge/forge2d'`.
export * from './types';
export { DEFAULT_CONFIG } from './defaults';
export { renderAvatarSvg, renderAvatarLayers, buildLayers } from './render';
export type { RenderOptions } from './render';
export { LAYER_ORDER } from './layers';
export { CANVAS, TOP_PAD } from './geom';
export * from './manifest';
export * from './compat';
export * from './validate';
export { randomConfig } from './random';
export * from './storage';
export { computeStats, formatBig } from './stats';
export { registerAsset, unregisterAsset, listExternal } from './external';
export * from './palette';
export { EXPRESSION_IDS } from './face';
export { POSE_IDS, POSES } from './body';
