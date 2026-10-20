// <ForgeAvatar config={...} /> renders the avatar inline as SVG (web).
import React, { useMemo } from 'react';
import { renderAvatarSvg, RenderOptions } from './render';
import type { AvatarConfig } from './types';

export interface ForgeAvatarProps extends Omit<RenderOptions, 'width'> {
  config: AvatarConfig;
  width?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function ForgeAvatar({ config, width = '100%', className, style, ...opts }: ForgeAvatarProps) {
  const key = JSON.stringify(config);
  const svg = useMemo(() => renderAvatarSvg(config, { ...opts, width: 400 }), [key, JSON.stringify(opts.viewBox), opts.fast, opts.uid]);
  return <div className={className} style={{ width, lineHeight: 0, ...style }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
