// <HumanEditor> for React Native (Expo): the same developer-controlled editor as the web one,
// built only from React Native primitives (no slider/UI dependencies).
//
//   <HumanEditor pkg={pkg} options={{ gender: 'female', exclude: ['ears'] }} onSave={(config, png) => save(config)} />
import React, { useMemo, useRef, useState } from 'react';
import { Image, LayoutChangeEvent, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import type { HumanConfig, HumanPackage } from '../human/runtime';
import { EditorControl, HumanEditorModel as EditorModel, HumanEditorOptions, createHumanEditor } from '../human/editor';
import { HumanView, HumanViewHandle } from './HumanView';

export interface HumanEditorProps {
  pkg: HumanPackage;
  /** What users may edit (gender lock, sections, items…). Ignored if `editor` is given. */
  options?: HumanEditorOptions;
  editor?: EditorModel;
  /** Controlled value. */
  value?: Partial<HumanConfig>;
  /** Uncontrolled starting value (e.g. the user's saved avatar). */
  defaultValue?: Partial<HumanConfig>;
  onChange?: (config: HumanConfig) => void;
  /** Shows a Save button; gets the config (store as JSON) and a PNG file URI of the avatar. */
  onSave?: (config: HumanConfig, snapshotUri: string | null) => void;
  onCancel?: () => void;
  saveLabel?: string;
  randomize?: boolean;
  accentColor?: string;
  background?: string;
  style?: StyleProp<ViewStyle>;
}

export function HumanEditor({
  pkg, options, editor: given, value, defaultValue, onChange, onSave, onCancel, saveLabel = 'Save', randomize = true,
  accentColor = '#1d1d1f', background = '#e9ecf1', style,
}: HumanEditorProps) {
  const editor = useMemo(() => given ?? createHumanEditor(pkg, options), [given, pkg, JSON.stringify(options)]);
  const [inner, setInner] = useState<HumanConfig>(() => editor.normalize(defaultValue ?? null));
  const config = value ? editor.normalize(value) : inner;
  const [tab, setTab] = useState(0);
  const [framing, setFraming] = useState<'face' | 'body' | null>(null);
  const view = useRef<HumanViewHandle>(null);
  const section = editor.sections[Math.min(tab, editor.sections.length - 1)];

  const update = (next: HumanConfig) => {
    const n = editor.normalize(next);
    if (!value) setInner(n);
    onChange?.(n);
  };
  if (!section) return <View style={style}><Text>No editable sections.</Text></View>;
  const shot = framing ?? section.framing;

  return (
    <View style={[s.root, style]}>
      <View style={s.preview}>
        <HumanView ref={view} pkg={pkg} config={config} framing={shot} background={background} style={StyleSheet.absoluteFill} />
        <View style={s.toolbar} pointerEvents="box-none">
          {onCancel ? <Pill label="Cancel" onPress={onCancel} /> : null}
          <View style={s.seg}>
            {(['face', 'body'] as const).map((f) => (
              <Pressable key={f} onPress={() => setFraming(f)} style={[s.segBtn, shot === f && { backgroundColor: accentColor }]}>
                <Text style={[s.segText, shot === f && { color: '#fff' }]}>{f === 'face' ? 'Face' : 'Body'}</Text>
              </Pressable>
            ))}
          </View>
          {randomize ? <Pill label="🎲" onPress={() => update(editor.randomize())} /> : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={s.tabsInner}>
        {editor.sections.map((sec, i) => (
          <Pressable key={sec.id} onPress={() => { setTab(i); setFraming(null); }} style={[s.tab, sec === section && { backgroundColor: accentColor }]}>
            <Text style={[s.tabText, sec === section && { color: '#fff' }]}>{sec.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={s.panel} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {section.controls.map((ctl) => <Control key={`${section.id}.${ctl.id}`} ctl={ctl} config={config} onChange={update} accent={accentColor} />)}
      </ScrollView>

      {onSave ? (
        <Pressable style={[s.save, { backgroundColor: accentColor }]} onPress={async () => onSave(config, (await view.current?.snapshot()) ?? null)}>
          <Text style={s.saveText}>{saveLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Control({ ctl, config, onChange, accent }: { ctl: EditorControl; config: HumanConfig; onChange: (c: HumanConfig) => void; accent: string }) {
  if (ctl.kind === 'slider') {
    return (
      <View style={s.row}>
        <Text style={s.label}>{ctl.label}</Text>
        <Slider value={ctl.value(config)} min={ctl.min} max={ctl.max} accent={accent} onChange={(v) => onChange(ctl.apply(config, v))} />
      </View>
    );
  }
  if (ctl.kind === 'color') {
    const v = ctl.value(config).toLowerCase();
    return (
      <View style={s.block}>
        <Text style={s.blockLabel}>{ctl.label}</Text>
        <View style={s.wrap}>
          {ctl.colors.map((c) => (
            <Pressable key={c} accessibilityLabel={c} onPress={() => onChange(ctl.apply(config, c))}
              style={[s.swatch, { backgroundColor: c }, c.toLowerCase() === v && { borderColor: accent }]} />
          ))}
        </View>
      </View>
    );
  }
  const v = ctl.value(config);
  if (ctl.display === 'swatch') {
    return (
      <View style={s.block}>
        <Text style={s.blockLabel}>{ctl.label}</Text>
        <View style={s.wrap}>
          {ctl.options.map((o) => (
            <Pressable key={o.id ?? 'none'} accessibilityLabel={o.label} onPress={() => onChange(ctl.apply(config, o.id))}
              style={[s.swatch, { backgroundColor: o.swatch ?? '#eee' }, o.id === v && { borderColor: accent }]}>
              {o.preview ? <Image source={{ uri: o.preview }} style={s.swatchImg} /> : null}
            </Pressable>
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={s.block}>
      <Text style={s.blockLabel}>{ctl.label}</Text>
      <View style={s.wrap}>
        {ctl.options.map((o) => (
          <Pressable key={o.id ?? 'none'} accessibilityLabel={o.label} onPress={() => onChange(ctl.apply(config, o.id))}
            style={[s.tile, o.id === v && { borderColor: accent, borderWidth: 2, backgroundColor: '#fff' }]}>
            {o.id === null ? <View style={s.none}><View style={s.noneBar} /></View>
              : o.preview ? <Image source={{ uri: o.preview }} style={s.tileImg} resizeMode="contain" />
              : <Text style={s.choiceText}>{o.label}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Minimal slider (no native dependency). Updates while dragging; tap to jump. */
function Slider({ value, min, max, onChange, accent }: { value: number; min: number; max: number; onChange: (v: number) => void; accent: string }) {
  const width = useRef(1);
  const latest = useRef(onChange);
  latest.current = onChange;
  const toValue = (x: number) => Math.round((min + (Math.max(0, Math.min(width.current, x)) / width.current) * (max - min)) * 100) / 100;
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => latest.current(toValue(e.nativeEvent.locationX)),
    onPanResponderMove: (e) => latest.current(toValue(e.nativeEvent.locationX)),
  }), [min, max]);
  const t = (value - min) / (max - min || 1);
  return (
    <View style={s.slider} onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width)} {...pan.panHandlers}>
      <View style={s.track} pointerEvents="none">
        <View style={[s.fill, { width: `${t * 100}%`, backgroundColor: accent }]} />
      </View>
      <View pointerEvents="none" style={[s.thumb, { left: `${t * 100}%`, borderColor: accent }]} />
    </View>
  );
}

function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={s.pill}><Text style={s.pillText}>{label}</Text></Pressable>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  preview: { height: '48%' },
  toolbar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', gap: 8, alignItems: 'center' },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, padding: 3 },
  segBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  segText: { fontSize: 13, color: '#1d1d1f' },
  pill: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  pillText: { fontSize: 13, color: '#1d1d1f' },
  tabs: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e3e5e8' },
  tabsInner: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f2f3f5' },
  tabText: { fontSize: 13, fontWeight: '500', color: '#444' },
  panel: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  label: { width: 112, fontSize: 12, color: '#666' },
  block: { marginVertical: 10 },
  blockLabel: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: 76, height: 76, borderRadius: 12, borderWidth: 1, borderColor: '#e1e3e7', backgroundColor: '#f4f5f7', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 3 },
  tileImg: { width: '100%', height: '100%' },
  none: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#9aa0a8', alignItems: 'center', justifyContent: 'center' },
  noneBar: { width: 30, height: 2, backgroundColor: '#9aa0a8', transform: [{ rotate: '-45deg' }] },
  choiceText: { fontSize: 11, color: '#555', textAlign: 'center' },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: '#fff', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  swatchImg: { width: '100%', height: '100%' },
  slider: { flex: 1, height: 32, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: '#e3e5e8', overflow: 'hidden' },
  fill: { height: 4 },
  thumb: { position: 'absolute', width: 22, height: 22, marginLeft: -11, borderRadius: 11, backgroundColor: '#fff', borderWidth: 2 },
  save: { margin: 16, marginTop: 0, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
