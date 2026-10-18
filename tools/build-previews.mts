// Renders preview thumbnails for every option in the human package and adds them to its manifest,
// so apps can show pictures and swatches instead of text.
//
//   npm run build:previews            (after build:human; needs Google Chrome or CHROME_PATH)
//
// Writes assets/human/previews/*.webp (transparent, 192 px) and these manifest fields:
//   proxies[].preview            hair, eyebrows, eyelashes, clothes (outfits, shoes, hats, headwear)
//   skins[].swatch               skin tone as rendered (hex)
//   eyeOptions[id] = { swatch, preview }   iris color and a cropped iris image
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { clothingInfo, hairInfo } from '../src/human/catalog';
import type { HumanConfig, HumanManifest } from '../src/human/runtime';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, 'assets/human');
const SIZE = 192;
const only = process.argv[2]; // optional filter, e.g. "hair" or "hair-bob02"
const manifestPath = path.join(OUT, 'manifest.json');
const manifest: HumanManifest & Record<string, any> = JSON.parse(readFileSync(manifestPath, 'utf8'));
mkdirSync(path.join(OUT, 'previews'), { recursive: true });

const chrome = process.env.CHROME_PATH ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((p) => existsSync(p));
if (!chrome) throw new Error('Set CHROME_PATH to a Chrome/Chromium binary');

const server = await createServer({
  configFile: false, root: path.join(root, 'tools/previews'), publicDir: path.join(root, 'assets'),
  server: { port: 5199, strictPort: false, fs: { allow: [root] } }, logLevel: 'error',
});
await server.listen();
const url = server.resolvedUrls!.local[0];
const browser = await puppeteer.launch({
  executablePath: chrome, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction('window.previewReady === true', { timeout: 120_000 });

const render = async (spec: { config: Partial<HumanConfig>; shot: string; yaw: number; size?: number }) => {
  const dataUrl: string = await page.evaluate((s) => (window as any).renderPreview(s), { size: SIZE, ...spec });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};
/** Trim transparent margins a little, keep it square, encode as WebP. */
const save = async (png: Buffer, rel: string, fit: boolean) => {
  let img = sharp(png);
  if (fit) {
    // crop to the visible pixels, then center on a square canvas with a small margin
    const { data, info } = await sharp(png).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    const side = Math.round(Math.max(info.width, info.height) * 1.08);
    img = sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: data, left: Math.round((side - info.width) / 2), top: Math.round((side - info.height) / 2) }]);
    img = sharp(await img.png().toBuffer()).resize(SIZE, SIZE);
  }
  const out = await img.webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
  writeFileSync(path.join(OUT, rel), out);
  return rel;
};

// Neutral mannequins (defaults match the editor's gender defaults).
const BODY = {
  female: { gender: 0, age: 0.12, skin: 'young_caucasian_female', eyebrows: 'eyebrow002', eyebrowColor: '#3d2618', eyelashes: 'eyelashes02', hair: 'long01', hairColor: '#6b4428', clothes: ['female_casualsuit02', 'shoes02'] },
  male: { gender: 1, age: 0.15, skin: 'young_caucasian_male', eyebrows: 'eyebrow001', eyebrowColor: '#2a1c14', eyelashes: 'eyelashes01', hair: 'short02', hairColor: '#3d2618', clothes: ['male_casualsuit02', 'shoes01'] },
} satisfies Record<string, Partial<HumanConfig>>;
const neutral = { african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3, detail: {}, skinTint: '#ffffff', garmentColors: {} };

let n = 0;
for (const p of manifest.proxies as any[]) {
  const key = `${p.kind}-${p.id}`;
  if (only && !key.startsWith(only)) { continue; }
  let spec: Parameters<typeof render>[0] | null = null;
  if (p.kind === 'hair') {
    const g = hairInfo(p.id).fit === 'male' ? 'male' : hairInfo(p.id).fit === 'female' ? 'female' : 'male';
    spec = { config: { ...neutral, ...BODY[g], hair: p.id, hairColor: '#5a3a22', clothes: BODY[g].clothes }, shot: 'head', yaw: 0.55 };
  } else if (p.kind === 'eyebrows') {
    spec = { config: { ...neutral, ...BODY.female, hair: null, eyebrows: p.id, eyebrowColor: '#2a1c14' }, shot: 'brows', yaw: 0 };
  } else if (p.kind === 'eyelashes') {
    spec = { config: { ...neutral, ...BODY.female, hair: null, eyelashes: p.id }, shot: 'eye', yaw: 0.75 };
  } else if (p.kind === 'clothes') {
    const info = clothingInfo(p.id);
    const g = info.fit === 'female' ? 'female' : 'male';
    const base = BODY[g];
    if (info.slot === 'outfit') spec = { config: { ...neutral, ...base, clothes: [p.id, base.clothes[1]] }, shot: 'body', yaw: 0.3 };
    else if (info.slot === 'shoes') spec = { config: { ...neutral, ...base, clothes: [base.clothes[0], p.id] }, shot: 'feet', yaw: 1.0 };
    else spec = { config: { ...neutral, ...base, hair: info.slot === 'headwear' ? base.hair : null, clothes: [...base.clothes, p.id] }, shot: 'head', yaw: 0.5 };
  }
  if (!spec) continue;
  p.preview = await save(await render({ ...spec, size: spec.shot === 'brows' || spec.shot === 'eye' ? SIZE : 384 }), `previews/${key}.webp`, spec.shot !== 'brows' && spec.shot !== 'eye');
  n++;
  process.stdout.write(`\r${n} item previews`);
}
console.log();

// Skin swatches: the tone as it renders (forehead/cheek patch of a frontal close-up).
if (!only || only === 'skins') {
  for (const s of manifest.skins as any[]) {
    const male = s.id.includes('_male');
    const png = await render({ config: { ...neutral, ...(male ? BODY.male : BODY.female), skin: s.id, hair: null, eyebrows: null }, shot: 'head', yaw: 0, size: 96 });
    // forehead band: x 40..56%, y 30..40% of the head shot
    const { data, info } = await sharp(png).extract({ left: 38, top: 26, width: 20, height: 10 }).raw().toBuffer({ resolveWithObject: true });
    const c = [0, 0, 0];
    let k = 0;
    for (let i = 0; i < data.length; i += info.channels) if (info.channels < 4 || data[i + 3] > 250) { c[0] += data[i]; c[1] += data[i + 1]; c[2] += data[i + 2]; k++; }
    s.swatch = '#' + c.map((v) => Math.round(v / Math.max(1, k)).toString(16).padStart(2, '0')).join('');
  }
  console.log('skin swatches:', (manifest.skins as any[]).map((s) => s.swatch).join(' '));
}

// Eye previews: round crop of the iris from the eye texture, and its mean color.
if (!only || only === 'eyes') {
  manifest.eyeOptions = {};
  for (const id of manifest.eyes) {
    const src = path.join(OUT, `eyes/${id}.webp`);
    const meta = await sharp(src).metadata();
    const W = meta.width!, crop = Math.round(W * 0.2);
    // the iris of the lower-left eyeball sits at about (29%, 70%) of the texture
    const left = Math.round(W * 0.293 - crop / 2), top = Math.round(W * 0.703 - crop / 2);
    const iris = sharp(src).extract({ left, top, width: crop, height: crop }).resize(96, 96);
    const mask = Buffer.from(`<svg width="96" height="96"><circle cx="48" cy="48" r="47" fill="#fff"/></svg>`);
    const preview = `previews/eyes-${id}.webp`;
    writeFileSync(path.join(OUT, preview), await iris.clone().composite([{ input: mask, blend: 'dest-in' }]).webp({ quality: 85 }).toBuffer());
    // iris ring color: annulus between 35% and 75% of the radius
    const { data } = await iris.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const c = [0, 0, 0];
    let k = 0;
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const r = Math.hypot(x - 48, y - 48) / 48;
      if (r < 0.35 || r > 0.62) continue;
      const i = (y * 96 + x) * 3;
      c[0] += data[i]; c[1] += data[i + 1]; c[2] += data[i + 2]; k++;
    }
    manifest.eyeOptions[id] = { swatch: '#' + c.map((v) => Math.round(v / k).toString(16).padStart(2, '0')).join(''), preview };
  }
  console.log('eye swatches:', Object.values(manifest.eyeOptions as Record<string, any>).map((e) => e.swatch).join(' '));
}

writeFileSync(manifestPath, JSON.stringify(manifest));
await browser.close();
await server.close();
