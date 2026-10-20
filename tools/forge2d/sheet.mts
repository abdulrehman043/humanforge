// Contact-sheet renderer (PNG via sharp). Usage: tsx tools/forge2d/sheet.mts out.png cols cell-w [crop] <<< JSON array of config patches
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { CANVAS } from '../../src/forge2d/geom';
import { renderAvatarSvg } from '../../src/forge2d/render';
import { DEFAULT_CONFIG } from '../../src/forge2d/defaults';

const [out, colsS = '4', cellS = '300', crop = 'full'] = process.argv.slice(2);
const patches: any[] = JSON.parse(readFileSync(0, 'utf8'));
const merge = (a: any, b: any): any => (b && typeof b === 'object' && !Array.isArray(b) ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, k in b ? merge(a[k], b[k]) : a[k]])) : b);
const cols = Number(colsS), cw = Number(cellS);
const vb: [number, number, number, number] = crop === 'head' ? [95, 20, 210, 210] : crop === 'upper' ? [60, 10, 280, 420] : [0, 0, CANVAS.w, CANVAS.h];
const ch = Math.round((cw * vb[3]) / vb[2]);
const rows = Math.ceil(patches.length / cols);
let body = '';
patches.forEach((p, i) => {
  const cfg = merge(DEFAULT_CONFIG, p);
  const svg = renderAvatarSvg(cfg, { width: cw, viewBox: vb, uid: `s${i}x`, fast: process.env.FAST === "1", portable: process.env.PORTABLE === "1", onWarn: (m) => console.warn(i, m) });
  const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
  body += `<g transform="translate(${x} ${y})">${svg.replace(/^<svg /, `<svg x="0" y="0" `)}</g>`;
});
const W = cols * cw, H = rows * ch;
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#eef0f6"/>${body}</svg>`;
await sharp(Buffer.from(sheet), { density: 96 }).png().toFile(out);
console.log('wrote', out, W, H);
