// <CartoonEditor>: drop-in cartoon avatar editor for React Native (Expo) and react-native-web.
// Same pattern as <HumanEditor>: developer `options` decide what users may edit; the value is a
// plain JSON config. Built from RN primitives only (no GL, no native slider dependency).
//
// Smoothness: slider drags write straight into Animated values used by the avatar's native
// transforms (no React re-render per move); the config updates once, on release. Item taps keep
// the old look on screen until the new layers have loaded (see CartoonView).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Image, LayoutChangeEvent, PanResponder, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle, useWindowDimensions,
} from 'react-native';
import { CartoonView, CartoonViewHandle, makeNativeValues } from './CartoonView';
import { CartoonChoice, CartoonControl, CartoonEditorModel, CartoonEditorOptions, CartoonSliderControl, createCartoonEditor } from './editor';
import { CARTOON_SLIDERS, CartoonConfig, CartoonSliderId, cartoonFiles } from './model';
import type { CartoonPackage } from './package';

export interface CartoonEditorProps {
  pkg: CartoonPackage;
  options?: CartoonEditorOptions;
  editor?: CartoonEditorModel;
  value?: Partial<CartoonConfig>;
  defaultValue?: Partial<CartoonConfig>;
  onChange?: (config: CartoonConfig) => void;
  /** Shows a Save button: gets the config (store as JSON) and a PNG snapshot URI (needs react-native-view-shot). */
  onSave?: (config: CartoonConfig, snapshotUri: string | null) => void;
  onCancel?: () => void;
  saveLabel?: string;
  randomize?: boolean;
  accentColor?: string;
  background?: string;
  /** Height of the avatar stage (default 46% of the screen). */
  stageHeight?: number;
  style?: StyleProp<ViewStyle>;
}

export function CartoonEditor({
  pkg, options, editor: given, value, defaultValue, onChange, onSave, onCancel, saveLabel = 'Done', randomize = true,
  accentColor = '#2d3440', background = '#eef0f4', stageHeight, style,
}: CartoonEditorProps) {
  const editor = useMemo(() => given ?? createCartoonEditor(pkg, options), [given, pkg, JSON.stringify(options)]);
  const [inner, setInner] = useState<CartoonConfig>(() => editor.normalize(defaultValue ?? null));
  const config = value ? editor.normalize(value) : inner;
  const [tab, setTab] = useState(0);
  const section = editor.sections[Math.min(tab, editor.sections.length - 1)];
  const view = useRef<CartoonViewHandle>(null);
  const { height: screenH, width: screenW } = useWindowDimensions();
  const stageH = stageHeight ?? Math.round(screenH * 0.46);
  const avatarW = Math.min(screenW, Math.round(stageH / 1.6));

  // live slider values shared with the avatar's native transforms
  const shapeValues = useMemo(() => Object.fromEntries(CARTOON_SLIDERS.map((s) => [s.id, new Animated.Value(config.shape[s.id] ?? 0)])) as Record<CartoonSliderId, Animated.Value>, []);
  useEffect(() => { for (const s of CARTOON_SLIDERS) shapeValues[s.id].setValue(config.shape[s.id] ?? 0); }, [JSON.stringify(config.shape)]);
  useEffect(() => makeNativeValues(shapeValues), [shapeValues]);

  const update = (next: CartoonConfig) => {
    const n = editor.normalize(next);
    if (!value) setInner(n);
    onChange?.(n);
  };

  // warm the cache: previews now, all angles of the current look in the background
  useEffect(() => {
    for (const s of editor.sections) for (const c of s.controls) if (c.kind === 'choice') for (const o of c.options) if (o.preview) Image.prefetch(o.preview).catch(() => {});
  }, [editor]);
  useEffect(() => { pkg.ensure(cartoonFiles(pkg.manifest, config)).catch(() => {}); }, [JSON.stringify(config)]);

  // the avatar only re-renders when the look changes, not on tab switches
  const configKey = JSON.stringify({ ...config, shape: undefined });
  const stage = useMemo(() => (
    <CartoonView ref={view} pkg={pkg} config={config} width={avatarW} shapeValues={shapeValues} />
  ), [configKey, avatarW, pkg]);

  if (!section) return <View style={style}><Text>No editable sections.</Text></View>;
  return (
    <View style={[s.root, style]}>
      <View style={[s.stage, { height: stageH, backgroundColor: background }]}>
        <View style={{ alignItems: 'center', justifyContent: 'flex-end', flex: 1 }}>{stage}</View>
        <View style={s.toolbar} pointerEvents="box-none">
          {onCancel ? <Pill label="✕" onPress={onCancel} /> : <View />}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {randomize ? <Pill label="🎲" onPress={() => update(editor.randomize())} /> : null}
            {onSave ? <Pill label={saveLabel} strong onPress={async () => {
              let uri: string | null = null;
              try { uri = (await view.current?.snapshot()) ?? null; } catch { uri = null; }
              onSave(config, uri);
            }} /> : null}
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={s.tabsInner}>
        {editor.sections.map((sec, i) => {
          const on = sec === section;
          const icon = sec.icon(config);
          return (
            <Pressable key={sec.id} accessibilityRole="tab" accessibilityLabel={sec.label} accessibilityState={{ selected: on }} onPress={() => setTab(i)}
              style={[s.tab, on && { backgroundColor: accentColor, paddingRight: 14 }]}>
              <View style={s.tabIcon}>
                {icon.preview ? <Image source={{ uri: icon.preview }} style={s.tabImg} /> : <View style={[s.tabImg, { backgroundColor: icon.swatch }]} />}
              </View>
              {on ? <Text style={s.tabText}>{sec.label}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={s.panel} contentContainerStyle={{ padding: 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        {section.controls.map((ctl) => (
          <Control key={`${section.id}.${ctl.id}`} ctl={ctl} config={config} onChange={update} accent={accentColor} values={shapeValues} />
        ))}
      </ScrollView>
    </View>
  );
}

function Control({ ctl, config, onChange, accent, values }: { ctl: CartoonControl; config: CartoonConfig; onChange: (c: CartoonConfig) => void; accent: string; values: Record<CartoonSliderId, Animated.Value> }) {
  if (ctl.kind === 'slider') return <SliderRow ctl={ctl} config={config} onChange={onChange} accent={accent} value={values[ctl.slider]} />;
  return ctl.display === 'swatch' ? <Swatches ctl={ctl} config={config} onChange={onChange} accent={accent} /> : <Tiles ctl={ctl} config={config} onChange={onChange} accent={accent} />;
}

function Tiles({ ctl, config, onChange, accent }: { ctl: CartoonChoice; config: CartoonConfig; onChange: (c: CartoonConfig) => void; accent: string }) {
  const v = ctl.value(config);
  const [w, setW] = useState(0);
  const cols = 3, gap = 8;
  const size = w ? (w - gap * (cols - 1)) / cols : 0;
  return (
    <View style={s.block} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={[s.wrap, { gap }]}>
        {size ? ctl.options.map((o) => (
          <Pressable key={o.id ?? 'none'} accessibilityLabel={o.label} onPress={() => onChange(ctl.apply(config, o.id))}
            style={[s.tile, { width: size, height: ctl.tall ? size * 1.5 : size }, o.id === v && { borderColor: accent, borderWidth: 2.5 }]}>
            {o.id === null ? <NoneIcon /> : o.preview ? <Image source={{ uri: o.preview }} style={s.tileImg} resizeMode="contain" /> : <Text style={s.tileText}>{o.label}</Text>}
          </Pressable>
        )) : null}
      </View>
    </View>
  );
}

function Swatches({ ctl, config, onChange, accent }: { ctl: CartoonChoice; config: CartoonConfig; onChange: (c: CartoonConfig) => void; accent: string }) {
  const v = (ctl.value(config) ?? '').toLowerCase();
  return (
    <View style={s.block}>
      <View style={s.wrap}>
        {ctl.options.map((o) => (
          <Pressable key={o.id} accessibilityLabel={o.label} onPress={() => onChange(ctl.apply(config, o.id))}
            style={[s.swatch, { backgroundColor: o.swatch }, (o.id ?? '').toLowerCase() === v && { borderColor: accent }]} />
        ))}
      </View>
    </View>
  );
}

/**
 * Slider bound to an Animated.Value: moving it updates the avatar natively, without re-rendering
 * React. The config is updated once when the finger lifts.
 */
function SliderRow({ ctl, config, onChange, accent, value }: { ctl: CartoonSliderControl; config: CartoonConfig; onChange: (c: CartoonConfig) => void; accent: string; value: Animated.Value }) {
  const [width, setWidth] = useState(0);
  const w = useRef(1);
  const latest = useRef({ config, onChange });
  latest.current = { config, onChange };
  const { min, max } = ctl;
  const toValue = (x: number) => Math.round((min + (Math.max(0, Math.min(w.current, x)) / w.current) * (max - min)) * 100) / 100;
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => value.setValue(toValue(e.nativeEvent.locationX)),
    onPanResponderMove: (e) => value.setValue(toValue(e.nativeEvent.locationX)),
    onPanResponderRelease: (e) => {
      const v = toValue(e.nativeEvent.locationX);
      value.setValue(v);
      latest.current.onChange(ctl.apply(latest.current.config, v));
    },
  }), [value, min, max]);
  const thumbX = width ? value.interpolate({ inputRange: [min, max], outputRange: [0, width], extrapolate: 'clamp' }) : 0;
  const onLayout = (e: LayoutChangeEvent) => { w.current = e.nativeEvent.layout.width; setWidth(e.nativeEvent.layout.width); };
  return (
    <View style={s.row}>
      <Text style={s.label}>{ctl.label}</Text>
      <View style={s.slider} onLayout={onLayout} {...pan.panHandlers}>
        <View style={s.track} pointerEvents="none" />
        <View style={[s.tick, { left: width / 2 }]} pointerEvents="none" />
        <Animated.View pointerEvents="none" style={[s.thumb, { borderColor: accent, transform: [{ translateX: thumbX as any }] }]} />
      </View>
    </View>
  );
}

function NoneIcon() {
  return <View style={s.none}><View style={s.noneBar} /></View>;
}
function Pill({ label, onPress, strong }: { label: string; onPress: () => void; strong?: boolean }) {
  return <Pressable onPress={onPress} style={[s.pill, strong && { backgroundColor: '#2d3440' }]}><Text style={[s.pillText, strong && { color: '#fff' }]}>{label}</Text></Pressable>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  stage: { overflow: 'hidden' },
  toolbar: { position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  pill: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  pillText: { fontSize: 14, fontWeight: '600', color: '#2d3440' },
  tabs: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e3e5e8' },
  tabsInner: { paddingHorizontal: 10, paddingVertical: 10, gap: 8, alignItems: 'center' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, padding: 3, backgroundColor: '#f1f2f5' },
  tabIcon: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: '#e6e8ec' },
  tabImg: { width: 36, height: 36 },
  tabText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  panel: { flex: 1 },
  block: { marginVertical: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { borderRadius: 12, backgroundColor: '#eef0f4', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2.5, borderColor: 'transparent' },
  tileImg: { width: '92%', height: '92%' },
  tileText: { fontSize: 11, color: '#555', textAlign: 'center' },
  swatch: { width: 38, height: 38, borderRadius: 19, borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  label: { width: 104, fontSize: 13, color: '#555' },
  slider: { flex: 1, height: 36, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: '#dfe2e7' },
  tick: { position: 'absolute', width: 2, height: 10, marginLeft: -1, backgroundColor: '#c7cbd2', top: 13 },
  thumb: { position: 'absolute', left: -12, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', borderWidth: 2.5 },
  none: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#9aa0a8', alignItems: 'center', justifyContent: 'center' },
  noneBar: { width: 34, height: 2, backgroundColor: '#9aa0a8', transform: [{ rotate: '-45deg' }] },
});
