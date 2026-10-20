// Renders the approval-gate contact sheet: 8 original full-body characters, same scale and background.
//   usage: tsx tools/forge2d/contact-sheet.mts [out.png]      (default docs/forge2d/contact-sheet.png)
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CANVAS } from '../../src/forge2d/geom';
import { renderAvatarSvg } from '../../src/forge2d/render';
import { DEFAULT_CONFIG } from '../../src/forge2d/defaults';
import { normalizeConfig } from '../../src/forge2d/validate';

const portable = process.env.PORTABLE === '1'; // the React Native (filter-free) render
const out = process.argv[2] ?? (portable ? 'docs/forge2d/contact-sheet-native.png' : 'docs/forge2d/contact-sheet.png');
const patches: any[] = JSON.parse(readFileSync(path.join(import.meta.dirname, 'gate-configs.json'), 'utf8'));
const merge = (a: any, b: any): any => (b && typeof b === 'object' && !Array.isArray(b) ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, k in b ? merge(a[k], b[k]) : a[k]])) : b);
const cols = 4, cw = 330, vb: [number, number, number, number] = [0, 0, CANVAS.w, CANVAS.h], ch = Math.round((cw * vb[3]) / vb[2]);
let body = '';
const dir = path.resolve('assets/forge2d/validation');
mkdirSync(dir, { recursive: true });
for (let i = 0; i < patches.length; i++) {
  if (portable) { const { config } = normalizeConfig(merge(DEFAULT_CONFIG, patches[i])); body += `<g transform="translate(${(i % cols) * cw} ${Math.floor(i / cols) * ch})">${renderAvatarSvg(config, { width: cw, viewBox: vb, uid: `c${i}x`, portable })}</g>`; continue; }
  const { config } = normalizeConfig(merge(DEFAULT_CONFIG, patches[i]));
  const svg = renderAvatarSvg(config, { width: cw, viewBox: vb, uid: `c${i}x`, portable });
  body += `<g transform="translate(${(i % cols) * cw} ${Math.floor(i / cols) * ch})">${svg}</g>`;
  // individual character files for integration: config, standalone SVG and a 2x PNG
  const name = `character-${i + 1}`;
  writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(config, null, 1));
  const big = renderAvatarSvg(config, { width: 400, uid: `i${i}` });
  writeFileSync(path.join(dir, `${name}.svg`), big);
  await sharp(Buffer.from(renderAvatarSvg(config, { width: 800, uid: `p${i}` })), { density: 72 }).png().toFile(path.join(dir, `${name}.png`));
}
const W = cols * cw, H = Math.ceil(patches.length / cols) * ch;
mkdirSync(path.dirname(out), { recursive: true });
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#eef0f6"/>${body}</svg>`), { density: 72 }).png().toFile(out);
writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify(patches, null, 1));
console.log('wrote', out, W, H);
