// Quick local preview: render configs to PNG via sharp (librsvg). Usage: tsx tools/forge2d/preview.mts out.png [json-patch]
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { renderAvatarSvg } from '../../src/forge2d/render';
import { DEFAULT_CONFIG } from '../../src/forge2d/defaults';

const out = process.argv[2] ?? 'preview.png';
const patch = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const merge = (a: any, b: any): any => (b && typeof b === 'object' && !Array.isArray(b) ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, k in b ? merge(a[k], b[k]) : a[k]])) : b);
const cfg = merge(DEFAULT_CONFIG, patch);
const vb = process.argv[4] ? (JSON.parse(process.argv[4]) as [number, number, number, number]) : undefined;
const svg = renderAvatarSvg(cfg, { width: vb ? 900 : 800, viewBox: vb, onWarn: (m) => console.warn('warn:', m) });
writeFileSync(out.replace(/\.png$/, '.svg'), svg);
await sharp(Buffer.from(svg), { density: 96 }).flatten({ background: '#eef0f6' }).png().toFile(out);
console.log('wrote', out, svg.length, 'bytes');
