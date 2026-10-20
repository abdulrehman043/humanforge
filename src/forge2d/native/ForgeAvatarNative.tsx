// <ForgeAvatarNative config={...} /> for React Native: renders the avatar with react-native-svg using the portable
// (filter-free) renderer. `react-native-svg` is an optional peer dependency (>= 13).
import React, { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { renderAvatarSvg } from '../render';
import { CANVAS, hashId } from '../geom';
import type { AvatarConfig } from '../types';

/** Crop windows in canvas units. */
export const FRAMES = {
  full: undefined,
  upper: [30, 6, 340, 440] as [number, number, number, number],
  bust: [60, 8, 280, 300] as [number, number, number, number],
  head: [100, 14, 200, 210] as [number, number, number, number],
};
export type Framing = keyof typeof FRAMES;

export interface ForgeAvatarNativeProps {
  config: AvatarConfig;
  /** width in dp; height follows the framing */
  width?: number;
  framing?: Framing;
  /** a custom crop (canvas units), overrides `framing` */
  viewBox?: [number, number, number, number];
  style?: StyleProp<ViewStyle>;
}

export function ForgeAvatarNative({ config, width = 160, framing = 'full', viewBox, style }: ForgeAvatarNativeProps) {
  const vb = viewBox ?? FRAMES[framing];
  const key = JSON.stringify(config) + (vb ? vb.join(',') : '');
  const xml = useMemo(() => renderAvatarSvg(config, { portable: true, fast: !!vb && vb[3] < 300, viewBox: vb, width: 400, uid: `n${hashId(key)}` }), [key]);
  const aspect = vb ? vb[3] / vb[2] : CANVAS.h / CANVAS.w;
  return <SvgXml xml={xml} width={width} height={width * aspect} style={style} />;
}
