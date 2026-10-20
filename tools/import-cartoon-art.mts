// Imports a commissioned 2D art kit into a humanforge cartoon package (same format as build-cartoon:
// trimmed 1x/2x PNG layers, manifest.json, preview tiles, section icons).
//
//   npm run import:cartoon -- <kit dir> [--out assets/cartoon] [--pivots <kit>/pivots.json] [--items <kit>/items.json] [--check]
//
// The kit: full-canvas 800x1280 PNGs (transparent background) in front/, three/ and side/, named
// <part key>.<n>.<kind>.png with kind = tint (pure white mask, coloured in the app) | detail (drawn
// over it as-is) | under (drawn as-is beneath it). Sub-layers paint by n, and within one n as
// under, tint, detail. Part keys:
//   body.<female|male>.<back|mid|front>   head.<female|male>   ears[.<female|male>].<back|front>
//   eyes|brows|nose|mouth|facial_hair|glasses.<style>   hair.<style>.<back|front>
//   headwear.<style>.<female|male>   top|bottom|outfit|shoes.<style>.<female|male>.<back|mid|front>
//
// pivots.json (from the artist's registration sheet, art pixels; see README "Using commissioned art"):
//   { "front": { "neck": [x,y], "head": [x,y], "eyes": [[x,y],[x,y]], "nose": [x,y], "mouth": [x,y] }, "three": …, "side": … }
// items.json (maintained by you): { "<slot>": { "<style>": { "fit", "modest", "color", "hidesHair", "coversEars" } } }
//
// Everything is validated before anything is written; problems are listed and the import exits 1.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp, { type Metadata, type OutputInfo } from 'sharp';
import {
  CartoonBuild, CartoonConfig, CartoonItem, CartoonItemSlot, CartoonLayerFile, CartoonManifest, CartoonPivots, CartoonRect, ColorSlot, DEFAULT_CARTOON,
} from '../src/cartoon/model';
import { writeIcons, writePreviews } from './cartoon/finish.mts';

/** Art canvas in pixels; it is the 2x density of a 400x640 unit canvas. */
export const ART = { w: 800, h: 1280 };
const SCALE = 2;
const CANVAS = { w: ART.w / SCALE, h: ART.h / SCALE };
const DENSITIES = [1, 2];
const SOURCES = [{ src: 'front', yaw: 0 }, { src: 'three', yaw: 45 }, { src: 'side', yaw: 90 }];
const BUILDS: CartoonBuild[] = ['female', 'male'];
const KINDS = ['under', 'tint', 'detail'] as const;
type Kind = (typeof KINDS)[number];
const WEAR = ['top', 'bottom', 'outfit', 'shoes'] as const;
const FACE = ['eyes', 'brows', 'nose', 'mouth', 'facialHair', 'glasses'] as const;
type Pt = [number, number];

/** Colour slot of a part's tint layers. */
const TINT_SLOT: Record<string, ColorSlot | null> = {
  body: 'skin', head: 'skin', ears: 'skin', nose: 'skin', eyes: 'eye', brows: 'brow', mouth: 'lip', hair: 'hair', facialHair: 'facialHair',
  glasses: null, headwear: 'headwear', top: 'top', bottom: 'bottom', outfit: 'outfit', shoes: 'shoes',
};

export interface ParsedKey { key: string; part: string; slot?: CartoonItemSlot; style?: string; build?: CartoonBuild }

const S = '[a-z0-9_]+';
const B = '(female|male)';
const BAND = '(back|mid|front)';
/** Parse an artist part key (e.g. facial_hair.beard) into the manifest key (facialHair.beard). */
export function parsePartKey(raw: string): ParsedKey | null {
  let r: RegExpMatchArray | null;
  if ((r = raw.match(new RegExp(`^body\\.${B}\\.${BAND}$`)))) return { key: raw, part: 'body', build: r[1] as CartoonBuild };
  if ((r = raw.match(new RegExp(`^head\\.${B}$`)))) return { key: raw, part: 'head', build: r[1] as CartoonBuild };
  if (/^ears\.(back|front)$/.test(raw)) return { key: raw, part: 'ears' };
  if ((r = raw.match(new RegExp(`^ears\\.${B}\\.(back|front)$`)))) return { key: raw, part: 'ears', build: r[1] as CartoonBuild };
  if ((r = raw.match(new RegExp(`^(eyes|brows|nose|mouth|facial_hair|glasses)\\.(${S})$`)))) {
    const slot = (r[1] === 'facial_hair' ? 'facialHair' : r[1]) as CartoonItemSlot;
    return { key: `${slot}.${r[2]}`, part: slot, slot, style: r[2] };
  }
  if ((r = raw.match(new RegExp(`^hair\\.(${S})\\.(back|front)$`)))) return { key: raw, part: 'hair', slot: 'hair', style: r[1] };
  if ((r = raw.match(new RegExp(`^headwear\\.(${S})\\.${B}$`)))) return { key: raw, part: 'headwear', slot: 'headwear', style: r[1], build: r[2] as CartoonBuild };
  if ((r = raw.match(new RegExp(`^(top|bottom|outfit|shoes)\\.(${S})\\.${B}\\.${BAND}$`))))
    return { key: raw, part: r[1], slot: r[1] as CartoonItemSlot, style: r[2], build: r[3] as CartoonBuild };
  return null;
}

export interface ImportOptions {
  kit: string;
  out: string;
  pivots?: string;
  items?: string;
  /** validate only, write nothing */
  check?: boolean;
  log?: (msg: string) => void;
}
export interface ImportResult { ok: boolean; errors: string[]; warnings: string[]; manifest?: CartoonManifest; layers: number }

interface Layer { src: string; file: string; raw: string; p: ParsedKey; n: number; kind: Kind; box?: CartoonRect }

const isPt = (v: unknown): v is Pt => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
const HEX = /^#[0-9a-f]{6}$/i;

export async function importCartoonArt(o: ImportOptions): Promise<ImportResult> {
  const log = o.log ?? console.log;
  const errors: string[] = [], warnings: string[] = [];
  const fail = (r: ImportResult['errors'][number]) => errors.push(r);
  const done = (manifest?: CartoonManifest, layers = 0): ImportResult => ({ ok: errors.length === 0, errors, warnings, manifest, layers });

  // ---------------------------------------------------------------- names
  const sources = SOURCES.filter((s) => existsSync(path.join(o.kit, s.src)));
  if (!sources.some((s) => s.src === 'front')) { fail(`${o.kit}: no front/ folder`); return done(); }
  for (const s of SOURCES) if (!sources.includes(s)) warnings.push(`no ${s.src}/ folder: that angle is left out`);
  const layers: Layer[] = [];
  for (const { src } of sources) {
    for (const file of readdirSync(path.join(o.kit, src)).sort()) {
      if (file.startsWith('.')) continue;
      const rel = `${src}/${file}`;
      const m = file.match(/^(.+)\.(\d+)\.([a-z]+)\.png$/);
      if (!m) { fail(`${rel}: name must be <part key>.<n>.<tint|detail|under>.png`); continue; }
      if (!(KINDS as readonly string[]).includes(m[3])) { fail(`${rel}: kind "${m[3]}" must be tint, detail or under`); continue; }
      const p = parsePartKey(m[1]);
      if (!p) { fail(`${rel}: unknown part key "${m[1]}"`); continue; }
      if (m[3] === 'tint' && !TINT_SLOT[p.part]) { fail(`${rel}: ${p.part} has no colour slot, so it can't have tint layers (use detail)`); continue; }
      layers.push({ src, file: path.join(o.kit, src, file), raw: m[1], p, n: Number(m[2]), kind: m[3] as Kind });
    }
  }
  const seen = new Set<string>();
  for (const l of layers) {
    const id = `${l.src}/${l.p.key}.${l.n}.${l.kind}`;
    if (seen.has(id)) fail(`${l.src}/${l.raw}.${l.n}.${l.kind}: duplicate layer (facial_hair and facialHair name the same part)`);
    seen.add(id);
  }

  // ---------------------------------------------------------------- pixels
  for (const l of layers) {
    const rel = path.relative(o.kit, l.file);
    let img: { data: Buffer; info: OutputInfo }, meta: Metadata;
    try {
      meta = await sharp(l.file).metadata();
      img = await sharp(l.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    } catch (e) { fail(`${rel}: not a readable PNG (${(e as Error).message})`); continue; }
    const { data, info } = img;
    if (info.width !== ART.w || info.height !== ART.h) { fail(`${rel}: ${info.width}x${info.height}, must be the full ${ART.w}x${ART.h} canvas`); continue; }
    if (!meta.hasAlpha) { fail(`${rel}: no alpha channel (background must be transparent)`); continue; }
    const a = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    if ([a(0, 0), a(ART.w - 1, 0), a(0, ART.h - 1), a(ART.w - 1, ART.h - 1)].some((v) => v > 2)) { fail(`${rel}: background isn't transparent (opaque corner pixels)`); continue; }
    let x0 = ART.w, y0 = ART.h, x1 = -1, y1 = -1, notWhite = 0;
    for (let y = 0; y < ART.h; y++) for (let x = 0; x < ART.w; x++) {
      const i = (y * ART.w + x) * 4;
      if (data[i + 3] <= 2) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (l.kind === 'tint' && data[i + 3] >= 64 && Math.min(data[i], data[i + 1], data[i + 2]) < 235) notWhite++;
    }
    if (notWhite) { fail(`${rel}: tint layers must be pure white (${notWhite} coloured pixels); put shading in a detail layer`); continue; }
    if (x1 < 0) { warnings.push(`${rel}: empty layer, skipped`); continue; }
    // bounding box in canvas units, padded by 1 unit and snapped to whole units
    const bx = Math.max(0, Math.floor(x0 / SCALE) - 1), by = Math.max(0, Math.floor(y0 / SCALE) - 1);
    l.box = { x: bx, y: by, w: Math.min(CANVAS.w, Math.ceil((x1 + 1) / SCALE) + 1) - bx, h: Math.min(CANVAS.h, Math.ceil((y1 + 1) / SCALE) + 1) - by };
  }
  const kept = layers.filter((l) => l.box);
  for (const l of kept) {
    if (l.kind === 'under' && !kept.some((t) => t.src === l.src && t.p.key === l.p.key && t.n === l.n && t.kind === 'tint'))
      warnings.push(`${l.src}/${l.raw}.${l.n}.under: no tint with the same n (it paints before ${l.raw}'s layers ${l.n})`);
  }

  // ---------------------------------------------------------------- coverage
  const has = (src: string, key: string) => kept.some((l) => l.src === src && l.p.key === key);
  const builds = BUILDS.filter((b) => kept.some((l) => l.p.key === `head.${b}`) || kept.some((l) => l.p.part === 'body' && l.p.build === b));
  if (!builds.length) fail('no head.<female|male> or body.<build>.* layers: at least one build is needed');
  for (const { src } of sources) for (const b of builds) {
    if (!has(src, `head.${b}`)) fail(`${src}: head.${b} is missing`);
    if (!['back', 'mid', 'front'].some((band) => has(src, `body.${b}.${band}`))) fail(`${src}: body.${b}.<back|mid|front> is missing`);
  }
  for (const { src } of sources) for (const e of ['ears.back', 'ears.front']) if (!has(src, e) && !builds.some((b) => has(src, e.replace('ears.', `ears.${b}.`)))) warnings.push(`${src}: no ${e}`);
  // styles per slot, and which builds each has art for
  const styles = new Map<CartoonItemSlot, Map<string, Set<CartoonBuild>>>();
  for (const l of kept) {
    if (!l.p.slot) continue;
    const bySlot = styles.get(l.p.slot) ?? new Map<string, Set<CartoonBuild>>();
    styles.set(l.p.slot, bySlot);
    const set = bySlot.get(l.p.style!) ?? new Set<CartoonBuild>();
    bySlot.set(l.p.style!, set);
    if (l.p.build) set.add(l.p.build);
  }
  for (const [slot, bySlot] of styles) for (const [style, bs] of bySlot) for (const { src } of sources) {
    const need = slot === 'hair' ? [`hair.${style}.front`, `hair.${style}.back`]
      : slot === 'headwear' ? [...bs].map((b) => `headwear.${style}.${b}`)
        : (WEAR as readonly string[]).includes(slot) ? [...bs].map((b) => `${slot}.${style}.${b}.`)
          : [`${slot}.${style}`];
    if (slot === 'hair') { if (!need.some((k) => has(src, k))) fail(`${src}: hair.${style} is missing`); continue; }
    for (const k of need) {
      const ok = k.endsWith('.') ? kept.some((l) => l.src === src && l.p.key.startsWith(k)) : has(src, k);
      if (!ok) fail(`${src}: ${k.endsWith('.') ? k + '<band>' : k} is missing (every item needs art at every angle)`);
    }
  }
  for (const s of ['eyes', 'brows', 'nose', 'mouth'] as const) if (!styles.get(s)?.size) fail(`no ${s}.<style> layers: at least one is needed`);
  for (const s of WEAR) if (!styles.get(s)?.size) warnings.push(`no ${s} items`);

  // ---------------------------------------------------------------- pivots
  const pivotFile = o.pivots ?? path.join(o.kit, 'pivots.json');
  const pivots: CartoonManifest['pivots'] = {};
  let buildPivots: CartoonManifest['buildPivots'];
  let frames: CartoonManifest['frames'];
  if (!existsSync(pivotFile)) fail(`${pivotFile}: missing (fill it in from the registration sheet)`);
  else {
    let pj: any;
    try { pj = JSON.parse(readFileSync(pivotFile, 'utf8')); } catch (e) { fail(`${pivotFile}: ${(e as Error).message}`); }
    const k = pj?.units === 'canvas' ? 1 : 1 / SCALE; // art pixels by default
    const pt = (v: Pt): Pt => [v[0] * k, v[1] * k];
    const inside = (p: Pt) => p[0] >= 0 && p[1] >= 0 && p[0] <= CANVAS.w && p[1] <= CANVAS.h;
    const parseSrc = (r: any, src: string, where: string, build?: CartoonBuild): CartoonPivots | undefined => {
      const get = (name: string, optional = false): Pt | undefined => {
        let v = r[name];
        if (name === 'eyes' && Array.isArray(v) && v.length && v.every(isPt)) v = [v.reduce((s: number, q: Pt) => s + q[0], 0) / v.length, v.reduce((s: number, q: Pt) => s + q[1], 0) / v.length];
        if (v === undefined && optional) return undefined;
        if (!isPt(v)) { fail(`${pivotFile}: ${where}.${name} must be [x, y]${name === 'eyes' ? ' or [[x, y], [x, y]]' : ''}`); return undefined; }
        const q = pt(v);
        if (!inside(q)) { fail(`${pivotFile}: ${where}.${name} [${v}] is outside the canvas (units: ${pj.units ?? 'px'})`); return undefined; }
        return q;
      };
      const neck = get('neck'), head = get('head'), eyes = get('eyes'), nose = get('nose'), mouth = get('mouth');
      let feet = get('feet', true), brows = get('brows', true);
      if (!neck || !head || !eyes || !nose || !mouth) return undefined;
      if (!(head[1] < neck[1] && eyes[1] < nose[1] && nose[1] < mouth[1])) fail(`${pivotFile}: ${where}: expected head above neck and eyes above nose above mouth`);
      // not on the registration sheet: feet = lowest body or shoe pixel under the neck, brows a little above the eyes
      if (!feet) {
        const low = Math.max(...kept.filter((l) => l.src === src && (l.p.part === 'body' || l.p.part === 'shoes') && (!build || !l.p.build || l.p.build === build)).map((l) => l.box!.y + l.box!.h - 1));
        feet = [neck[0], Number.isFinite(low) ? low : CANVAS.h];
      }
      brows ??= [eyes[0], eyes[1] - 0.6 * (nose[1] - eyes[1])];
      return { eyes, nose, mouth, brows, neck, head, feet };
    };
    for (const { src } of sources) {
      const r = pj?.[src];
      if (!r) { if (pj) fail(`${pivotFile}: no "${src}" entry`); continue; }
      const q = parseSrc(r, src, src); if (q) pivots[src] = q;
    }
    // optional per-build registration: { "builds": { "male": { "front": {...}, ... } } }
    for (const [b, bySrc] of Object.entries((pj?.builds ?? {}) as Record<string, any>)) {
      if (!(BUILDS as string[]).includes(b)) { fail(`${pivotFile}: builds.${b}: unknown build (female or male)`); continue; }
      for (const { src } of sources) {
        if (!bySrc?.[src]) continue;
        const q = parseSrc(bySrc[src], src, `builds.${b}.${src}`, b as CartoonBuild);
        if (q) ((buildPivots ??= {})[b as CartoonBuild] ??= {})[src] = q;
      }
    }
    if (pj?.frames) {
      frames = {};
      for (const [id, v] of Object.entries(pj.frames as Record<string, any>)) {
        if (!['full', 'bust', 'head'].includes(id) || ![v?.x, v?.y, v?.w, v?.h].every((n) => typeof n === 'number')) { fail(`${pivotFile}: frames.${id} must be { x, y, w, h } for full, bust or head`); continue; }
        frames[id as 'head'] = { x: v.x * k, y: v.y * k, w: v.w * k, h: v.h * k };
      }
    }
  }

  // ---------------------------------------------------------------- items
  const itemFile = o.items ?? path.join(o.kit, 'items.json');
  let meta: Record<string, Record<string, Partial<CartoonItem>>> = {};
  if (existsSync(itemFile)) {
    try { meta = JSON.parse(readFileSync(itemFile, 'utf8')); } catch (e) { fail(`${itemFile}: ${(e as Error).message}`); }
    if (meta.facial_hair) { meta.facialHair = { ...meta.facial_hair, ...meta.facialHair }; delete meta.facial_hair; }
  } else warnings.push(`${itemFile}: missing, items get default fit and colours`);
  const SLOTS: CartoonItemSlot[] = ['hair', ...FACE, 'headwear', ...WEAR];
  for (const [slot, list] of Object.entries(meta)) {
    if (!(SLOTS as string[]).includes(slot)) { fail(`${itemFile}: unknown slot "${slot}" (one of ${SLOTS.join(', ')} or facial_hair)`); continue; }
    for (const [id, g] of Object.entries(list ?? {})) {
      if (g.fit !== undefined && !['female', 'male', 'unisex'].includes(g.fit)) fail(`${itemFile}: ${slot}.${id}.fit must be female, male or unisex`);
      if (g.color !== undefined && !HEX.test(String(g.color))) fail(`${itemFile}: ${slot}.${id}.color must be #rrggbb`);
    }
  }
  const items = {} as CartoonManifest['items'];
  for (const slot of SLOTS) {
    const found = styles.get(slot) ?? new Map<string, Set<CartoonBuild>>();
    const given = meta[slot] ?? {};
    for (const id of Object.keys(given)) if (!found.has(id)) warnings.push(`${itemFile}: ${slot}.${id} has no art, ignored`);
    // items.json order first, then the rest alphabetically
    const ids = [...Object.keys(given).filter((id) => found.has(id)), ...[...found.keys()].filter((id) => !(id in given)).sort()];
    items[slot] = ids.map((id) => {
      const g = given[id] ?? {};
      const bs = found.get(id)!;
      const artFit: CartoonItem['fit'] = bs.size === 1 ? [...bs][0] : 'unisex';
      const fit = g.fit ?? (slot === 'facialHair' ? 'male' : artFit);
      if (bs.size && fit !== artFit && !(fit !== 'unisex' && bs.has(fit))) fail(`${itemFile}: ${slot}.${id} is "${fit}" but its art is only drawn for ${[...bs].join(' and ')}`);
      const it: CartoonItem = { id, fit };
      if (g.modest) it.modest = true;
      if (slot === 'hair' && g.coversEars) it.coversEars = true;
      if (slot === 'headwear') { if (g.hidesHair) it.hidesHair = true; if (g.coversEars) it.coversEars = true; }
      if (slot === 'headwear' || (WEAR as readonly string[]).includes(slot)) {
        if (g.color === undefined) warnings.push(`${slot}.${id}: no default colour in items.json`);
        else if (HEX.test(String(g.color))) it.color = String(g.color).toLowerCase();
      }
      return it;
    });
  }

  if (errors.length || o.check) return done(undefined, kept.length);

  // ---------------------------------------------------------------- write
  for (const d of ['1x', '2x', 'previews', 'icons', 'manifest.json']) rmSync(path.join(o.out, d), { recursive: true, force: true });
  for (const d of DENSITIES) for (const { src } of sources) mkdirSync(path.join(o.out, `${d}x`, src), { recursive: true });
  const lib: CartoonManifest['layers'] = {};
  const rank = (k: Kind) => KINDS.indexOf(k);
  for (const { src } of sources) {
    lib[src] = {};
    const keys = [...new Set(kept.filter((l) => l.src === src).map((l) => l.p.key))].sort();
    for (const key of keys) {
      const subs = kept.filter((l) => l.src === src && l.p.key === key).sort((a, b) => a.n - b.n || rank(a.kind) - rank(b.kind));
      const files: CartoonLayerFile[] = [];
      for (const [i, l] of subs.entries()) {
        const f = `${src}/${key}.${i}.png`;
        const box = l.box!;
        const { data } = await sharp(l.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        if (l.kind === 'tint') for (let p = 0; p < data.length; p += 4) data[p] = data[p + 1] = data[p + 2] = 255; // clean edge fringes
        const full = sharp(data, { raw: { width: ART.w, height: ART.h, channels: 4 } })
          .extract({ left: box.x * SCALE, top: box.y * SCALE, width: box.w * SCALE, height: box.h * SCALE });
        const crop = await full.png().toBuffer();
        for (const d of DENSITIES) {
          let img = sharp(crop);
          if (d !== SCALE) img = img.resize(box.w * d, box.h * d, { kernel: 'lanczos3' });
          // tint masks are white + alpha: a palette PNG is lossless here and tiny; others keep full RGBA
          const png = l.kind === 'tint'
            ? await img.png({ palette: true, colours: 64, compressionLevel: 9, effort: 8 }).toBuffer()
            : await img.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
          writeFileSync(path.join(o.out, `${d}x`, f), png);
        }
        files.push({ f, kind: l.kind, ...(l.kind === 'tint' ? { slot: TINT_SLOT[l.p.part]! } : {}), ...box });
      }
      lib[src][key] = files;
    }
    log(`${src}: ${keys.length} parts`);
  }

  const P = pivots.front;
  // framings fit every build (a taller build's head must not be cropped)
  const union = (a: CartoonRect, b: CartoonRect) => clampRect({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) });
  let auto = defaultFrames(P);
  for (const bp of Object.values(buildPivots ?? {})) if (bp?.front) { const f = defaultFrames(bp.front); auto = { head: union(auto.head!, f.head!), bust: union(auto.bust!, f.bust!) }; }
  frames = { ...auto, ...frames };
  const manifest: CartoonManifest = {
    format: 'humanforge-cartoon', version: 1, canvas: CANVAS, densities: DENSITIES,
    views: [
      ...sources.filter((s) => s.yaw).reverse().map((s) => ({ id: `${s.src}_l`, src: s.src, mirror: true, yaw: -s.yaw })),
      { id: 'front', src: 'front', mirror: false, yaw: 0 },
      ...sources.filter((s) => s.yaw).map((s) => ({ id: `${s.src}_r`, src: s.src, mirror: false, yaw: s.yaw })),
    ],
    layers: lib, pivots, ...(buildPivots ? { buildPivots } : {}), items, builds, frames,
  };

  // ---------------------------------------------------------------- previews + icons
  const first = (slot: CartoonItemSlot, b: CartoonBuild, pred: (i: CartoonItem) => boolean = () => true) =>
    items[slot].find((i) => (i.fit === 'unisex' || i.fit === b) && pred(i));
  const look = (b: CartoonBuild): CartoonConfig => {
    const top = first('top', b), bottom = first('bottom', b), shoes = first('shoes', b), outfit = first('outfit', b);
    return {
      ...DEFAULT_CARTOON, build: b, hair: first('hair', b)?.id ?? null, eyes: first('eyes', b)!.id, brows: first('brows', b)!.id,
      nose: first('nose', b)!.id, mouth: first('mouth', b)!.id, facialHair: null, glasses: null, headwear: null,
      top: top?.id ?? null, topColor: top?.color ?? DEFAULT_CARTOON.topColor, bottom: bottom?.id ?? null, bottomColor: bottom?.color ?? DEFAULT_CARTOON.bottomColor,
      // with no top/bottom art, dress the preview look in the first outfit
      outfit: top || bottom ? null : outfit?.id ?? null, outfitColor: outfit?.color ?? DEFAULT_CARTOON.outfitColor,
      shoes: shoes?.id ?? null, shoesColor: shoes?.color ?? DEFAULT_CARTOON.shoesColor, shape: {},
    };
  };
  const base = Object.fromEntries(BUILDS.map((b) => [b, look(builds.includes(b) ? b : builds[0])])) as Record<CartoonBuild, CartoonConfig>;
  const r = (x: number, y: number, w: number, h: number): CartoonRect => clampRect({ x, y, w, h });
  const crop = (q: CartoonRect) => ({ left: q.x, top: q.y, width: q.w, height: q.h });
  const L = P.neck![1] - P.head![1]; // head centre to neck base
  const F = P.mouth[1] - P.eyes[1]; // eyes to mouth
  const bodyBox = unionBox(kept.filter((l) => l.src === 'front' && l.p.key.startsWith(`body.${builds[0]}.`)).map((l) => l.box!));
  const body = r(bodyBox.x - 20, bodyBox.y - 10, bodyBox.w + 40, bodyBox.h + 20);
  const headR = frames.head!;
  const face = r(P.eyes[0] - 1.75 * F, (P.eyes[1] + P.mouth[1]) / 2 - 1.75 * F, 3.5 * F, 3.5 * F);
  const fw = 0.35 * CANVAS.w, fh = 0.14 * CANVAS.h;
  const feet = r(P.feet![0] - fw / 2, P.feet![1] - 0.78 * fh, fw, fh);
  await writePreviews(manifest, o.out, base, { head: crop(headR), face: crop(face), body: crop(body), feet: crop(feet) }, (slot, it, c) => {
    if (slot === 'outfit' && it.modest) c.headwear = null;
  });
  const fem = base.female, male = base.male;
  const bearded = { ...male, facialHair: items.facialHair[0]?.id ?? null, glasses: items.glasses[0]?.id ?? null };
  const coverB = builds.includes('female') ? 'female' : builds[0];
  const covered = {
    ...base[coverB], headwear: first('headwear', coverB, (i) => !!i.hidesHair)?.id ?? first('headwear', coverB)?.id ?? null,
    outfit: first('outfit', coverB, (i) => !!i.modest)?.id ?? first('outfit', coverB)?.id ?? null,
  };
  const neckY = P.neck![1], feetY = P.feet![1], legs = feetY - neckY;
  const icons: Record<string, [CartoonConfig, CartoonRect]> = {
    face: [fem, headR], eyes: [fem, r(P.eyes[0] - 1.3 * F, P.eyes[1] - 0.65 * F, 2.6 * F, 1.3 * F)],
    brows: [fem, r(P.brows[0] - 1.3 * F, P.brows[1] - 0.65 * F, 2.6 * F, 1.3 * F)],
    nose: [fem, r(P.nose[0] - 0.6 * F, P.nose[1] - 0.5 * F, 1.2 * F, F)], mouth: [fem, r(P.mouth[0] - 0.7 * F, P.mouth[1] - 0.5 * F, 1.4 * F, F)],
    hair: [fem, r(headR.x - 0.05 * headR.w, headR.y, headR.w * 1.1, headR.h * 1.1)],
    body: [fem, body], top: [fem, r(body.x + body.w * 0.15, neckY - 0.1 * L, body.w * 0.7, legs * 0.42)],
    bottom: [fem, r(body.x + body.w * 0.2, neckY + legs * 0.3, body.w * 0.6, legs * 0.65)], shoes: [fem, feet],
  };
  if (items.facialHair.length && builds.includes('male')) icons.facialHair = [bearded, r(P.mouth[0] - 1.6 * F, P.eyes[1] - 0.2 * F, 3.2 * F, 2.6 * F)];
  if (items.glasses.length) icons.glasses = [bearded, r(P.eyes[0] - 1.5 * F, P.eyes[1] - 0.6 * F, 3 * F, 1.2 * F)];
  if (covered.headwear) icons.headwear = [covered, headR];
  if (covered.outfit) icons.outfit = [covered, r(body.x + body.w * 0.1, neckY - 0.1 * L, body.w * 0.8, legs)];
  await writeIcons(manifest, o.out, icons);

  writeFileSync(path.join(o.out, 'manifest.json'), JSON.stringify(manifest));
  log(`cartoon: ${kept.length} layers x ${DENSITIES.length} densities -> ${o.out}`);
  return done(manifest, kept.length);
}

/** Whole-unit rect clamped to the canvas. */
function clampRect(q: CartoonRect): CartoonRect {
  const x = Math.max(0, Math.round(q.x)), y = Math.max(0, Math.round(q.y));
  return { x, y, w: Math.max(1, Math.min(CANVAS.w, Math.round(q.x + q.w)) - x), h: Math.max(1, Math.min(CANVAS.h, Math.round(q.y + q.h)) - y) };
}
function unionBox(bs: CartoonRect[]): CartoonRect {
  if (!bs.length) return { x: 0, y: 0, w: CANVAS.w, h: CANVAS.h };
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  return { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 };
}
/** Head and bust framings from the front pivots (the built-in ones are tuned to chibi proportions). */
export function defaultFrames(P: CartoonPivots): NonNullable<CartoonManifest['frames']> {
  const L = P.neck![1] - P.head![1];
  const side = 2.8 * L;
  const bustH = 4.2 * L, bustW = bustH * (320 / 360);
  return {
    head: clampRect({ x: P.head![0] - side / 2, y: P.head![1] - 0.55 * side, w: side, h: side }),
    bust: clampRect({ x: P.head![0] - bustW / 2, y: P.head![1] - 1.6 * L, w: bustW, h: bustH }),
  };
}

// ---------------------------------------------------------------- CLI
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const check = args.includes('--check');
  const out = flag('--out') ?? path.resolve(import.meta.dirname, '../assets/cartoon');
  const pivots = flag('--pivots'), items = flag('--items');
  const kit = args.filter((a) => a !== '--check')[0];
  if (!kit) { console.error('usage: npm run import:cartoon -- <kit dir> [--out dir] [--pivots file] [--items file] [--check]'); process.exit(2); }
  const res = await importCartoonArt({ kit: path.resolve(kit), out: path.resolve(out), pivots, items, check });
  for (const w of res.warnings) console.warn('warning:', w);
  for (const e of res.errors) console.error('error:', e);
  if (!res.ok) { console.error(`${res.errors.length} problem(s); nothing was written`); process.exit(1); }
  if (check) console.log(`kit OK: ${res.layers} layers`);
}
