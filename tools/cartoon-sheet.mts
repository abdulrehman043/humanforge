// Contact sheet of cartoon looks from the built PNG layers (same compositing as the app):
//   npx tsx tools/cartoon-sheet.mts out.png
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CartoonConfig, CartoonManifest, DEFAULT_CARTOON, cartoonLayers } from '../src/cartoon/model';

const dir = path.resolve(import.meta.dirname, '../assets/cartoon');
const m: CartoonManifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
async function render(c: CartoonConfig, viewId: string, d = 1) {
  const v = m.views.find((x) => x.id === viewId)!;
  const parts: sharp.OverlayOptions[] = [];
  for (const l of cartoonLayers(m, c, v.src)) {
    const file = path.join(dir, `${d}x`, l.file.f);
    const input = l.file.kind === 'tint'
      ? await sharp({ create: { ...(await sharp(file).metadata() as any), channels: 4, background: l.color! } }).composite([{ input: file, blend: 'dest-in' }]).png().toBuffer()
      : await sharp(file).png().toBuffer();
    parts.push({ input, left: l.file.x * d, top: l.file.y * d });
  }
  let img = sharp({ create: { width: 400 * d, height: 640 * d, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(parts);
  if (v.mirror) img = sharp(await img.png().toBuffer()).flop();
  return img.png().toBuffer();
}
const looks: [Partial<CartoonConfig>, string][] = [
  [{}, 'front'],
  [{ headwear: 'hijab', headwearColor: '#3b4a6b', outfit: 'abaya', outfitColor: '#1f1f24', shoes: 'flats', shoesColor: '#2b2b2b', skin: '#c68a62', eyes: 'almond' }, 'three_r'],
  [{ build: 'male', hair: 'side_part', eyes: 'round', brows: 'thick', facialHair: 'beard', top: 'hoodie', topColor: '#5c6b7a', bottom: 'trousers', bottomColor: '#3b3b44', skin: '#8d5a3b' }, 'front'],
  [{ headwear: 'amira', headwearColor: '#d9c7b0', outfit: 'maxi_dress', outfitColor: '#b04a5a', shoes: 'flats', shoesColor: '#2b2b2b', skin: '#f1c7a5' }, 'three_l'],
  [{ build: 'male', hair: 'short_crop', facialHair: 'full_beard', headwear: 'kufi', headwearColor: '#f2f0ea', outfit: 'jalabiya', outfitColor: '#f1ede4', shoes: 'sandals', shoesColor: '#a8754a', skin: '#c68a62', eyes: 'round', brows: 'straight' }, 'front'],
  [{ hair: 'bun', hairColor: '#7a4a26', browColor: '#7a4a26', top: 'blouse', topColor: '#f2efe6', bottom: 'long_skirt', bottomColor: '#2f4f4f', shoes: 'flats', glasses: 'round', skin: '#e8b48f' }, 'side_r'],
  [{ build: 'male', hair: 'afro', hairColor: '#141010', top: 'tshirt', topColor: '#e07a3f', bottom: 'shorts', bottomColor: '#c7b48a', skin: '#4f2c1c', eyes: 'round', brows: 'straight', mouth: 'grin' }, 'three_r'],
];
const tiles = await Promise.all(looks.map(([c, v]) => render({ ...DEFAULT_CARTOON, ...c, shape: {} } as CartoonConfig, v)));
await sharp({ create: { width: 300 * looks.length, height: 520, channels: 4, background: '#eef0f4' } })
  .composite(await Promise.all(tiles.map(async (t, i) => ({ input: await sharp(t).extract({ left: 30, top: 20, width: 340, height: 600 }).resize(300, 529).extract({ left: 0, top: 0, width: 300, height: 520 }).png().toBuffer(), left: i * 300, top: 0 }))))
  .png().toFile(process.argv[2] ?? 'demo/cartoon-preview.png');
