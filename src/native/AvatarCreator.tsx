// <AvatarCreator>: full-screen editor driven by EDITOR_SCHEMA. No UI deps beyond RN.
import React, { useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AvatarConfig, Control, DEFAULT_AVATAR, EDITOR_SCHEMA, encodeAvatar, normalizeConfig, prettyLabel, randomAvatar,
} from '../core';
import { AvatarView, AvatarViewHandle } from './AvatarView';

export interface AvatarCreatorProps {
  initialConfig?: Partial<AvatarConfig> | null;
  /** Called on Save with the config and its compact code (store either). */
  onSave?: (config: AvatarConfig, code: string, view: AvatarViewHandle | null) => void;
  onCancel?: () => void;
  onChange?: (config: AvatarConfig) => void;
  accentColor?: string;
  saveLabel?: string;
}

export function AvatarCreator({
  initialConfig, onSave, onCancel, onChange, accentColor = '#1d1d1f', saveLabel = 'Save',
}: AvatarCreatorProps) {
  const [config, setConfig] = useState<AvatarConfig>(() => normalizeConfig(initialConfig ?? DEFAULT_AVATAR));
  const [tab, setTab] = useState(0);
  const view = useRef<AvatarViewHandle>(null);
  const section = EDITOR_SCHEMA[tab];

  const update = (next: AvatarConfig) => {
    setConfig(next);
    onChange?.(next);
  };
  const set = (key: keyof AvatarConfig, value: string | number) => update({ ...config, [key]: value });

  return (
    <View style={s.root}>
      <AvatarView ref={view} config={config} framing={section.focus === 'face' ? 'face' : 'body'} style={s.preview} />

      <View style={s.topBar} pointerEvents="box-none">
        {onCancel ? <Btn label="Cancel" onPress={onCancel} /> : <View />}
        <Btn label="🎲" onPress={() => update(randomAvatar())} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={s.tabsInner}>
        {EDITOR_SCHEMA.map((sec, i) => (
          <Pressable key={sec.id} onPress={() => setTab(i)} style={[s.tab, i === tab && { borderBottomColor: accentColor }]}>
            <Text style={[s.tabText, i === tab && { color: accentColor, fontWeight: '700' }]}>{sec.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={s.panel} contentContainerStyle={{ paddingBottom: 16 }}>
        {section.controls.map((ctl) => (
          <View key={ctl.key} style={s.row}>
            <Text style={s.label}>{ctl.label}</Text>
            <ControlInput ctl={ctl} value={config[ctl.key]} onChange={(v) => set(ctl.key, v)} accent={accentColor} />
          </View>
        ))}
      </ScrollView>

      {onSave ? (
        <Pressable style={[s.save, { backgroundColor: accentColor }]} onPress={() => onSave(config, encodeAvatar(config), view.current)}>
          <Text style={s.saveText}>{saveLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ControlInput({ ctl, value, onChange, accent }: {
  ctl: Control; value: string | number; onChange: (v: string | number) => void; accent: string;
}) {
  if (ctl.type === 'slider') return <Slider value={value as number} onChange={onChange} accent={accent} />;
  if (ctl.type === 'color') {
    return (
      <View style={s.wrap}>
        {ctl.palette.map((c) => (
          <Pressable key={c} onPress={() => onChange(c)} hitSlop={4}
            style={[s.swatch, { backgroundColor: c }, value === c && { borderColor: accent, borderWidth: 3 }]} />
        ))}
      </View>
    );
  }
  return (
    <View style={s.wrap}>
      {ctl.options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} style={[s.chip, value === o && { backgroundColor: accent, borderColor: accent }]}>
          <Text style={[s.chipText, value === o && { color: '#fff' }]}>{prettyLabel(o)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Dependency-free slider (0..1). Commits at most once per frame while dragging. */
function Slider({ value, onChange, accent }: { value: number; onChange: (v: number) => void; accent: string }) {
  const width = useRef(1);
  const live = useRef({ value, onChange, raf: 0 as number | 0, next: value });
  live.current.value = value;
  live.current.onChange = onChange;
  const emit = (v: number) => {
    live.current.next = Math.min(1, Math.max(0, v));
    if (live.current.raf) return;
    live.current.raf = requestAnimationFrame(() => {
      live.current.raf = 0;
      live.current.onChange(live.current.next);
    });
  };
  const pan = useRef((() => {
    let startX = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startX = e.nativeEvent.locationX;
        emit(startX / width.current);
      },
      onPanResponderMove: (_, g) => emit((startX + g.dx) / width.current),
    });
  })()).current;
  return (
    <View style={s.sliderHit} onLayout={(e) => (width.current = Math.max(1, e.nativeEvent.layout.width))} {...pan.panHandlers}>
      <View style={s.track} pointerEvents="none">
        <View style={[s.fill, { width: `${value * 100}%`, backgroundColor: accent }]} />
      </View>
      <View pointerEvents="none" style={[s.thumb, { left: `${value * 100}%`, borderColor: accent }]} />
    </View>
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.btn}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  preview: { flex: 1.1, backgroundColor: '#eef1f5' },
  topBar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  btn: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { fontSize: 15, color: '#1d1d1f' },
  tabs: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  tabsInner: { paddingHorizontal: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, color: '#666' },
  panel: { flex: 1, paddingHorizontal: 16 },
  row: { marginTop: 14 },
  label: { fontSize: 12, color: '#666', marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#d5d8dd', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, color: '#1d1d1f' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: '#ccc' },
  sliderHit: { height: 32, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: '#e3e5e8', overflow: 'hidden' },
  fill: { height: 4 },
  thumb: { position: 'absolute', width: 22, height: 22, marginLeft: -11, borderRadius: 11, backgroundColor: '#fff', borderWidth: 2 },
  save: { margin: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
