// A fake commissioned art kit for tests and for trying the importer without real art: a few parts of
// the procedural package (assets/cartoon, 2x) placed back on full 800x1280 canvases under the
// artist's naming, recoloured, moved up 16 units (so its pivots differ from the chibi constants),
// with a per-build head, an outline 'under' layer, facial_hair naming, pivots.json and items.json.
//
//   npx tsx tools/cartoon/make-test-kit.mts <out dir>
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { CartoonManifest, PIVOTS } from '../../src/cartoon/model';

export const KIT_SHIFT = -16; // canvas units
const SRC_DIR = path.resolve(import.meta.dirname, '../../assets/cartoon');

/** artist key -> key in the procedural package */
const PARTS: Record<string, string> = {
  'ears.back': 'ears.back', 'ears.front': 'ears.front',
  'head.female': 'head', 'head.male': 'head',
  'eyes.round': 'eyes.round', 'eyes.lashes': 'eyes.lashes', 'brows.soft': 'brows.soft', 'brows.straight': 'brows.straight',
  'nose.button': 'nose.button', 'mouth.smile': 'mouth.smile', 'mouth.neutral': 'mouth.neutral',
  'hair.long_wavy.back': 'hair.long_wavy.back', 'hair.long_wavy.front': 'hair.long_wavy.front',
  'hair.short_crop.back': 'hair.short_crop.back', 'hair.short_crop.front': 'hair.short_crop.front',
  'facial_hair.beard': 'facialHair.beard', 'glasses.round': 'glasses.round',
  'headwear.hijab.female': 'headwear.hijab.female',
};
for (const b of ['female', 'male']) {
  for (const band of ['back', 'mid', 'front']) {
    PARTS[`body.${b}.${band}`] = `body.${b}.${band}`;
    for (const g of ['top.tshirt', 'bottom.jeans', 'shoes.sneakers']) PARTS[`${g}.${b}.${band}`] = `${g}.${b}.${band}`;
  }
}
for (const band of ['back', 'mid', 'front']) PARTS[`outfit.abaya.female.${band}`] = `outfit.abaya.female.${band}`;

export const hasSourceArt = () => existsSync(path.join(SRC_DIR, 'manifest.json'));

export async function makeTestKit(out: string) {
  const m: CartoonManifest = JSON.parse(readFileSync(path.join(SRC_DIR, 'manifest.json'), 'utf8'));
  if (existsSync(out) && readdirSync(out).length && !existsSync(path.join(out, 'pivots.json'))) throw new Error(`${out} is not empty and not a test kit; not overwriting it`);
  rmSync(out, { recursive: true, force: true });
  const W = m.canvas.w * 2, H = m.canvas.h * 2, dy = KIT_SHIFT * 2;
  const blank = () => sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  for (const src of Object.keys(m.layers)) {
    mkdirSync(path.join(out, src), { recursive: true });
    for (const [key, from] of Object.entries(PARTS)) {
      const files = m.layers[src][from];
      if (!files) continue;
      const male = key === 'head.male';
      for (const [n, f] of files.entries()) {
        let img = sharp(path.join(SRC_DIR, '2x', f.f));
        // recolour the shading so the kit is visibly not the procedural art
        if (f.kind === 'detail') img = img.modulate({ hue: male ? 200 : 25, saturation: 1.25 });
        const layer = await img.png().toBuffer();
        const top = f.y * 2 + dy;
        const place = (input: Buffer) => blank().composite([{ input, left: f.x * 2, top }]).png().toBuffer();
        writeFileSync(path.join(out, src, `${key}.${n}.${f.kind}.png`), await place(layer));
        // heads get an ink outline drawn under the skin tint
        if (key.startsWith('head.') && f.kind === 'tint') {
          const meta = await sharp(layer).metadata();
          const pad = 6;
          const padded = await sharp(layer).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
          const alpha = await sharp(padded).extractChannel('alpha').blur(2.5).linear(4, 0).toBuffer();
          const ink = await sharp({ create: { width: meta.width! + 2 * pad, height: meta.height! + 2 * pad, channels: 3, background: male ? '#1d2a44' : '#3b2418' } })
            .joinChannel(alpha).png().toBuffer();
          writeFileSync(path.join(out, src, `${key}.${n}.under.png`), await blank().composite([{ input: ink, left: f.x * 2 - pad, top: top - pad }]).png().toBuffer());
        }
      }
    }
  }
  // registration sheet, in art pixels; feet are left out (the importer finds them)
  const px = (p: [number, number]): [number, number] => [Math.round(p[0] * 2), Math.round((p[1] + KIT_SHIFT) * 2)];
  const pivots: Record<string, unknown> = {};
  for (const [src, p] of Object.entries(m.pivots)) {
    const [ex, ey] = px(p.eyes);
    pivots[src] = { neck: px(PIVOTS.neck), head: px(PIVOTS.head), eyes: [[ex - 40, ey], [ex + 40, ey]], nose: px(p.nose), mouth: px(p.mouth) };
  }
  writeFileSync(path.join(out, 'pivots.json'), JSON.stringify(pivots, null, 2));
  writeFileSync(path.join(out, 'items.json'), JSON.stringify({
    hair: { long_wavy: { fit: 'female', coversEars: true }, short_crop: { fit: 'male' } },
    eyes: { lashes: { fit: 'female' } },
    facial_hair: { beard: { fit: 'male' } },
    headwear: { hijab: { fit: 'female', hidesHair: true, modest: true, color: '#3b4a6b' } },
    top: { tshirt: { color: '#3f7fd6' } },
    bottom: { jeans: { color: '#3d5a8a', modest: true } },
    outfit: { abaya: { modest: true, color: '#1f1f24' } },
    shoes: { sneakers: { color: '#f4f4f4' } },
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = process.argv[2];
  if (!out) { console.error('usage: npx tsx tools/cartoon/make-test-kit.mts <out dir>'); process.exit(2); }
  if (!hasSourceArt()) { console.error('assets/cartoon is missing: run npm run build:cartoon first'); process.exit(1); }
  await makeTestKit(path.resolve(out));
  console.log(`test kit -> ${out}`);
}
