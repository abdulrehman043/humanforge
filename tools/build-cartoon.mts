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
import { writeIcons, writePreviews } from './cartoon/finish.mts';
import { CartoonConfig, CartoonItem, CartoonLayerFile, CartoonManifest, DEFAULT_CARTOON } from '../src/cartoon/model';

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
await writePreviews(manifest, OUT, BASE, crops, (slot, it, c) => {
  if (slot === 'facialHair') c.hair = 'short_crop';
  if (slot === 'outfit' && it.modest) c.headwear = null;
});

// section icons for the editor's tab bar: tight crops of the base look
{
  const full = { ...BASE.female, shape: {} };
  const male = { ...BASE.male, facialHair: 'beard', glasses: 'round' };
  const hijab = { ...BASE.female, headwear: 'hijab', outfit: 'abaya', outfitColor: '#1f1f24' };
  const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
  await writeIcons(manifest, OUT, {
    face: [full, box(95, 60, 210, 210)], eyes: [full, box(140, 150, 120, 60)], brows: [full, box(140, 125, 120, 60)],
    nose: [full, box(170, 175, 60, 50)], mouth: [full, box(165, 200, 70, 50)], hair: [full, box(80, 40, 240, 240)],
    facialHair: [male, box(110, 150, 180, 140)], glasses: [male, box(130, 140, 140, 70)], headwear: [hijab, box(80, 40, 240, 240)],
    outfit: [hijab, box(100, 260, 200, 340)], top: [full, box(110, 270, 180, 170)], bottom: [full, box(130, 400, 140, 200)],
    shoes: [full, box(140, 560, 120, 60)], body: [full, box(60, 30, 280, 590)],
  });
}

writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`cartoon: ${count} layers x ${DENSITIES.length} densities`);
