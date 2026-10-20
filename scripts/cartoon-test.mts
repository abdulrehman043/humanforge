// Tests for the cartoon avatar: asset package integrity, layer order, editor options, transforms.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CartoonConfig, CartoonManifest, DEFAULT_CARTOON, cartoonFiles, cartoonLayers, cartoonParts, groupSteps, layerMatrix } from '../src/cartoon/model';
import { createCartoonEditor, getCartoonCatalog } from '../src/cartoon/editor';

const dir = path.resolve('assets/cartoon');
if (!existsSync(path.join(dir, 'manifest.json'))) { console.log('assets/cartoon not built; skipping cartoon tests'); process.exit(0); }
const m: CartoonManifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.error('FAIL', msg); } else console.log('  ok', msg); };

// ---- package integrity
const allFiles = Object.values(m.layers).flatMap((lib) => Object.values(lib).flat());
const missing = allFiles.filter((f) => m.densities.some((d) => !existsSync(path.join(dir, `${d}x`, f.f))));
check(missing.length === 0, `all ${allFiles.length} layer files exist at ${m.densities.join('x, ')}x`);
check(allFiles.every((f) => f.w > 0 && f.h > 0 && f.x >= 0 && f.y >= 0 && f.x + f.w <= m.canvas.w && f.y + f.h <= m.canvas.h), 'layer rects inside the canvas');
check(allFiles.filter((f) => f.kind === 'tint').every((f) => !!f.slot), 'every tint layer has a color slot');
const previews = Object.values(m.items).flat().filter((i) => !existsSync(path.join(dir, i.preview ?? 'x')));
check(previews.length === 0, `every item has a preview tile (${Object.values(m.items).flat().length})`);
check(Object.values(m.icons ?? {}).every((p) => existsSync(path.join(dir, p))), 'section icons exist');
check(m.views.length === 5 && m.views.filter((v) => v.mirror).length === 2, '5 angles (2 mirrored)');

// every item renders at every angle for every build it fits
const srcs = [...new Set(m.views.map((v) => v.src))];
for (const b of m.builds) {
  const fit = (f: string) => f === 'unisex' || f === b;
  for (const s of srcs) {
    const lib = m.layers[s];
    const need = [
      ...m.items.hair.map((h) => `hair.${h.id}.front`),
      ...m.items.headwear.filter((h) => fit(h.fit)).map((h) => `headwear.${h.id}.${b}`),
      ...(['top', 'bottom', 'outfit', 'shoes'] as const).flatMap((slot) => m.items[slot].filter((i) => fit(i.fit)).map((i) => [`${slot}.${i.id}.${b}.mid`, `${slot}.${i.id}.${b}.front`, `${slot}.${i.id}.${b}.back`])).filter((alts) => !alts.some((k) => lib[k])).map((a) => a[0]),
      lib[`head.${b}`] ? `head.${b}` : 'head', `body.${b}.mid`, ...m.items.eyes.map((e) => `eyes.${e.id}`), ...m.items.mouth.map((e) => `mouth.${e.id}`),
    ];
    const absent = need.filter((k) => !lib[k]);
    check(absent.length === 0, `${b} / ${s}: all parts present${absent.length ? ' (missing ' + absent.slice(0, 5).join(', ') + ')' : ''}`);
  }
}

// ---- layer order rules
const look = (p: Partial<CartoonConfig>) => ({ ...DEFAULT_CARTOON, ...p } as CartoonConfig);
const roles = (c: CartoonConfig) => cartoonParts(m, c).map((p) => p.role);
const hijab = look({ headwear: 'hijab', outfit: 'abaya' });
const hr = roles(hijab);
check(!hr.includes('hairBack') && !hr.includes('hairFront') && !hr.some((r) => r.startsWith('ears')), 'hijab hides hair and ears');
check(hr[hr.length - 1] === 'headwear', 'headwear paints last');
check(!hr.some((r) => r.startsWith('top.') || r.startsWith('bottom.')), 'one-piece outfit replaces top and bottom');
const r0 = roles(look({}));
check(r0[0] === 'hairBack' && r0.indexOf('head') > r0.indexOf('body.mid') && r0.indexOf('hairFront') > r0.indexOf('eyes'), 'paint order: hair back < body < head < features < hair front');
const short = roles(look({ hair: 'short_crop', build: 'male' }));
check(short.indexOf('ears.front') > short.indexOf('hairFront'), 'short hair: ears drawn over the hair');
check(cartoonLayers(m, look({}), 'front').filter((l) => l.file.kind === 'tint').every((l) => /^#[0-9a-f]{6}$/i.test(l.color ?? '')), 'tint layers resolve to colors');

// ---- editor options
const fem = createCartoonEditor(m, { gender: 'female' });
check(!fem.sections.some((s) => s.id === 'facialHair') && fem.allowed.hair.every((h) => m.items.hair.find((i) => i.id === h)!.fit !== 'male'), 'female lock: no beards, no male hair');
check(fem.normalize({ build: 'male', facialHair: 'beard', hair: 'quiff' }).build === 'female' && fem.normalize({ facialHair: 'beard' }).facialHair === null, 'female lock repairs a male config');
const modest = createCartoonEditor(m, { gender: 'female', modest: true });
check(modest.initial.outfit === 'abaya' && modest.initial.headwear === 'hijab', `modest defaults: ${modest.initial.outfit} + ${modest.initial.headwear}`);
check(['top', 'bottom', 'outfit'].every((s) => modest.allowed[s as 'top'].every((id) => m.items[s as 'top'].find((i) => i.id === id)!.modest)), 'modest: only modest tops, bottoms and outfits');
check(!modest.allowed.bottom.includes('shorts') && !modest.allowed.outfit.includes('dress'), 'modest female: no shorts, no short dress');
check(modest.allowed.headwear.includes('hijab') && modest.allowed.headwear.includes('amira'), 'modest: hijab and al-amira offered');
const lim = createCartoonEditor(m, { sections: ['hair', 'eyes'], exclude: ['hair.color'], locked: { eyeColor: '#2f4f8a' } });
check(lim.sections.map((s) => s.id).join() === 'hair,eyes' && !lim.sections[0].controls.some((c) => c.id === 'color'), 'sections + exclude');
check(lim.normalize({ eyeColor: '#000000' }).eyeColor === '#2f4f8a', 'locked values win');
let rnd = 1;
const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 40; i++) {
  const ed = i % 2 ? modest : createCartoonEditor(m);
  const c = ed.randomize(rand);
  const files = cartoonFiles(m, c);
  if (files.some((f) => !existsSync(path.join(dir, '1x', f)))) { check(false, `random look ${i} has missing files`); break; }
}
check(true, '40 random looks resolve to existing files');
const cat = getCartoonCatalog(m, { gender: 'female' });
check(cat.find((a) => a.key === 'skin.tone')!.display === 'swatch' && cat.find((a) => a.key === 'hair.style')!.options.filter((o) => o.id).every((o) => !!o.preview), 'catalog: swatches + previews');
const applied = cat.find((a) => a.key === 'outfit.style')!.apply(fem.initial, 'abaya');
check(applied.outfit === 'abaya' && applied.outfitColor === m.items.outfit.find((o) => o.id === 'abaya')!.color, 'catalog apply: outfit + its default color');

// ---- transforms
const piv = m.pivots.front;
const steps = groupSteps('eyes', piv);
const M0 = layerMatrix(steps, {});
check(M0.join() === '1,0,0,1,0,0', 'zero sliders = identity');
const M1 = layerMatrix(steps, { eyeSize: 1 });
const [a, , , d, e, f] = M1;
check(Math.abs(a * piv.eyes[0] + e - piv.eyes[0]) < 1e-6 && Math.abs(d * piv.eyes[1] + f - piv.eyes[1]) < 1e-6 && a > 1.2, 'eye size scales about the eye pivot');

console.log(fails ? `${fails} failures` : 'all cartoon checks passed');
process.exit(fails ? 1 : 0);
