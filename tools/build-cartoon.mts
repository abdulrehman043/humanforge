// Builds the cartoon avatar package: trimmed PNG layers for every part at three angles
// (front / three-quarter / side; the app mirrors them for the other side) and two densities,
// a manifest, and preview tiles for every option.
//
//   npm run build:cartoon            -> assets/cartoon/
//
// All art is generated in code (tools/cartoon/*), so it is original and free to use (CC0).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { H, W, headPoint, rad } from './cartoon/geom';
import {
  BROW_STYLES, EYE_STYLES, FACIAL_HAIR, GLASSES, HAIR_STYLES, MOUTH_STYLES, NOSE_STYLES, SubLayer,
  brows, ears, eyes, facialHair, glasses, hairBack, hairFront, head, mouth, nose,
} from './cartoon/head';
import { Build, GARMENTS, HEADWEAR, bodySkin } from './cartoon/body';
import { svgDoc } from './cartoon/compose';
import { CartoonConfig, CartoonItem, CartoonItemSlot, CartoonLayerFile, CartoonManifest, DEFAULT_CARTOON, cartoonLayers } from '../src/cartoon/model';

const OUT = path.resolve(import.meta.dirname, '../assets/cartoon');
const DENSITIES = [1, 2];
const SOURCES = [{ src: 'front', yaw: 0 }, { src: 'three', yaw: 45 }, { src: 'side', yaw: 90 }];
const BUILDS: Build[] = ['female', 'male'];
const fits = (fit: string, b: Build) => fit === 'unisex' || fit === b;

rmSync(OUT, { recursive: true, force: true });
for (const d of DENSITIES) for (const s of SOURCES) mkdirSync(path.join(OUT, `${d}x`, s.src), { recursive: true });
mkdirSync(path.join(OUT, 'previews'), { recursive: true });

/** Rasterize one sub-layer at every density, trimmed to its visible pixels. */
async function raster(svg: string, file: string, kind: SubLayer['kind']): Promise<Omit<CartoonLayerFile, 'f' | 'kind' | 'slot'> | null> {
  let box: { x: number; y: number; w: number; h: number } | null = null;
  for (const d of DENSITIES) {
    const { data, info } = await sharp(Buffer.from(svgDoc(svg, W * d, H * d))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (!box) {
      // bounding box of visible pixels in canvas units, padded by 1 unit and snapped to whole units
      let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) return null;
      const u = (v: number) => v / d;
      const bx = Math.max(0, Math.floor(u(x0)) - 1), by = Math.max(0, Math.floor(u(y0)) - 1);
      box = { x: bx, y: by, w: Math.min(W, Math.ceil(u(x1 + 1)) + 1) - bx, h: Math.min(H, Math.ceil(u(y1 + 1)) + 1) - by };
    }
    const img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left: box.x * d, top: box.y * d, width: box.w * d, height: box.h * d });
    // tint masks are white + alpha: a palette PNG is lossless here and tiny; detail keeps full RGBA (gradients)
    const png = kind === 'tint'
      ? await img.png({ palette: true, colours: 64, compressionLevel: 9, effort: 8 }).toBuffer()
      : await img.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    writeFileSync(path.join(OUT, `${d}x`, file), png);
  }
  return box;
}

const layers: CartoonManifest['layers'] = {};
const pivots: CartoonManifest['pivots'] = {};
let count = 0;
for (const { src, yaw: deg } of SOURCES) {
  const yaw = rad(deg);
  const lib: Record<string, CartoonLayerFile[]> = (layers[src] = {});
  const add = async (key: string, subs: SubLayer[]) => {
    const files: CartoonLayerFile[] = [];
    for (const [i, s] of subs.entries()) {
      if (!s.svg.trim()) continue;
      const f = `${src}/${key}.${i}.png`;
      const box = await raster(s.svg, f, s.kind);
      if (!box) continue;
      files.push({ f, kind: s.kind, ...(s.slot ? { slot: s.slot } : {}), ...box });
      count++;
    }
    if (files.length) lib[key] = files;
  };
  const e = ears(yaw);
  await add('ears.back', e.back);
  await add('ears.front', e.front);
  await add('head', head(yaw));
  for (const s of EYE_STYLES) await add(`eyes.${s}`, eyes(yaw, s));
  for (const s of BROW_STYLES) await add(`brows.${s}`, brows(yaw, s));
  for (const s of NOSE_STYLES) await add(`nose.${s}`, nose(yaw, s));
  for (const s of MOUTH_STYLES) await add(`mouth.${s}`, mouth(yaw, s));
  for (const s of FACIAL_HAIR) await add(`facialHair.${s}`, facialHair(yaw, s));
  for (const s of GLASSES) await add(`glasses.${s}`, glasses(yaw, s));
  for (const h of HAIR_STYLES) { await add(`hair.${h.id}.back`, hairBack(yaw, h)); await add(`hair.${h.id}.front`, hairFront(yaw, h)); }
  for (const b of BUILDS) {
    const skin = bodySkin(yaw, b);
    for (const band of ['back', 'mid', 'front'] as const) await add(`body.${b}.${band}`, skin[band]);
    for (const g of GARMENTS) {
      if (!fits(g.fit, b)) continue;
      const parts = g.draw(yaw, b);
      for (const band of ['back', 'mid', 'front'] as const) await add(`${g.slot}.${g.id}.${b}.${band}`, parts[band]);
    }
    for (const h of HEADWEAR) if (fits(h.fit, b)) await add(`headwear.${h.id}.${b}`, h.draw(yaw, b));
  }
  const eyeC = headPoint(0, -0.1, yaw), noseC = headPoint(0, -0.34, yaw), mouthC = headPoint(0, -0.56, yaw);
  pivots[src] = { eyes: [eyeC.x, eyeC.y], nose: [noseC.x, noseC.y], mouth: [mouthC.x, mouthC.y], brows: [eyeC.x, eyeC.y - 30] };
  console.log(`${src}: ${Object.keys(lib).length} parts`);
}

const item = (id: string, fit: CartoonItem['fit'] = 'unisex', extra: Partial<CartoonItem> = {}): CartoonItem => ({ id, fit, ...extra });
const FEMALE_FACE = new Set(['lashes', 'arched', 'thin']);
const items: CartoonManifest['items'] = {
  hair: HAIR_STYLES.map((h) => item(h.id, h.fit, { coversEars: !!h.locks })),
  eyes: EYE_STYLES.map((s) => item(s, FEMALE_FACE.has(s) ? 'female' : 'unisex')),
  brows: BROW_STYLES.map((s) => item(s, FEMALE_FACE.has(s) ? 'female' : s === 'thick' ? 'male' : 'unisex')),
  nose: NOSE_STYLES.map((s) => item(s)),
  mouth: MOUTH_STYLES.map((s) => item(s)),
  facialHair: FACIAL_HAIR.map((s) => item(s, 'male')),
  glasses: GLASSES.map((s) => item(s)),
  headwear: HEADWEAR.map((h) => item(h.id, h.fit, { hidesHair: h.hidesHair, modest: h.modest, color: h.color })),
  top: GARMENTS.filter((g) => g.slot === 'top').map((g) => item(g.id, g.fit, { color: g.color, modest: g.modest })),
  bottom: GARMENTS.filter((g) => g.slot === 'bottom').map((g) => item(g.id, g.fit, { color: g.color, modest: g.modest })),
  outfit: GARMENTS.filter((g) => g.slot === 'outfit').map((g) => item(g.id, g.fit, { color: g.color, modest: g.modest })),
  shoes: GARMENTS.filter((g) => g.slot === 'shoes').map((g) => item(g.id, g.fit, { color: g.color })),
};

const manifest: CartoonManifest = {
  format: 'humanforge-cartoon', version: 1, canvas: { w: W, h: H }, densities: DENSITIES,
  views: [
    { id: 'side_l', src: 'side', mirror: true, yaw: -90 },
    { id: 'three_l', src: 'three', mirror: true, yaw: -45 },
    { id: 'front', src: 'front', mirror: false, yaw: 0 },
    { id: 'three_r', src: 'three', mirror: false, yaw: 45 },
    { id: 'side_r', src: 'side', mirror: false, yaw: 90 },
  ],
  layers, pivots, items, builds: BUILDS,
};

// ---------------------------------------------------------------- previews (composited from the PNG layers, like the app)
/** Composite a config from the built layers (tint = solid color through the layer's alpha). */
export async function composite(c: CartoonConfig, src: string, d: number): Promise<Buffer> {
  const parts: sharp.OverlayOptions[] = [];
  for (const l of cartoonLayers(manifest, c, src)) {
    const file = path.join(OUT, `${d}x`, l.file.f);
    let input: Buffer;
    if (l.file.kind === 'tint') {
      const meta = await sharp(file).metadata();
      input = await sharp({ create: { width: meta.width!, height: meta.height!, channels: 4, background: l.color! } })
        .composite([{ input: file, blend: 'dest-in' }]).png().toBuffer();
    } else input = await sharp(file).png().toBuffer();
    parts.push({ input, left: l.file.x * d, top: l.file.y * d });
  }
  return sharp({ create: { width: W * d, height: H * d, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(parts).png().toBuffer();
}

const BASE: Record<Build, CartoonConfig> = {
  female: { ...DEFAULT_CARTOON },
  male: { ...DEFAULT_CARTOON, build: 'male', hair: 'side_part', eyes: 'round', brows: 'straight', top: 'tshirt', topColor: '#3f7fd6', bottom: 'jeans', shoes: 'sneakers' },
};
const crops = {
  head: { left: 70, top: 40, width: 260, height: 260 },
  face: { left: 120, top: 110, width: 160, height: 160 },
  body: { left: 40, top: 30, width: 320, height: 600 },
  feet: { left: 130, top: 540, width: 140, height: 90 },
};
async function preview(slot: CartoonItemSlot, it: CartoonItem) {
  const b: Build = it.fit === 'male' ? 'male' : 'female';
  const c: CartoonConfig = { ...BASE[b] };
  let crop = crops.head;
  switch (slot) {
    case 'hair': c.hair = it.id; break;
    case 'headwear': c.headwear = it.id; c.headwearColor = it.color ?? c.headwearColor; break;
    case 'eyes': c.eyes = it.id; crop = crops.face; break;
    case 'brows': c.brows = it.id; crop = crops.face; break;
    case 'nose': c.nose = it.id; crop = crops.face; break;
    case 'mouth': c.mouth = it.id; crop = crops.face; break;
    case 'glasses': c.glasses = it.id; crop = crops.face; break;
    case 'facialHair': c.facialHair = it.id; c.hair = 'short_crop'; break;
    case 'top': c.top = it.id; c.topColor = it.color!; c.outfit = null; crop = crops.body; break;
    case 'bottom': c.bottom = it.id; c.bottomColor = it.color!; c.outfit = null; crop = crops.body; break;
    case 'outfit': c.outfit = it.id; c.outfitColor = it.color!; crop = crops.body; break;
    case 'shoes': c.shoes = it.id; c.shoesColor = it.color!; crop = crops.feet; break;
  }
  if (slot === 'outfit' && it.modest) c.headwear = null;
  const full = await composite(c, 'front', 1);
  const tile = await sharp(full).extract(crop).resize(160, Math.round((160 * crop.height) / crop.width)).webp({ quality: 86, alphaQuality: 90 }).toBuffer();
  const rel = `previews/${slot}-${it.id}.webp`;
  writeFileSync(path.join(OUT, rel), tile);
  it.preview = rel;
}
for (const [slot, list] of Object.entries(items) as [CartoonItemSlot, CartoonItem[]][]) for (const it of list) await preview(slot, it);

// section icons for the editor's tab bar: tight crops of the base look
mkdirSync(path.join(OUT, 'icons'), { recursive: true });
{
  const full = await composite({ ...BASE.female, shape: {} }, 'front', 2);
  const male = await composite({ ...BASE.male, facialHair: 'beard', glasses: 'round' }, 'front', 2);
  const hijab = await composite({ ...BASE.female, headwear: 'hijab', outfit: 'abaya', outfitColor: '#1f1f24' }, 'front', 2);
  const box = (x: number, y: number, w: number, h: number) => ({ left: x * 2, top: y * 2, width: w * 2, height: h * 2 });
  const icons: Record<string, [Buffer, ReturnType<typeof box>]> = {
    face: [full, box(95, 60, 210, 210)], eyes: [full, box(140, 150, 120, 60)], brows: [full, box(140, 125, 120, 60)],
    nose: [full, box(170, 175, 60, 50)], mouth: [full, box(165, 200, 70, 50)], hair: [full, box(80, 40, 240, 240)],
    facialHair: [male, box(110, 150, 180, 140)], glasses: [male, box(130, 140, 140, 70)], headwear: [hijab, box(80, 40, 240, 240)],
    outfit: [hijab, box(100, 260, 200, 340)], top: [full, box(110, 270, 180, 170)], bottom: [full, box(130, 400, 140, 200)],
    shoes: [full, box(140, 560, 120, 60)], body: [full, box(60, 30, 280, 590)],
  };
  manifest.icons = {};
  for (const [k, [img, b]] of Object.entries(icons)) {
    const rel = `icons/${k}.webp`;
    const side = Math.max(b.width, b.height);
    const square = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp(img).extract(b).png().toBuffer(), left: Math.round((side - b.width) / 2), top: Math.round((side - b.height) / 2) }]).png().toBuffer();
    writeFileSync(path.join(OUT, rel), await sharp(square).resize(96, 96).webp({ quality: 88 }).toBuffer());
    manifest.icons[k] = rel;
  }
}

writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`cartoon: ${count} layers x ${DENSITIES.length} densities`);
