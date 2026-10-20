// Tests for importing commissioned cartoon art: validation, the imported package, and the runtime
// paths it relies on (per-build heads, manifest pivots, under layers, facial_hair, items.json).
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { importCartoonArt, parsePartKey } from '../tools/import-cartoon-art.mts';
import { KIT_SHIFT, hasSourceArt, makeTestKit } from '../tools/cartoon/make-test-kit.mts';
import { CartoonConfig, CartoonManifest, DEFAULT_CARTOON, PIVOTS, cartoonFiles, cartoonLayers, cartoonParts, cartoonPivots, groupSteps, layerMatrix } from '../src/cartoon/model';
import { createCartoonEditor } from '../src/cartoon/editor';

if (!hasSourceArt()) { console.log('assets/cartoon not built; skipping cartoon import tests'); process.exit(0); }
let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.error('FAIL', msg); } else console.log('  ok', msg); };

const tmp = mkdtempSync(path.join(os.tmpdir(), 'hf-cartoon-import-'));
try {
  const kit = path.join(tmp, 'kit'), out = path.join(tmp, 'pkg');
  await makeTestKit(kit);

  // ---- names
  check(parsePartKey('facial_hair.beard')?.key === 'facialHair.beard' && parsePartKey('top.tshirt.male.mid')?.build === 'male', 'part keys parse (facial_hair -> facialHair)');
  check(['hat.cap', 'body.female', 'head', 'top.tshirt.female', 'hair.bob', 'Eyes.round'].every((k) => !parsePartKey(k)), 'malformed part keys are rejected');

  // ---- validation: a broken copy of a few files
  const bad = path.join(tmp, 'bad');
  mkdirSync(path.join(bad, 'front'), { recursive: true });
  for (const f of ['head.female.0.tint.png', 'head.female.1.detail.png', 'body.female.mid.0.tint.png', 'eyes.round.1.tint.png']) copyFileSync(path.join(kit, 'front', f), path.join(bad, 'front', f));
  const red = await sharp(path.join(kit, 'front', 'mouth.smile.0.tint.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < red.data.length; i += 4) { red.data[i + 1] = 40; red.data[i + 2] = 40; }
  await sharp(red.data, { raw: { width: red.info.width, height: red.info.height, channels: 4 } }).png().toFile(path.join(bad, 'front', 'mouth.smile.0.tint.png'));
  await sharp(path.join(kit, 'front', 'nose.button.0.detail.png')).resize(400, 640).png().toFile(path.join(bad, 'front', 'nose.button.0.detail.png'));
  await sharp(path.join(kit, 'front', 'brows.soft.0.tint.png')).flatten({ background: '#ffffff' }).png().toFile(path.join(bad, 'front', 'brows.soft.0.tint.png'));
  copyFileSync(path.join(kit, 'front', 'glasses.round.0.detail.png'), path.join(bad, 'front', 'hat.cap.0.tint.png'));
  copyFileSync(path.join(kit, 'front', 'glasses.round.0.detail.png'), path.join(bad, 'front', 'glasses.round.0.tint.png'));
  copyFileSync(path.join(kit, 'front', 'glasses.round.0.detail.png'), path.join(bad, 'front', 'glasses.round.0.shade.png'));
  writeFileSync(path.join(bad, 'pivots.json'), JSON.stringify({ front: { neck: [400, 520], head: [400, 300], eyes: [400, 330], nose: [400, 2000], mouth: [400, 410] } }));
  writeFileSync(path.join(bad, 'items.json'), JSON.stringify({ eyes: { round: { fit: 'male' } }, top: { tshirt: { color: 'blue' } } }));
  const v = await importCartoonArt({ kit: bad, out: path.join(tmp, 'bad-out'), log: () => {} });
  const has = (re: RegExp, what: string) => check(v.errors.some((e) => re.test(e)), `validation: ${what}`);
  check(!v.ok && !existsSync(path.join(tmp, 'bad-out')), `a broken kit fails and writes nothing (${v.errors.length} errors)`);
  has(/mouth\.smile\.0\.tint.*pure white/, 'coloured tint layer');
  has(/nose\.button.*400x640.*800x1280/, 'wrong canvas size');
  has(/brows\.soft.*(transparent|alpha)/, 'opaque background');
  has(/hat\.cap.*unknown part key/, 'unknown part name');
  has(/glasses\.round\.0\.tint.*no colour slot/, 'tint on a part without a colour slot');
  has(/shade.*tint, detail or under/, 'unknown layer kind');
  has(/nose.*outside the canvas/, 'pivot outside the canvas');
  has(/tshirt\.color must be #rrggbb/, 'bad items.json colour');
  has(/no mouth\.<style> layers/, 'coverage: missing required parts');

  // ---- the import
  const res = await importCartoonArt({ kit, out, log: () => {} });
  for (const e of res.errors) console.error('   ', e);
  check(res.ok && !!res.manifest, `fake kit imports (${res.layers} layers, ${res.warnings.length} warnings)`);
  const m: CartoonManifest = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  const all = Object.values(m.layers).flatMap((lib) => Object.values(lib).flat());
  check(all.every((f) => m.densities.every((d) => existsSync(path.join(out, `${d}x`, f.f)))), `all ${all.length} layer files exist at 1x and 2x`);
  check(m.canvas.w === 400 && m.canvas.h === 640 && all.every((f) => f.x >= 0 && f.y >= 0 && f.x + f.w <= 400 && f.y + f.h <= 640), 'canvas 400x640 units, rects inside');
  const f0 = m.layers.front['head.female'][1];
  const [m1, m2] = await Promise.all([1, 2].map((d) => sharp(path.join(out, `${d}x`, f0.f)).metadata()));
  check(m1.width === f0.w && m1.height === f0.h && m2.width === f0.w * 2 && m2.height === f0.h * 2, 'layers trimmed: 1x = rect size, 2x = double');
  const tint = await sharp(path.join(out, '2x', f0.f)).ensureAlpha().raw().toBuffer();
  let minRgb = 255;
  for (let i = 0; i < tint.length; i += 4) if (tint[i + 3] > 0) minRgb = Math.min(minRgb, tint[i], tint[i + 1], tint[i + 2]);
  check(f0.kind === 'tint' && f0.slot === 'skin' && minRgb >= 250, 'tint layers stay pure white with their colour slot');
  check(Object.values(m.items).flat().every((i) => i.preview && existsSync(path.join(out, i.preview))), 'every item has a preview tile');
  check(['face', 'eyes', 'hair', 'facialHair', 'headwear', 'outfit', 'body'].every((k) => m.icons?.[k] && existsSync(path.join(out, m.icons[k]))), 'section icons exist');
  check(m.views.map((v) => v.id).join() === 'side_l,three_l,front,three_r,side_r', '5 views (left ones mirrored)');

  // ---- pivots from pivots.json (art pixels -> canvas units), not the chibi constants
  const P = m.pivots.front;
  check(P.neck![0] === PIVOTS.neck[0] && P.neck![1] === PIVOTS.neck[1] + KIT_SHIFT && P.head![1] === PIVOTS.head[1] + KIT_SHIFT, `neck/head pivots from pivots.json (${P.neck}, ${P.head})`);
  check(Math.abs(P.feet![1] - (PIVOTS.feet[1] + KIT_SHIFT)) < 12, `feet found from the art (${P.feet})`);
  check(Math.abs(P.eyes[0] - 200) < 1e-9, 'two eye centres average to one pivot');
  const headSteps = groupSteps('head', P);
  const sc = headSteps.find((s) => s.op === 'scale')!;
  check(sc.op === 'scale' && sc.pivot === P.neck, 'head scales about the manifest neck');
  const H = layerMatrix(headSteps, { headSize: 1 });
  check(Math.abs(H[3] * P.neck![1] + H[5] - P.neck![1]) < 1e-9, 'neck stays put when the head grows');
  const B = layerMatrix(groupSteps('body', P), { height: 1 });
  check(Math.abs(B[3] * P.feet![1] + B[5] - P.feet![1]) < 1e-9, 'feet stay put when the body grows');
  const legacy = groupSteps('head', { eyes: [0, 0], nose: [0, 0], mouth: [0, 0], brows: [0, 0] }).find((s) => s.op === 'scale')!;
  check(legacy.op === 'scale' && legacy.pivot === PIVOTS.neck, 'manifests without body pivots fall back to PIVOTS');
  check(!!m.frames?.head && !!m.frames.bust && m.frames.head.y < P.head![1] && m.frames.head.y + m.frames.head.h > P.neck![1], 'head/bust framings from the pivots');

  // ---- per-build pivots: a taller build registers its own head/neck; others fall back to the shared ones
  {
    const pj = JSON.parse(readFileSync(path.join(kit, 'pivots.json'), 'utf8'));
    const up = (v: any): any => Array.isArray(v[0]) ? v.map(up) : [v[0], v[1] - 40];
    const male = Object.fromEntries(Object.entries(pj).filter(([k]) => ['front', 'three', 'side'].includes(k)).map(([src, r]: [string, any]) => [src, Object.fromEntries(Object.entries(r).map(([n, v]) => [n, up(v)]))]));
    const pf = path.join(tmp, 'pivots-builds.json'); writeFileSync(pf, JSON.stringify({ ...pj, builds: { male } }));
    const r2 = await importCartoonArt({ kit, out: path.join(tmp, 'pkg-builds'), pivots: pf, log: () => {} });
    const m2 = r2.manifest!;
    const mp = cartoonPivots(m2, 'male', 'front'), fp = cartoonPivots(m2, 'female', 'front');
    check(r2.ok && Math.abs(mp.neck![1] - (fp.neck![1] - 20)) < 1e-9 && fp === m2.pivots.front, `per-build pivots (male neck ${mp.neck}, female ${fp.neck})`);
    check(m2.frames!.head!.y <= Math.max(0, m.frames!.head!.y - 19) && m2.frames!.bust!.y < m.frames!.bust!.y, `framings widen to fit the taller build (head y ${m.frames!.head!.y} -> ${m2.frames!.head!.y}, bust y ${m.frames!.bust!.y} -> ${m2.frames!.bust!.y})`);
    check(cartoonPivots(m, 'male', 'front') === m.pivots.front, 'without builds every build uses the shared pivots');
  }

  // ---- per-build ears: ears.<build>.<band> parse, and a build without its own ears falls back to the shared key
  check(parsePartKey('ears.female.front')?.build === 'female' && parsePartKey('ears.front')?.build === undefined, 'ears.<build>.<band> part keys');
  {
    const withEars = { ...m, layers: { ...m.layers, front: { ...m.layers.front, 'ears.female.front': m.layers.front['ears.front'] ?? m.layers.front['head.female'] } } };
    const lk = (b: 'female' | 'male') => cartoonParts(withEars, { ...DEFAULT_CARTOON, build: b, hair: 'short_crop', headwear: null } as CartoonConfig).filter((p) => p.role === 'ears.front').map((p) => p.key).join();
    check(lk('female') === 'ears.female.front' && lk('male') === 'ears.front', `per-build ears (female ${lk('female')}, male ${lk('male')})`);
  }

  // ---- layer order and naming
  const look = (p: Partial<CartoonConfig>) => ({ ...DEFAULT_CARTOON, hair: 'long_wavy', eyes: 'lashes', brows: 'soft', nose: 'button', mouth: 'smile', top: 'tshirt', bottom: 'jeans', shoes: 'sneakers', ...p } as CartoonConfig);
  const male = look({ build: 'male', hair: 'short_crop', eyes: 'round', facialHair: 'beard', glasses: 'round' });
  check(cartoonParts(m, male).find((p) => p.role === 'head')!.key === 'head.male' && cartoonParts(m, look({})).find((p) => p.role === 'head')!.key === 'head.female', 'per-build head keys');
  const hl = cartoonLayers(m, look({}), 'front').filter((l) => l.key === 'head.female').map((l) => l.file.kind);
  check(hl.join() === 'under,tint,detail', `under layer paints before its tint (${hl})`);
  check(cartoonLayers(m, look({}), 'front').filter((l) => l.file.kind !== 'tint').every((l) => l.color === undefined), 'under/detail layers are not tinted');
  check(cartoonLayers(m, male, 'front').some((l) => l.key === 'facialHair.beard' && l.color === male.hairColor), 'facial_hair art fills the facialHair slot');
  const renamed = { ...m, layers: { front: Object.fromEntries(Object.entries(m.layers.front).map(([k, v]) => [k.replace(/^facialHair\./, 'facial_hair.'), v])) } };
  check(cartoonLayers(renamed, male, 'front').some((l) => l.key === 'facialHair.beard'), 'runtime also reads facial_hair.* keys');

  // ---- items.json metadata
  const item = (slot: keyof CartoonManifest['items'], id: string) => m.items[slot].find((i) => i.id === id);
  check(item('headwear', 'hijab')?.hidesHair === true && item('headwear', 'hijab')?.modest === true && item('headwear', 'hijab')?.color === '#3b4a6b', 'headwear metadata from items.json');
  check(item('outfit', 'abaya')?.fit === 'female' && item('top', 'tshirt')?.fit === 'unisex' && item('facialHair', 'beard')?.fit === 'male', 'fit from items.json or from the builds drawn');
  check(item('hair', 'long_wavy')?.coversEars === true && m.items.hair[0].id === 'long_wavy', 'hair metadata + items.json order');

  // ---- the editor on the imported package
  const ed = createCartoonEditor(m, { gender: 'female', modest: true });
  check(ed.initial.outfit === 'abaya' && ed.initial.headwear === 'hijab', `modest editor defaults resolve (${ed.initial.outfit} + ${ed.initial.headwear})`);
  let rnd = 7;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const any = createCartoonEditor(m);
  let missing = 0;
  for (let i = 0; i < 30; i++) missing += cartoonFiles(m, any.randomize(rand)).filter((f) => !existsSync(path.join(out, '1x', f))).length;
  check(missing === 0, '30 random looks resolve to existing files');

  // ---- --check writes nothing
  const dry = path.join(tmp, 'dry');
  const c = await importCartoonArt({ kit, out: dry, check: true, log: () => {} });
  check(c.ok && !existsSync(dry), 'check mode validates without writing');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(fails ? `${fails} failures` : 'all cartoon import checks passed');
process.exit(fails ? 1 : 0);
