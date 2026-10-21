// HumanForge 2D avatar editor for React Native (iOS, Android and react-native-web).
// Uses only View / Text / Pressable / ScrollView / TextInput and react-native-svg's SvgXml with the portable
// (filter-free) renderer, so it needs no native module beyond react-native-svg (optional peer, >= 13).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { renderAvatarSvg } from '../render';
import { CANVAS, hashId } from '../geom';
import { DEFAULT_CONFIG } from '../defaults';
import { buildManifest, Category } from '../manifest';
import { errorsIfSet, resolveConfig } from '../compat';
import { randomConfig } from '../random';
import { AvatarStore, exportConfig, importConfig } from '../storage';
import { normalizeConfig, ValidationIssue } from '../validate';
import type { AvatarConfig } from '../types';
import { CROP, EDITOR_TABS, SectionDef, clone, getPath, setPath } from '../editorModel';
import { THUMBS } from './thumbs.generated';
import { SKIN_TONES, Swatch } from '../palette';

const C = { bg: '#f5f3fb', card: '#ffffff', ink: '#241f3a', mute: '#7a7592', line: '#e6e2f2', accent: '#6c4cf0', soft: '#eee9ff', bad: '#c2394b' };

interface Opt { id: string; name: string }

function Swatches({ list, value, none, onPick }: { list: Swatch[]; value: string | null; none?: boolean; onPick: (hex: string | null) => void }) {
  return (
    <View style={s.swatchRow}>
      {none && <Pressable accessibilityLabel="None" onPress={() => onPick(null)} style={[s.swatch, { backgroundColor: '#fff' }, value === null && s.swatchOn]}><Text style={s.none}>×</Text></Pressable>}
      {list.map((sw) => {
        const clear = sw.hex.length === 9 && sw.hex.endsWith('00');
        const on = !!value && sw.hex.toLowerCase() === value.toLowerCase();
        return (
          <Pressable key={sw.id} accessibilityLabel={sw.name} accessibilityState={{ selected: on }} onPress={() => onPick(sw.hex)} style={[s.swatch, { backgroundColor: clear ? '#fff' : sw.hex }, on && s.swatchOn]}>
            {clear && <Text style={s.none}>×</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

function Seg({ value, options, onPick }: { value: unknown; options: { v: string | number | boolean; label: string }[]; onPick: (v: string | number | boolean) => void }) {
  return (
    <View style={s.seg}>
      {options.map((o, i) => (
        <Pressable key={String(o.v)} onPress={() => onPick(o.v)} accessibilityState={{ selected: o.v === value }} style={[s.segBtn, i > 0 && { borderLeftWidth: 1, borderLeftColor: C.line }, o.v === value && { backgroundColor: C.soft }]}>
          <Text style={[s.segText, o.v === value && { color: C.accent }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Chips are baked WebP files (tools/forge2d/build-thumbs.mts), never live SVG: nothing to render or re-render when
// another part of the avatar changes, and the bitmap decode is cached by the OS image pipeline.
const Thumb = React.memo(function Thumb({ cat, opt, selected, disabled, size, onPick }: {
  cat: Category; opt: Opt; selected: boolean; disabled: boolean; size: number; onPick: (id: string) => void;
}) {
  const src = opt.id === 'none' ? undefined : THUMBS[`${cat}/${opt.id}`];
  const crop = CROP[cat];
  const box = size - 14;
  return (
    <Pressable onPress={() => onPick(opt.id)} disabled={disabled} accessibilityRole="button" accessibilityLabel={opt.name} accessibilityState={{ selected, disabled }}
      style={[s.opt, { width: size }, selected && s.optOn, disabled && { opacity: 0.38 }]}>
      <View style={[s.thumb, { width: box, height: box }]}>
        {opt.id === 'none' ? <Text style={s.noneBig}>∅</Text> : src ? <Image source={src} resizeMode="contain" fadeDuration={0} style={{ width: box, height: Math.min(box, box * (crop[3] / crop[2])) }} /> : <Text style={s.noneBig}>·</Text>}
      </View>
      <Text numberOfLines={2} style={s.optLabel}>{opt.name}</Text>
      {selected && <View style={s.check}><Text style={s.checkText}>✓</Text></View>}
    </Pressable>
  );
});

export interface ForgeEditorNativeProps {
  defaultValue?: AvatarConfig;
  onChange?: (c: AvatarConfig) => void;
  /** called on Save with the config and a portable SVG string of the avatar (share or store it as you like) */
  onSave?: (c: AvatarConfig, svg: string) => void;
  /** pass `new AvatarStore(AsyncStorage)` to persist saved looks (the default keeps them in memory) */
  store?: AvatarStore;
}

export function ForgeEditorNative({ defaultValue, onChange, onSave, store: storeProp }: ForgeEditorNativeProps) {
  const store = useMemo(() => storeProp ?? new AvatarStore(), [storeProp]);
  const initial = useMemo(() => normalizeConfig(defaultValue ?? DEFAULT_CONFIG), [defaultValue]);
  const [cfg, setCfg] = useState<AvatarConfig>(initial.config);
  const [issues, setIssues] = useState<ValidationIssue[]>(initial.issues.filter((i) => i.severity !== 'info'));
  const [tab, setTab] = useState('face');
  const [zoom, setZoom] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [name, setName] = useState('My avatar');
  const [json, setJson] = useState('');
  const [seed, setSeed] = useState(1);
  const { width, height } = useWindowDimensions();
  const wide = width >= 760;
  const manifest = useMemo(() => buildManifest(), []);
  const opts = useCallback((cat: Category): Opt[] => manifest.filter((e) => e.category === cat).map((e) => ({ id: e.optionId, name: e.name })), [manifest]);

  useEffect(() => { store.list().then(setSaved).catch(() => {}); }, [store]);
  useEffect(() => { onChange?.(cfg); }, [cfg]);

  const set = (path: string, v: unknown, also?: Record<string, string>) => {
    setCfg((c) => { let n = setPath(c, path, v); for (const [p, val] of Object.entries(also ?? {})) n = setPath(n, p, val); return n; });
    setIssues([]);
  };
  const resolved = useMemo(() => resolveConfig(cfg), [cfg]);
  // the hero is cheap (`fast`) while taps are arriving and upgrades to full quality once the user pauses
  const [settled, setSettled] = useState(true);
  useEffect(() => { setSettled(false); const t = setTimeout(() => setSettled(true), 450); return () => clearTimeout(t); }, [cfg, zoom]);
  const previewXml = useMemo(() => renderAvatarSvg(cfg, { portable: true, fast: !settled, viewBox: zoom ? [50, 12, 300, 340] : undefined, width: 400, uid: `m${hashId(JSON.stringify(cfg) + zoom)}${settled ? 'q' : 'f'}` }), [cfg, zoom, settled]);
  const aspect = zoom ? 340 / 300 : CANVAS.h / CANVAS.w;

  const randomize = () => { setSeed((n) => n + 1); setCfg(randomConfig(seed * 7919 + (Date.now() % 9973))); setIssues([]); };
  const reset = () => { setCfg(clone(DEFAULT_CONFIG)); setIssues([]); };
  const doSave = async () => { await store.save(name.trim() || 'My avatar', cfg); setSaved(await store.list()); onSave?.(cfg, renderAvatarSvg(cfg, { portable: true, width: 800, uid: 'save' })); };
  const doLoad = async (n: string) => { const r = await store.load(n); if (!r) return; setCfg(r.config); setIssues(r.issues.filter((i) => i.severity !== 'info')); setName(n); };
  const doRemove = async (n: string) => { await store.remove(n); setSaved(await store.list()); };
  const doImport = () => { try { const r = importConfig(json); setCfg(r.config); setIssues(r.issues.filter((i) => i.severity !== 'info')); } catch (e) { setIssues([{ path: '', code: 'schema', severity: 'error', message: `Could not read that JSON: ${(e as Error).message}` }]); } };

  const panelW = wide ? Math.min(width - 440, 640) : width - 24;
  const tile = Math.floor((panelW - 32 - 16) / 3);

  const renderSection = (sec: SectionDef, i: number) => {
    if ('showIf' in sec && sec.showIf && !sec.showIf(cfg)) return null;
    if (sec.kind === 'options') {
      const list: Opt[] = sec.optional ? [{ id: 'none', name: 'None' }, ...opts(sec.cat)] : opts(sec.cat);
      const current = getPath(cfg, sec.path) as string;
      return (
        <View key={i} style={s.sec}>
          <Text style={s.secTitle}>{sec.title}</Text>
          <View style={s.grid}>
            {list.map((o) => {
              const errs = o.id === 'none' ? [] : errorsIfSet(cfg, sec.path, o.id);
              return <Thumb key={o.id} cat={sec.cat} opt={o} size={tile} selected={current === o.id} disabled={errs.length > 0} onPick={(id) => set(sec.path, id, sec.also)} />;
            })}
          </View>
        </View>
      );
    }
    if (sec.kind === 'swatches') {
      const palette = typeof sec.palette === 'function' ? sec.palette(cfg) : sec.palette;
      const raw = getPath(cfg, sec.path) as string | null;
      const value = sec.skin ? SKIN_TONES.find((t) => t.id === raw)?.hex ?? null : raw;
      return (
        <View key={i} style={s.sec}>
          {sec.title ? <Text style={s.secTitle}>{sec.title}</Text> : null}
          <View style={s.row}>{sec.label ? <Text style={s.rowLabel}>{sec.label}</Text> : null}
            <Swatches list={palette} value={value} none={sec.none} onPick={(hex) => set(sec.path, sec.skin ? SKIN_TONES.find((t) => t.hex === hex)?.id ?? 'golden' : hex)} />
          </View>
        </View>
      );
    }
    return (
      <View key={i} style={s.row}>
        <Text style={s.rowLabel}>{sec.label}</Text>
        <Seg value={getPath(cfg, sec.path)} options={sec.options} onPick={(v) => set(sec.path, v)} />
      </View>
    );
  };

  const current = EDITOR_TABS.find((t) => t.id === tab);
  return (
    <View style={[s.root, wide ? { flexDirection: 'row' } : { flexDirection: 'column' }, { minHeight: Math.min(height, 900) }]}>
      <View style={[s.stage, wide ? { width: 420 } : { height: Math.max(260, Math.round(height * 0.42)) }]}>
        <View style={s.preview}>
          <SvgXml xml={previewXml} width="100%" height="100%" />
          <Pressable style={s.chip} onPress={() => setZoom((z) => !z)}><Text style={s.chipText}>{zoom ? 'Full body' : 'Close up'}</Text></Pressable>
          {resolved.notes.length > 0 && <View style={s.note}><Text style={s.noteText}>{resolved.notes.join(' ')}</Text></View>}
        </View>
        <View style={s.actions}>
          <Pressable style={[s.btn, s.btnPrimary]} onPress={randomize}><Text style={[s.btnText, { color: '#fff' }]}>Randomise</Text></Pressable>
          <Pressable style={s.btn} onPress={reset}><Text style={s.btnText}>Reset</Text></Pressable>
          <Pressable style={s.btn} onPress={doSave}><Text style={s.btnText}>Save</Text></Pressable>
          <Pressable style={[s.btn, saved.length === 0 && { opacity: 0.4 }]} disabled={saved.length === 0} onPress={() => doLoad(saved[saved.length - 1])}><Text style={s.btnText}>Restore last</Text></Pressable>
        </View>
      </View>
      <View style={[s.panel, wide && { flex: 1 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={{ padding: 8, gap: 6 }}>
          {[...EDITOR_TABS.map((t) => [t.id, t.label] as const), ['saved', 'Save'] as const].map(([id, label]) => (
            <Pressable key={id} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} style={[s.tab, tab === id && { backgroundColor: C.soft }]}>
              <Text style={[s.tabText, tab === id && { color: C.accent }]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} key={tab}>
          {issues.length > 0 && <View style={s.issues}><Text style={s.issuesTitle}>Some options were adjusted:</Text>{issues.slice(0, 6).map((i, k) => <Text key={k} style={s.issueText}>• {i.message}</Text>)}</View>}
          {tab === 'saved' ? (
            <View>
              <Text style={s.secTitle}>Save this look</Text>
              <View style={s.row}><TextInput value={name} onChangeText={setName} style={s.input} accessibilityLabel="Name" /><Pressable style={[s.btn, s.btnPrimary]} onPress={doSave}><Text style={[s.btnText, { color: '#fff' }]}>Save</Text></Pressable></View>
              <Text style={[s.secTitle, { marginTop: 20 }]}>Saved looks</Text>
              {saved.length === 0 ? <Text style={{ color: C.mute }}>Nothing saved yet.</Text> : saved.map((n) => (
                <View key={n} style={s.row}><Pressable style={s.btn} onPress={() => doLoad(n)}><Text style={s.btnText}>Restore “{n}”</Text></Pressable><Pressable style={s.btn} onPress={() => doRemove(n)} accessibilityLabel={`Delete ${n}`}><Text style={s.btnText}>✕</Text></Pressable></View>
              ))}
              <Text style={[s.secTitle, { marginTop: 20 }]}>Share as JSON</Text>
              <TextInput value={json} onChangeText={setJson} multiline placeholder="Paste a configuration here, or press Export" style={[s.input, { minHeight: 90, fontFamily: undefined }]} />
              <View style={[s.row, { marginTop: 8 }]}><Pressable style={s.btn} onPress={() => setJson(exportConfig(cfg))}><Text style={s.btnText}>Export</Text></Pressable><Pressable style={s.btn} onPress={doImport}><Text style={s.btnText}>Import</Text></Pressable></View>
            </View>
          ) : current?.sections.map(renderSection)}
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 12, gap: 12 },
  stage: { gap: 10 },
  preview: { flex: 1, backgroundColor: '#f1eefb', borderRadius: 24, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chip: { position: 'absolute', top: 10, right: 10, backgroundColor: '#ffffffd9', borderRadius: 999, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, color: C.ink },
  note: { position: 'absolute', left: 10, right: 10, bottom: 10, backgroundColor: '#241f3ae6', borderRadius: 12, padding: 8 },
  noteText: { color: '#fff', fontSize: 12.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  btnPrimary: { backgroundColor: C.accent, borderColor: C.accent },
  btnText: { fontSize: 14, fontWeight: '600', color: C.ink },
  panel: { flex: 1, backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.line, overflow: 'hidden', minHeight: 300 },
  tabs: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: C.line },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  tabText: { fontSize: 14, fontWeight: '600', color: C.mute },
  sec: { marginBottom: 20 },
  secTitle: { fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: C.mute, fontWeight: '700', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: { borderWidth: 2, borderColor: C.line, backgroundColor: '#faf9fe', borderRadius: 16, padding: 4, alignItems: 'center', gap: 4 },
  optOn: { borderColor: C.accent, backgroundColor: C.soft },
  thumb: { borderRadius: 12, backgroundColor: '#f3f0fb', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  optLabel: { fontSize: 11.5, lineHeight: 14, textAlign: 'center', color: C.ink, minHeight: 28 },
  check: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontSize: 11 },
  noneBig: { fontSize: 26, color: C.mute },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 1.5, shadowOffset: { width: 0, height: 0 }, elevation: 1, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderColor: C.accent },
  none: { color: C.mute, fontSize: 18, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginVertical: 6 },
  rowLabel: { fontSize: 13, color: C.mute, fontWeight: '600', minWidth: 84 },
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: C.line, borderRadius: 12, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#fff' },
  segText: { fontSize: 13.5, fontWeight: '600', color: C.mute },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff', color: C.ink, flex: 1, minWidth: 140 },
  issues: { backgroundColor: '#fff4e8', borderWidth: 1, borderColor: '#f3d3a6', borderRadius: 12, padding: 10, marginBottom: 12 },
  issuesTitle: { fontWeight: '700', color: '#6a4310', marginBottom: 4 },
  issueText: { color: '#6a4310', fontSize: 13 },
});
