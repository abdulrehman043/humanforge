// Shared last steps of a cartoon package build: composite looks from the built PNG layers (like the
// app does), write a preview tile per item and the editor's section icons. Used by build-cartoon
// (procedural art) and import-cartoon-art (commissioned art).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { CartoonBuild, CartoonConfig, CartoonItem, CartoonItemSlot, CartoonManifest, CartoonRect, cartoonLayers } from '../../src/cartoon/model';

/** Composite a config from the built layers (tint = solid color through the layer's alpha). */
export async function composite(manifest: CartoonManifest, dir: string, c: CartoonConfig, src: string, d: number): Promise<Buffer> {
  const parts: OverlayOptions[] = [];
  for (const l of cartoonLayers(manifest, c, src)) {
    const file = path.join(dir, `${d}x`, l.file.f);
    let input: Buffer;
    if (l.file.kind === 'tint') {
      const meta = await sharp(file).metadata();
      input = await sharp({ create: { width: meta.width!, height: meta.height!, channels: 4, background: l.color! } })
        .composite([{ input: file, blend: 'dest-in' }]).png().toBuffer();
    } else input = await sharp(file).png().toBuffer();
    parts.push({ input, left: l.file.x * d, top: l.file.y * d });
  }
  const { w, h } = manifest.canvas;
  return sharp({ create: { width: w * d, height: h * d, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(parts).png().toBuffer();
}

type Crop = { left: number; top: number; width: number; height: number };
export interface PreviewCrops { head: Crop; face: Crop; body: Crop; feet: Crop }

/**
 * One 160 px wide webp tile per item (front view, 1x), written to previews/ and set as item.preview.
 * `tweak` adjusts the look per item (e.g. a short haircut under beards).
 */
export async function writePreviews(
  manifest: CartoonManifest, dir: string, base: Record<CartoonBuild, CartoonConfig>, crops: PreviewCrops,
  tweak: (slot: CartoonItemSlot, it: CartoonItem, c: CartoonConfig) => void = () => {},
) {
  mkdirSync(path.join(dir, 'previews'), { recursive: true });
  for (const [slot, list] of Object.entries(manifest.items) as [CartoonItemSlot, CartoonItem[]][]) {
    for (const it of list) {
      const b: CartoonBuild = it.fit === 'male' ? 'male' : 'female';
      const c: CartoonConfig = { ...base[b] };
      let crop = crops.head;
      switch (slot) {
        case 'hair': c.hair = it.id; break;
        case 'headwear': c.headwear = it.id; c.headwearColor = it.color ?? c.headwearColor; break;
        case 'eyes': c.eyes = it.id; crop = crops.face; break;
        case 'brows': c.brows = it.id; crop = crops.face; break;
        case 'nose': c.nose = it.id; crop = crops.face; break;
        case 'mouth': c.mouth = it.id; crop = crops.face; break;
        case 'glasses': c.glasses = it.id; crop = crops.face; break;
        case 'facialHair': c.facialHair = it.id; break;
        case 'top': c.top = it.id; c.topColor = it.color ?? c.topColor; c.outfit = null; crop = crops.body; break;
        case 'bottom': c.bottom = it.id; c.bottomColor = it.color ?? c.bottomColor; c.outfit = null; crop = crops.body; break;
        case 'outfit': c.outfit = it.id; c.outfitColor = it.color ?? c.outfitColor; crop = crops.body; break;
        case 'shoes': c.shoes = it.id; c.shoesColor = it.color ?? c.shoesColor; crop = crops.feet; break;
      }
      tweak(slot, it, c);
      const full = await composite(manifest, dir, c, 'front', 1);
      const tile = await sharp(full).extract(crop).resize(160, Math.round((160 * crop.height) / crop.width)).webp({ quality: 86, alphaQuality: 90 }).toBuffer();
      const rel = `previews/${slot}-${it.id}.webp`;
      writeFileSync(path.join(dir, rel), tile);
      it.preview = rel;
    }
  }
}

/** Section icons for the editor's tab bar: square 96 px crops (rects in canvas units) of given looks. */
export async function writeIcons(manifest: CartoonManifest, dir: string, icons: Record<string, [CartoonConfig, CartoonRect]>) {
  mkdirSync(path.join(dir, 'icons'), { recursive: true });
  const renders = new Map<CartoonConfig, Buffer>();
  manifest.icons = {};
  for (const [k, [look, r]] of Object.entries(icons)) {
    if (!renders.has(look)) renders.set(look, await composite(manifest, dir, look, 'front', 2));
    const b = { left: r.x * 2, top: r.y * 2, width: r.w * 2, height: r.h * 2 };
    const rel = `icons/${k}.webp`;
    const side = Math.max(b.width, b.height);
    const square = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp(renders.get(look)!).extract(b).png().toBuffer(), left: Math.round((side - b.width) / 2), top: Math.round((side - b.height) / 2) }]).png().toBuffer();
    writeFileSync(path.join(dir, rel), await sharp(square).resize(96, 96).webp({ quality: 88 }).toBuffer());
    manifest.icons[k] = rel;
  }
}
