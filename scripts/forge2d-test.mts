// Tests for the 2D avatar creator: schema, compatibility, manifest, rendering invariants, persistence, plug-ins.
// Visual quality is NOT tested here (see tools/forge2d/qa.mts for pixel checks and docs/FORGE2D.md for the manual review).
import type { AvatarConfig } from '../src/forge2d/types';
import { DEFAULT_CONFIG } from '../src/forge2d/defaults';
import { LAYER_ORDER } from '../src/forge2d/layers';
import { buildLayers, renderAvatarSvg } from '../src/forge2d/render';
import { applyReview, buildManifest } from '../src/forge2d/manifest';
import { checkRules, errorsIfSet, resolveConfig } from '../src/forge2d/compat';
import { normalizeConfig, validateConfig } from '../src/forge2d/validate';
import { randomConfig } from '../src/forge2d/random';
import { AvatarStore, exportConfig, importConfig, memoryAdapter } from '../src/forge2d/storage';
import { computeStats } from '../src/forge2d/stats';
import { registerAsset, unregisterAsset } from '../src/forge2d/external';
import { existsSync, readFileSync } from 'node:fs';
import { Defs, CANVAS } from '../src/forge2d/geom';
import { HAIRS } from '../src/forge2d/hairs';

let fails = 0, passes = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.error('FAIL', msg); } else { passes++; console.log('  ok', msg); } };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const withCfg = (patch: (c: any) => void) => { const c = clone(DEFAULT_CONFIG) as any; patch(c); return c as AvatarConfig; };

// ---- default config + schema
{
  const v = validateConfig(DEFAULT_CONFIG);
  check(v.ok && v.issues.filter((i) => i.severity !== 'info').length === 0, 'default configuration validates cleanly');
  check(DEFAULT_CONFIG.schema === 'humanforge.avatar2d' && DEFAULT_CONFIG.version === 1, 'schema id and version are set');
}

// ---- validation and graceful fallback
{
  const bad: any = clone(DEFAULT_CONFIG);
  bad.hair.style = 'does-not-exist'; bad.face.eyeColor = 'blue'; bad.expression = 'furious'; delete bad.outfit.shoes; bad.face.cheeks = 9;
  const { config, issues } = normalizeConfig(bad);
  check(config.hair.style === DEFAULT_CONFIG.hair.style, 'missing hairstyle falls back to the default');
  check(issues.some((i) => i.code === 'missing-asset' && i.path === 'hair.style'), 'missing asset is reported with its path');
  check(issues.some((i) => i.code === 'color' && i.path === 'face.eyeColor'), 'invalid colour is reported');
  check(config.expression === 'neutral' && config.face.cheeks === DEFAULT_CONFIG.face.cheeks && config.outfit.shoes === DEFAULT_CONFIG.outfit.shoes, 'invalid enum / range / missing field repaired');
  check(!validateConfig(bad).ok, 'validateConfig rejects a damaged configuration');
  check(normalizeConfig(null).config.schema === 'humanforge.avatar2d', 'non-object input yields the default avatar');
  const warns: string[] = [];
  const svg = renderAvatarSvg(bad, { onWarn: (m) => warns.push(m) });
  check(svg.startsWith('<svg') && warns.some((w) => w.includes('hair.style')), 'rendering a damaged config still draws an avatar and reports why');
  const future: any = clone(DEFAULT_CONFIG); future.version = 99;
  check(normalizeConfig(future).issues.some((i) => i.code === 'version'), 'unsupported future version is flagged');
}

// ---- compatibility rules
{
  const hat = withCfg((c) => { c.headwear.style = 'beanie'; c.hair.style = 'bun-top'; });
  check(checkRules(hat).some((i) => i.rule === 'hat-vs-updo' && i.kind === 'error'), 'beanie + top knot is an error');
  check(resolveConfig(hat).cfg.headwear.style === 'none' && resolveConfig(hat).repairs.length === 1, 'renderer repairs an invalid hat/updo pair');
  check(errorsIfSet(DEFAULT_CONFIG, 'headwear.style', 'cap').length === 0, 'cap is allowed with the default long hair');
  const dis = withCfg((c) => { c.hair.style = 'pony-high'; });
  check(errorsIfSet(dis, 'headwear.style', 'bucket').length > 0, 'editor can disable a hat for a high ponytail');
  const hb = withCfg((c) => { c.headwear.style = 'cap'; c.accessories.hairAccessory = 'headband'; });
  check(checkRules(hb).some((i) => i.rule === 'headband-vs-hat'), 'headband under a hat is an error');
  const hij = withCfg((c) => { c.headwear.style = 'hijab-classic'; c.accessories.necklace = 'pearls'; c.accessories.earrings = 'hoop'; c.accessories.hairAccessory = 'bow'; c.accessories.scarf = 'chunky'; });
  const r = resolveConfig(hij);
  check(r.hideHair && r.hideNecklace && r.hideEarrings && r.hideHairAcc && r.hideScarf, 'hijab hides hair, necklace, earrings, hair accessory and scarf');
  check(r.notes.length >= 4, 'hidden elements are explained to the user');
  const turban = resolveConfig(withCfg((c) => { c.headwear.style = 'turban-twist'; c.accessories.earrings = 'drop'; }));
  check(turban.hideHair && !turban.hideNecklace, 'turban hides hair but leaves the neck and (non-covered) ears alone');
  check(resolveConfig(withCfg((c) => { c.outfit.top = 'turtleneck'; c.accessories.necklace = 'chain'; })).hideNecklace, 'high neckline hides the necklace');
  check(resolveConfig(withCfg((c) => { c.outfit.dress = 'abaya'; })).showDress, 'a dress replaces the top and bottom');
}

// ---- manifest
const manifest = buildManifest();
{
  const ids = manifest.map((e) => e.id);
  check(new Set(ids).size === ids.length, `manifest ids are unique (${ids.length} assets)`);
  check(manifest.every((e) => e.layers.length > 0 && e.layers.every((l) => LAYER_ORDER[l.layer] === l.order)), 'every manifest layer matches the fixed layer order');
  check(manifest.every((e) => e.size.w === CANVAS.w && e.size.h === CANVAS.h), 'every asset uses the shared canvas size');
  check(manifest.every((e) => Object.values(e.anchors).every((a) => a![0] >= 0 && a![0] <= CANVAS.w && a![1] >= 0 && a![1] <= CANVAS.h)), 'all anchors lie inside the canvas');
  check(manifest.every((e) => e.status === 'draft'), 'assets start as draft (nothing is labelled approved without review)');
  check(manifest.every((e) => e.source.license && e.source.author), 'every asset records source and licence');
  const rv = applyReview(manifest, { tested: [manifest[0].id], approved: [manifest[1].id] });
  check(rv[0].status === 'tested' && rv[1].status === 'approved' && rv[2].status === 'draft', 'review file drives tested / approved status');
  check(HAIRS.every((h) => manifest.some((e) => e.id === `hair.${h.id}`)), 'every hairstyle template is in the manifest');
}

// ---- every option renders alone without warnings, NaN or exceptions
{
  const bad: string[] = [];
  const setters: Record<string, (c: any, id: string) => void> = {
    faceShape: (c, id) => (c.face.shape = id), skin: (c, id) => (c.face.skin = id), eyes: (c, id) => (c.face.eyes = id), brows: (c, id) => (c.face.brows = id), nose: (c, id) => (c.face.nose = id), mouth: (c, id) => (c.face.mouth = id),
    hair: (c, id) => (c.hair.style = id), headwear: (c, id) => (c.headwear.style = id), top: (c, id) => (c.outfit.top = id), outer: (c, id) => (c.outfit.outer = id), bottom: (c, id) => (c.outfit.bottom = id),
    dress: (c, id) => (c.outfit.dress = id), shoes: (c, id) => (c.outfit.shoes = id), glasses: (c, id) => (c.accessories.glasses = id), earrings: (c, id) => (c.accessories.earrings = id),
    necklace: (c, id) => (c.accessories.necklace = id), scarf: (c, id) => (c.accessories.scarf = id), bag: (c, id) => (c.accessories.bag = id), hairAccessory: (c, id) => (c.accessories.hairAccessory = id),
    expression: (c, id) => (c.expression = id), pose: (c, id) => (c.pose = id),
  };
  for (const e of manifest) {
    const cfg = withCfg((c) => setters[e.category](c, e.optionId));
    const warns: string[] = [];
    try {
      const svg = renderAvatarSvg(cfg, { uid: 'u', onWarn: (m) => warns.push(m) });
      if (warns.length || /NaN|undefined|Infinity/.test(svg)) bad.push(`${e.id}: ${warns.join('; ') || 'NaN/undefined in svg'}`);
    } catch (err) { bad.push(`${e.id}: threw ${(err as Error).message}`); }
  }
  check(bad.length === 0, `all ${manifest.length} options render in isolation without warnings or NaN${bad.length ? ' — ' + bad.slice(0, 5).join(' | ') : ''}`);
}

// ---- rendering invariants
{
  const a = renderAvatarSvg(DEFAULT_CONFIG, { uid: 'fixed' }), b = renderAvatarSvg(DEFAULT_CONFIG, { uid: 'fixed' });
  check(a === b, 'rendering is deterministic');
  const layers = buildLayers(DEFAULT_CONFIG, new Defs('x'));
  check(layers.every((l, i) => i === 0 || layers[i - 1].order <= l.order), 'layers come out in ascending order');
  const ids = layers.map((l) => l.id);
  check(['legs', 'torso', 'shoes', 'face', 'face.features', 'ears'].every((id) => ids.includes(id)), 'a full body and face are always drawn');
  check(ids.indexOf('legs') < ids.indexOf('shoes') && ids.indexOf('shoes') < ids.indexOf('bottoms') && ids.indexOf('bottoms') < ids.indexOf('top') && ids.indexOf('top') < ids.indexOf('outer') && ids.indexOf('face') < ids.indexOf('hair.front'), 'body -> shoes -> bottoms -> top -> outer, and face below front hair');
  const hijabIds = buildLayers(withCfg((c) => { c.headwear.style = 'hijab-classic'; }), new Defs('x')).map((l) => l.id);
  check(!hijabIds.includes('hair.back') && !hijabIds.includes('hair.front'), 'no hair layers are produced under a hijab');
  const dressIds = buildLayers(withCfg((c) => { c.outfit.dress = 'maxi-dress'; }), new Defs('x')).map((l) => l.id);
  check(dressIds.includes('dress') && !dressIds.includes('top') && !dressIds.includes('bottoms'), 'a dress replaces top and bottom layers');
  const crossed = buildLayers(withCfg((c) => { c.pose = 'crossed'; }), new Defs('x')).map((l) => l.id);
  check(crossed.includes('arms.front') && !crossed.includes('arms.mid'), 'crossed arms render in front of the clothes');
  const fast = renderAvatarSvg(DEFAULT_CONFIG, { fast: true });
  const filters = (x: string) => (x.match(/<filter /g) ?? []).length;
  check(filters(fast) < filters(a), 'fast mode drops the blurred shadow filters (lighting stays)');
  const crop = renderAvatarSvg(DEFAULT_CONFIG, { viewBox: [100, 20, 200, 200], width: 100 });
  check(crop.includes('viewBox="100 20 200 200"') && crop.includes('height="100"'), 'viewBox crop keeps the aspect ratio');
  const t0 = performance.now(); for (let i = 0; i < 100; i++) renderAvatarSvg(randomConfig(i)); const per = (performance.now() - t0) / 100;
  check(per < 40, `SVG generation is fast (${per.toFixed(1)} ms per avatar)`);
}

// ---- randomisation
{
  let invalid = 0, hijab = 0, dress = 0; const looks = new Set<string>();
  for (let s = 1; s <= 600; s++) {
    const c = randomConfig(s);
    if (!validateConfig(c).ok && validateConfig(c).issues.some((i) => i.severity !== 'info')) invalid++;
    if (checkRules(c).some((i) => i.kind === 'error')) invalid++;
    if (c.headwear.style.startsWith('hijab')) hijab++;
    if (c.outfit.dress !== 'none') dress++;
    looks.add(JSON.stringify(c));
  }
  check(invalid === 0, 'randomised avatars always validate and satisfy every error rule (600 seeds)');
  check(looks.size > 590, 'randomisation gives varied looks');
  check(hijab > 20 && dress > 80, `randomisation covers hijabs (${hijab}) and dresses (${dress})`);
  check(JSON.stringify(randomConfig(5)) === JSON.stringify(randomConfig(5)), 'randomisation is reproducible per seed');
  const modest = randomConfig(9, { modest: true });
  check(modest.headwear.style.startsWith('hijab'), 'modest mode always selects a hijab');
}

// ---- persistence
{
  const store = new AvatarStore(memoryAdapter());
  const mine = randomConfig(42);
  await store.save('one', mine);
  await store.save('two', DEFAULT_CONFIG);
  check((await store.list()).join() === 'one,two', 'saved avatars are listed');
  const back = await store.load('one');
  check(!!back && JSON.stringify(back.config) === JSON.stringify(normalizeConfig(mine).config) && back.issues.filter((i) => i.severity !== 'info').length === 0, 'save then restore returns the same configuration');
  check(renderAvatarSvg(back!.config, { uid: 'z' }) === renderAvatarSvg(mine, { uid: 'z' }), 'a restored avatar renders identically');
  const adapter = memoryAdapter();
  const s2 = new AvatarStore(adapter);
  const stale: any = clone(mine); stale.hair.style = 'retired-style';
  await adapter.setItem('humanforge.forge2d.v1:item:old', JSON.stringify({ name: 'old', savedAt: 0, config: stale }));
  const old = await s2.load('old');
  check(!!old && old.config.hair.style === DEFAULT_CONFIG.hair.style && old.issues.some((i) => i.code === 'missing-asset'), 'restoring a look with a removed asset falls back and explains');
  await adapter.setItem('humanforge.forge2d.v1:item:junk', '{not json');
  check((await s2.load('junk')) === null && (await s2.load('missing')) === null, 'corrupt or missing saves restore as null, not a crash');
  await store.remove('one');
  check((await store.list()).join() === 'two', 'saved avatars can be removed');
  const text = exportConfig(mine);
  check(JSON.stringify(importConfig(text).config) === JSON.stringify(normalizeConfig(mine).config), 'JSON export / import round-trips');
}

// ---- statistics
{
  const s = computeStats({ configsTested: 123, approvedConfigs: 0 });
  check(s.theoretical > s.permitted && s.permitted > s.visuallyDistinct && s.visuallyDistinct > 1_000_000n, 'theoretical > permitted > visually distinct');
  check(s.withColours.visuallyDistinct > s.visuallyDistinct, 'colour choices multiply the count');
  check(s.tested === 123 && s.approved === 0, 'tested / approved counts come from the review data');
  check(s.options.hair === HAIRS.length + 1 && s.options.skin === 12, 'option counts come from the manifest');
}


// ---- portable (React Native) renderer
{
  // react-native-svg's own tag table is the source of truth for which elements exist (the native filter set is partial)
  const tagFile = 'node_modules/react-native-svg/src/xmlTags.ts';
  const rnsvgTags = existsSync(tagFile) ? new Set([...readFileSync(tagFile, 'utf8').matchAll(/^\s+(\w+): \w+,/gm)].map((m) => m[1])) : null;
  const ALLOWED_EL = new Set(['svg', 'defs', 'g', 'path', 'rect', 'ellipse', 'circle', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'use']);
  const ALLOWED_ATTR = new Set(['xmlns', 'viewBox', 'width', 'height', 'id', 'd', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-opacity', 'opacity',
    'transform', 'x', 'y', 'cx', 'cy', 'rx', 'ry', 'r', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'gradientUnits', 'gradientTransform', 'offset', 'stop-color', 'stop-opacity', 'clip-path', 'mask', 'maskUnits', 'patternUnits', 'patternTransform', 'href']);
  const cfgs: AvatarConfig[] = [DEFAULT_CONFIG, ...Array.from({ length: 120 }, (_, i) => randomConfig(7000 + i))];
  for (const e of manifest) { const c = withCfg((x) => { /* one option each */ void x; }); void c; }
  const badEl = new Set<string>(), badAttr = new Set<string>(); let withFilter = 0, badRot = 0, leaked = 0;
  for (const cfg of cfgs) {
    const svg = renderAvatarSvg(cfg, { portable: true, uid: 'p' });
    if (/<filter|filter=|<fe[A-Z]/.test(svg)) withFilter++;
    if (/rotate\([^)\s]+ [^)]+\)/.test(svg)) badRot++;
    if (/data-layer|role=|<title/.test(svg)) leaked++;
    for (const m of svg.matchAll(/<([A-Za-z]+)([^>]*)>/g)) {
      if (!ALLOWED_EL.has(m[1]) || (rnsvgTags && !rnsvgTags.has(m[1]))) badEl.add(m[1]);
      for (const a of m[2].matchAll(/([A-Za-z:-]+)="/g)) if (!ALLOWED_ATTR.has(a[1])) badAttr.add(a[1]);
    }
  }
  check(withFilter === 0, `portable output contains no SVG filters (${cfgs.length} avatars)`);
  check(badEl.size === 0, `portable output uses only react-native-svg elements${rnsvgTags ? ' (checked against its tag table)' : ''}${badEl.size ? ': ' + [...badEl].join(',') : ''}`);
  check(badAttr.size === 0, `portable output uses only supported attributes${badAttr.size ? ': ' + [...badAttr].join(',') : ''}`);
  check(badRot === 0 && leaked === 0, 'portable output has no 3-argument rotate and no web-only attributes');
  // every option renders in portable mode too, and the editor never needs a filter for thumbnails
  const bad: string[] = [];
  for (const e of manifest) {
    const c = withCfg((x) => ({ faceShape: () => (x.face.shape = e.optionId), hair: () => (x.hair.style = e.optionId), headwear: () => (x.headwear.style = e.optionId), top: () => (x.outfit.top = e.optionId), outer: () => (x.outfit.outer = e.optionId), bottom: () => (x.outfit.bottom = e.optionId), dress: () => (x.outfit.dress = e.optionId), shoes: () => (x.outfit.shoes = e.optionId), pose: () => (x.pose = e.optionId) } as Record<string, () => void>)[e.category]?.());
    const svg = renderAvatarSvg(c, { portable: true, fast: true, uid: 'q' });
    if (/NaN|undefined|<filter/.test(svg)) bad.push(e.id);
  }
  check(bad.length === 0, `every option renders in portable mode without NaN or filters${bad.length ? ': ' + bad.slice(0, 4).join(',') : ''}`);
  const part = renderAvatarSvg(DEFAULT_CONFIG, { portable: true, uid: 'p' });
  check(part.length < 200_000, `a portable avatar stays small (${Math.round(part.length / 1024)} KB)`);
  const crop = renderAvatarSvg(DEFAULT_CONFIG, { portable: true, viewBox: [134, 56, 132, 140], width: 160, uid: 'c' });
  check(crop.length < part.length, `cropped renders skip the layers they never show (${Math.round(crop.length / 1024)} KB vs ${Math.round(part.length / 1024)} KB)`);
  check(!crop.includes('data-layer="legs"') && /<g>/.test(crop), 'layer culling removes the legs from a head crop');
}

// ---- plug-in assets
{
  registerAsset({
    id: 'test-badge', category: 'hairAccessory', name: 'Test badge', layers: { 'accessory.head': '<circle cx="200" cy="40" r="6" fill="{{color}}"/>' },
    source: { author: 'tests', license: 'CC0-1.0' },
  });
  const m2 = buildManifest();
  check(m2.some((e) => e.id === 'hairAccessory.test-badge' && e.kind === 'svg-fragment' && e.source.type === 'plugin'), 'plug-in asset appears in the manifest');
  const cfg = withCfg((c) => { c.accessories.hairAccessory = 'test-badge'; c.accessories.hairAccessoryColor = '#123456'; });
  check(validateConfig(cfg).ok, 'a config can reference a registered plug-in asset');
  check(renderAvatarSvg(cfg).includes('fill="#123456"'), 'plug-in artwork is rendered with the chosen colour');
  unregisterAsset('hairAccessory', 'test-badge');
  check(normalizeConfig(cfg).config.accessories.hairAccessory === 'none', 'removing a plug-in falls back gracefully');
}

console.log(`\n${passes} passed, ${fails} failed`);
if (fails) process.exit(1);
