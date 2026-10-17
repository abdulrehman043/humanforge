// Tests for the developer-controlled editor model (src/human/editor.ts).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHumanEditor } from '../src/human/editor';
import { clothingInfo, hairInfo } from '../src/human/catalog';
import type { HumanManifest } from '../src/human/runtime';

const file = path.resolve('assets/human/manifest.json');
if (!existsSync(file)) { console.log('assets/human not built; skipping editor tests'); process.exit(0); }
const manifest: HumanManifest = JSON.parse(readFileSync(file, 'utf8'));
let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.error('FAIL', msg); } else console.log('  ok', msg); };
const ids = (e: ReturnType<typeof createHumanEditor>) => e.sections.flatMap((s) => s.controls.map((c) => `${s.id}.${c.id}`));

// female-only app
const f = createHumanEditor(manifest, { gender: 'female' });
check(f.initial.gender <= 0.3 && !ids(f).includes('body.gender'), 'female: gender locked and slider hidden');
check(f.allowed.hair.every((h) => hairInfo(h).fit !== 'male') && f.allowed.hair.length >= 6, `female: ${f.allowed.hair.length} suitable hairstyles`);
check(f.allowed.outfit.every((o) => !o.startsWith('male_')), 'female: no men\'s outfits');
check(f.allowed.skin.every((s) => s.includes('female')), 'female: female skins only');
const repaired = f.normalize({ gender: 1, hair: 'short04', skin: 'young_african_male', clothes: ['male_elegantsuit01', 'shoes01'] });
check(repaired.gender <= 0.3 && repaired.hair !== 'short04' && repaired.skin === 'young_african_female' && !repaired.clothes.includes('male_elegantsuit01'),
  `female: male config repaired -> ${repaired.skin}, ${repaired.hair}, ${repaired.clothes}`);

// male-only app
const m = createHumanEditor(manifest, { gender: 'male' });
check(m.initial.gender >= 0.7 && !ids(m).includes('body.cupSize'), 'male: gender locked, no bust slider');
check(m.allowed.outfit.every((o) => clothingInfo(o).fit !== 'female'), 'male: no women\'s outfits');

// attribute control
const lim = createHumanEditor(manifest, { gender: 'female', sections: ['face', 'hair', 'nose'], exclude: ['nose.noseHump', 'hair.color'], detailRange: 0.5 });
check(lim.sections.map((s) => s.id).join() === 'face,hair,nose', 'sections: only and in the given order');
check(!ids(lim).includes('nose.noseHump') && !ids(lim).includes('hair.color') && ids(lim).includes('nose.noseWidth'), 'exclude: individual controls hidden');
check(lim.normalize({ detail: { noseWidth: 1, chinHeight: -1 } }).detail.noseWidth === 0.5, 'detailRange clamps saved values');
const inc = createHumanEditor(manifest, { include: ['hair.style', 'eyes.color'] });
check(ids(inc).join() === 'eyes.color,hair.style', `include: whitelist -> ${ids(inc).join()}`);

// items + locks
const shop = createHumanEditor(manifest, { gender: 'female', items: { hair: ['long01', 'ponytail01'] }, locked: { eyes: 'green' } });
check(shop.allowed.hair.join() === 'long01,ponytail01' && shop.normalize({ eyes: 'blue' }).eyes === 'green', 'items whitelist and locked values');

// randomize stays inside the rules
let ok = true;
for (let i = 0; i < 50; i++) {
  const r = f.randomize();
  ok &&= r.gender <= 0.3 && f.allowed.hair.includes(r.hair!) && r.clothes.every((c) => !c.startsWith('male_')) && Object.values(r.detail).every((v) => Math.abs(v) <= 1);
}
check(ok, 'randomize respects gender and items');

// controls apply cleanly
const hair = f.sections.find((s) => s.id === 'hair')!.controls.find((c) => c.id === 'style')!;
check(hair.kind === 'choice' && hair.apply(f.initial, 'ponytail01').hair === 'ponytail01', 'choice control applies');
const outfit = f.sections.find((s) => s.id === 'outfit')!.controls[0];
const dressed = outfit.kind === 'choice' ? outfit.apply(f.initial, 'female_elegantsuit01') : f.initial;
check(dressed.clothes.filter((c) => clothingInfo(c).slot === 'outfit').join() === 'female_elegantsuit01' && dressed.clothes.some((c) => c.startsWith('shoes')), 'outfit swap keeps shoes');

// generated modest wear + dresses (tools/build-garments.mts)
const sec = (e: typeof f, id: string) => e.sections.find((s) => s.id === id);
check(['hijab01', 'amira01'].every((h) => f.allowed.headwear.includes(h)), `female: headwear ${f.allowed.headwear}`);
check(['abaya01', 'jalabiya01', 'dress_knee01', 'dress_maxi01', 'gown01'].every((o) => f.allowed.outfit.includes(o)), 'female: abaya, jalabiya and dresses offered');
check(!m.allowed.headwear.length && !m.sections.some((s) => s.id === 'headwear') && !m.allowed.outfit.includes('abaya01'), 'male: no headwear section or dresses');
const hw = sec(f, 'headwear')!;
check(!!hw && hw.framing === 'face' && hw.controls.map((c) => c.id).join() === 'style,color', 'headwear section: style + color');
const style = hw.controls[0], hwColor = hw.controls[1];
check(f.initial.clothes.every((c) => clothingInfo(c).slot !== 'headwear'), 'no headwear by default');
let look = style.kind === 'choice' ? style.apply(f.initial, 'hijab01') : f.initial;
check(look.clothes.includes('hijab01') && look.clothes.some((c) => clothingInfo(c).slot === 'outfit'), 'hijab adds to the outfit');
look = hwColor.kind === 'color' ? hwColor.apply(look, '#1f6f6b') : look;
check(look.garmentColors?.headwear === '#1f6f6b' && hwColor.value(look) === '#1f6f6b', 'headwear color');
const outfitSec = sec(f, 'outfit')!;
const oc = outfitSec.controls.find((c) => c.id === 'color');
check(!!oc && oc.kind === 'color' && oc.value(f.normalize({ clothes: ['abaya01'] })) === manifest.proxies.find((p) => p.id === 'abaya01')!.color, 'outfit color defaults to the garment color');
const hatted = createHumanEditor(manifest, { gender: 'female' });
const hatCtl = sec(hatted, 'hat')!.controls[0];
const withHat = hatCtl.kind === 'choice' ? hatCtl.apply(look, 'fedora01') : look;
check(withHat.clothes.includes('fedora01') && !withHat.clothes.includes('hijab01'), 'hat replaces headwear');
check(f.normalize({ ...look, clothes: [...look.clothes, 'fedora01'] }).clothes.filter((c) => ['fedora01', 'hijab01'].includes(c)).join() === 'hijab01', 'normalize: headwear wins over a hat');
const meta = (id: string) => manifest.proxies.find((p) => p.kind === 'clothes' && p.id === id)!;
check(meta('hijab01').hidesHair === true && (meta('hijab01').deleteVerts?.length ?? 0) > 0, 'hijab hides hair and scalp');
check(['abaya01', 'gown01', 'dress_knee01'].every((id) => meta(id).tintable && (meta(id).deleteVerts?.length ?? 0) > 0), 'dresses tintable and hide the body underneath');

console.log(fails ? `${fails} failures` : 'all editor checks passed');
process.exit(fails ? 1 : 0);
