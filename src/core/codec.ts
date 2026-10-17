// Compact, URL-safe serialization (~65 chars) so an avatar fits in a DB column,
// deep link or QR code. Format: "1" + one base64url char per enum/slider + 4 per color.
import { AvatarConfig, DEFAULT_AVATAR, ENUMS, normalizeConfig } from './config';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VERSION = '1';
// Field order is part of the format: append new fields at the end only.
const KEYS = Object.keys(DEFAULT_AVATAR) as (keyof AvatarConfig)[];

export function encodeAvatar(config: AvatarConfig): string {
  let s = VERSION;
  for (const k of KEYS) {
    const v = config[k] as string | number;
    const d = DEFAULT_AVATAR[k];
    if (typeof d === 'number') s += B64[Math.round(Math.min(1, Math.max(0, v as number)) * 63)];
    else if ((d as string).startsWith('#')) {
      const n = parseInt((v as string).slice(1), 16) || 0;
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    } else s += B64[Math.max(0, ENUMS[k]!.indexOf(v as string))];
  }
  return s;
}

export function decodeAvatar(code: string): AvatarConfig {
  if (!code || code[0] !== VERSION) return { ...DEFAULT_AVATAR };
  const out: Record<string, unknown> = {};
  let i = 1;
  const next = () => B64.indexOf(code[i++] ?? 'A');
  for (const k of KEYS) {
    if (i >= code.length) break;
    const d = DEFAULT_AVATAR[k];
    if (typeof d === 'number') out[k] = next() / 63;
    else if ((d as string).startsWith('#')) {
      const n = (next() << 18) | (next() << 12) | (next() << 6) | next();
      out[k] = '#' + n.toString(16).padStart(6, '0');
    } else out[k] = ENUMS[k]![next()];
  }
  return normalizeConfig(out as Partial<AvatarConfig>);
}
