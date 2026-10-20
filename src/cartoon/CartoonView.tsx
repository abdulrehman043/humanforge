// <CartoonView>: layered 2D cartoon avatar for React Native (no GL). Every part is a small PNG
// shown with <Image>; colors use native tintColor, sliders and the angle swipe run on the native
// animation driver, so editing and turning never re-render React or block the JS thread.
//
// - Item swaps (hair, outfit…) are double-buffered: the new layer set is mounted invisibly and only
//   replaces the old one once every image has loaded, so the avatar never blanks.
// - Color and slider changes reuse the mounted images.
// - Only the visible angle mounts at first; the others mount right after the first frame.
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Image, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import {
  CartoonBuild, CartoonConfig, CartoonPivots, CartoonSliderId, CartoonView as ViewDef, DEFAULT_CARTOON, ResolvedLayer, TransformGroup, cartoonItemKey, cartoonLayers, cartoonPivots,
  groupSteps, layerMatrix,
} from './model';
import type { CartoonPackage } from './package';

export type CartoonFraming = 'full' | 'bust' | 'head';
export type CartoonShapeValues = Partial<Record<CartoonSliderId, Animated.Value>>;

export interface CartoonViewProps {
  pkg: CartoonPackage;
  config: Partial<CartoonConfig>;
  /** Width in points; the height follows the framing (full body: 1.6 x width). */
  width: number;
  framing?: CartoonFraming;
  /** Initial angle: view id ('front', 'three_r', 'side_r', 'three_l', 'side_l') or index. */
  view?: string;
  /** Swipe horizontally to turn the avatar. Default true. */
  swipe?: boolean;
  /** 5 angles (default) or 3 (front and both three-quarter views). */
  angles?: 3 | 5;
  background?: string;
  /**
   * Live slider values (Animated.Value per shape slider). The editor passes these so dragging
   * updates natively; without them the view uses config.shape.
   */
  shapeValues?: CartoonShapeValues;
  /** Fires once, when the first angle has all its layers loaded and drawn. */
  onReady?: () => void;
  onViewChange?: (viewId: string) => void;
  /** Diagnostics: an item swap became visible on the starting angle (all its layers loaded). */
  onSwapCommitted?: (itemKey: string) => void;
  style?: StyleProp<ViewStyle>;
}

export interface CartoonViewHandle {
  /** PNG of the current view (needs react-native-view-shot). Returns a file URI (data URI on web). */
  snapshot(opts?: { width?: number; format?: 'png' | 'jpg' }): Promise<string>;
  setView(viewId: string, animated?: boolean): void;
}

/**
 * Hand slider values to the native animation driver (iOS/Android). After this, setValue() updates
 * the native animated graph directly: no JS-side style work and no React render per slider move.
 * Without it React Native would recompute every layer's transform in JS on each move.
 */
export function makeNativeValues(values: Record<string, Animated.Value>) {
  if (Platform.OS === 'web') return;
  for (const v of Object.values(values)) {
    if ((v as any).__isNative) continue;
    Animated.timing(v, { toValue: (v as any).__getValue(), duration: 0, useNativeDriver: true }).start();
  }
}

// crops for the built-in chibi art; a manifest can override them (commissioned art has other proportions)
const FRAMES: Record<CartoonFraming, { x: number; y: number; w: number; h: number }> = {
  full: { x: 0, y: 0, w: 400, h: 640 },
  bust: { x: 40, y: 20, w: 320, h: 360 },
  head: { x: 70, y: 30, w: 260, h: 260 },
};
const SLIDERS: CartoonSliderId[] = ['headSize', 'faceWidth', 'eyeSize', 'eyeHeight', 'browHeight', 'noseSize', 'mouthWidth', 'mouthHeight', 'bodyWidth', 'height'];

export const CartoonView = forwardRef<CartoonViewHandle, CartoonViewProps>(function CartoonView(
  { pkg, config, width, framing = 'full', view = 'front', swipe = true, angles = 5, background, shapeValues, onReady, onViewChange, onSwapCommitted, style }, ref,
) {
  const m = pkg.manifest;
  const c = useMemo(() => ({ ...DEFAULT_CARTOON, ...config, shape: { ...config.shape } }) as CartoonConfig, [JSON.stringify(config)]);
  const views = useMemo(() => (angles === 3 ? m.views.filter((v) => v.id !== 'side_l' && v.id !== 'side_r') : m.views), [m, angles]);
  const frame = m.frames?.[framing] ?? (framing === 'full' ? { x: 0, y: 0, w: m.canvas.w, h: m.canvas.h } : FRAMES[framing]);
  const k = width / frame.w; // points per canvas unit
  const height = Math.round(frame.h * k);
  const startIndex = Math.max(0, views.findIndex((v) => v.id === view));

  // shape sliders: own values unless the editor drives them
  const own = useMemo(() => Object.fromEntries(SLIDERS.map((id) => [id, new Animated.Value(c.shape[id] ?? 0)])) as Record<CartoonSliderId, Animated.Value>, []);
  const values = useMemo(() => ({ ...own, ...shapeValues }) as Record<CartoonSliderId, Animated.Value>, [own, shapeValues]);
  useEffect(() => makeNativeValues(values), [values]);
  useEffect(() => { if (!shapeValues) for (const id of SLIDERS) own[id].setValue(c.shape[id] ?? 0); }, [JSON.stringify(c.shape), shapeValues]);

  const scrollX = useRef(new Animated.Value(startIndex * width)).current;
  const scroller = useRef<any>(null);
  const shot = useRef<View>(null);
  const [active, setActive] = useState(startIndex);
  // Hidden angles follow item swaps only after the visible angle has committed its new look, then
  // one per frame, nearest first, so a swap never re-renders all angles at once (no JS spike).
  // Colour/slider-only edits apply to every angle at once (cheap: no new images).
  const [lagged, setLagged] = useState<CartoonConfig[]>(() => views.map(() => c));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]); // staggered swap updates
  const mountTimers = useRef<ReturnType<typeof setTimeout>[]>([]); // staggered first mounts
  const cKey = cartoonItemKey(m, c);
  useEffect(() => {
    setLagged((cur) => cur.map((x) => (cartoonItemKey(m, x) === cKey ? c : x)));
  }, [c]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); mountTimers.current.forEach(clearTimeout); }, []);
  const activeCommitted = (key: string) => {
    if (key !== cKey) return;
    timers.current.forEach(clearTimeout);
    const order = views.map((_, i) => i).filter((i) => i !== active).sort((a, b) => Math.abs(a - active) - Math.abs(b - active));
    timers.current = order.map((i, n) => setTimeout(() => setLagged((cur) => cur.map((x, j) => (j === i ? c : x))), 34 * (n + 1)));
  };
  // angles mounted so far: the starting one first, the rest one per frame after the first frame
  const [mounted, setMounted] = useState<number[]>(() => (swipe ? [startIndex] : views.map((_, i) => i)));
  const readyFired = useRef(false);
  const readyCb = useRef(onReady);
  readyCb.current = onReady;

  const firstReady = () => {
    if (readyFired.current) return;
    readyFired.current = true;
    requestAnimationFrame(() => readyCb.current?.());
    // mount the other angles after the first frame, nearest first and one per frame, so swiping is
    // instant later without a JS spike now
    if (swipe) {
      const order = views.map((_, i) => i).filter((i) => i !== startIndex).sort((a, b) => Math.abs(a - startIndex) - Math.abs(b - startIndex));
      order.forEach((i, n) => mountTimers.current.push(setTimeout(() => setMounted((cur) => (cur.includes(i) ? cur : [...cur, i])), 34 * (n + 1))));
    }
  };

  useImperativeHandle(ref, () => ({
    async snapshot(opts = {}) {
      let viewShot: any;
      try { viewShot = require('react-native-view-shot'); } catch { throw new Error('snapshot() needs react-native-view-shot (npx expo install react-native-view-shot)'); }
      return viewShot.captureRef(shot.current, { format: opts.format ?? 'png', quality: 1, width: opts.width, result: 'tmpfile' });
    },
    setView(id, animated = true) {
      const i = views.findIndex((v) => v.id === id);
      if (i >= 0) scroller.current?.scrollTo({ x: i * width, animated });
    },
  }), [views, width]);

  return (
    <View style={[{ width, height, overflow: 'hidden', backgroundColor: background }, style]}>
      <View ref={shot} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="none">
        {views.map((v, i) => {
          if (!mounted.includes(i)) return null;
          // quick cross-dissolve around the midpoint between angles reads as turning
          const w = width, d = 0.12 * w;
          const opacity = views.length === 1 || !swipe ? (i === startIndex ? 1 : 0) : scrollX.interpolate({
            inputRange: [(i - 0.5) * w - d, (i - 0.5) * w + d, (i + 0.5) * w - d, (i + 0.5) * w + d],
            outputRange: [i === 0 ? 1 : 0, 1, 1, i === views.length - 1 ? 1 : 0],
            extrapolate: 'clamp',
          });
          // invisible angles are also moved out of the clip area, so neither platform draws them
          const park = views.length === 1 || !swipe ? (i === startIndex ? 0 : 100000) : scrollX.interpolate({
            inputRange: [(i - 0.5) * w - d - 1, (i - 0.5) * w - d, (i + 0.5) * w + d, (i + 0.5) * w + d + 1],
            outputRange: [i === 0 ? 0 : 100000, 0, 0, i === views.length - 1 ? 0 : 100000],
            extrapolate: 'clamp',
          });
          const isActive = i === active;
          return (
            <Animated.View key={v.id} style={[StyleSheet.absoluteFill, { opacity, transform: [{ translateY: park as any }, ...(v.mirror ? [{ scaleX: -1 }] : [])] }]}>
              <ViewStack pkg={pkg} config={isActive ? c : lagged[i] ?? c} view={v} k={k} frame={frame} values={values} onReady={i === startIndex ? firstReady : undefined}
                onCommit={isActive ? (key) => { activeCommitted(key); onSwapCommitted?.(key); } : undefined} />
            </Animated.View>
          );
        })}
      </View>
      {swipe && views.length > 1 ? (
        <Animated.ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: startIndex * width, y: 0 }}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
          // contentOffset is ignored on some platforms: jump to the start angle once laid out
          onLayout={() => scroller.current?.scrollTo({ x: startIndex * width, animated: false })}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            if (i !== active) { setActive(i); onViewChange?.(views[i].id); }
          }}
          style={StyleSheet.absoluteFill}
        >
          <View style={{ width: width * views.length, height }} />
        </Animated.ScrollView>
      ) : null}
    </View>
  );
});

// ---------------------------------------------------------------- one angle, double-buffered
interface StackProps { pkg: CartoonPackage; config: CartoonConfig; view: ViewDef; k: number; frame: { x: number; y: number }; values: Record<CartoonSliderId, Animated.Value>; onReady?: () => void; onCommit?: (key: string) => void }

function ViewStack({ pkg, config, view, k, frame, values, onReady, onCommit }: StackProps) {
  const m = pkg.manifest;
  const itemKey = cartoonItemKey(m, config);
  const layers = cartoonLayers(m, config, view.src);
  // the set on screen; a new item set is mounted invisibly until all of its images have loaded
  const [shown, setShown] = useState<{ key: string; layers: ResolvedLayer[]; build: CartoonBuild } | null>(null);
  const counted = useRef<{ key: string; n: number }>({ key: '', n: 0 });
  const commit = (key: string) => setShown((cur) => (cur?.key === key ? cur : { key, layers: cartoonLayers(m, configRef.current, view.src), build: configRef.current.build }));
  const configRef = useRef(config);
  configRef.current = config;
  const onLoad = (key: string, total: number) => () => {
    if (counted.current.key !== key) counted.current = { key, n: 0 };
    if (++counted.current.n >= total) commit(key);
  };
  useEffect(() => {
    if (shown?.key === itemKey) return;
    // A swap commits when every new image has loaded (or failed). This is only a last resort for a
    // request that never settles: until then the previous look stays on screen.
    const t = setTimeout(() => commit(itemKey), 12000);
    return () => clearTimeout(t);
  }, [itemKey, shown?.key]);
  const readyDone = useRef(false);
  useEffect(() => { if (shown && !readyDone.current) { readyDone.current = true; onReady?.(); } }, [shown]);
  useEffect(() => { if (shown) onCommit?.(shown.key); }, [shown?.key]);

  // Buffers keyed by item set: React keeps the incoming buffer's views when it becomes visible
  // (only its opacity flips), so committing a swap never remounts or reloads images.
  const buffers: { key: string; layers: ResolvedLayer[]; build: CartoonBuild; visible: boolean }[] = [];
  if (shown && shown.key !== itemKey) buffers.push({ key: shown.key, layers: shown.layers, build: shown.build, visible: true });
  buffers.push({ key: itemKey, layers, build: config.build, visible: shown?.key === itemKey });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {buffers.map((b) => (
        <View key={b.key} style={[StyleSheet.absoluteFill, { opacity: b.visible ? 1 : 0 }]}>
          <Layers layers={b.layers} build={b.build} pkg={pkg} view={view} k={k} frame={frame} values={values} onLoad={b.visible ? undefined : onLoad(b.key, b.layers.length)} />
        </View>
      ))}
    </View>
  );
}

/** Consecutive layers with the same transform groups share one animated wrapper. */
function Layers({ layers, build, pkg, view, k, frame, values, onLoad }: { layers: ResolvedLayer[]; build: CartoonBuild; pkg: CartoonPackage; view: ViewDef; k: number; frame: { x: number; y: number }; values: Record<CartoonSliderId, Animated.Value>; onLoad?: () => void }) {
  const pivots = cartoonPivots(pkg.manifest, build, view.src);
  const runs: { groups: TransformGroup[]; items: ResolvedLayer[] }[] = [];
  for (const l of layers) {
    const last = runs[runs.length - 1];
    if (last && last.groups.join() === l.groups.join()) last.items.push(l);
    else runs.push({ groups: l.groups, items: [l] });
  }
  const W = pkg.manifest.canvas.w * k, H = pkg.manifest.canvas.h * k;
  return (
    <>
      {runs.map((run, i) => (
        <Wrapper key={`${i}:${run.groups.join()}`} groups={run.groups} pivots={pivots} values={values} k={k} center={[W / 2, H / 2]}
          style={{ position: 'absolute', left: -frame.x * k, top: -frame.y * k, width: W, height: H }}>
          {run.items.map((l) => (
            <Image
              key={l.role}
              source={{ uri: pkg.uri(l.file.f) }}
              fadeDuration={0}
              resizeMode="stretch"
              onLoad={onLoad}
              onError={onLoad}
              style={{
                position: 'absolute', left: l.file.x * k, top: l.file.y * k, width: l.file.w * k, height: l.file.h * k,
                ...(l.color ? { tintColor: l.color } : null),
              }}
            />
          ))}
        </Wrapper>
      ))}
    </>
  );
}

/**
 * Native: Animated.View whose transform runs on the native driver. Web (no native driver): a plain
 * View whose CSS matrix is set directly from value listeners, so slider moves never re-render React.
 */
function Wrapper({ groups, pivots, values, k, center, style, children }: { groups: TransformGroup[]; pivots: CartoonPivots; values: Record<CartoonSliderId, Animated.Value>; k: number; center: [number, number]; style: ViewStyle; children: React.ReactNode }) {
  const node = useRef<any>(null);
  const web = Platform.OS === 'web';
  useEffect(() => {
    if (!web || !groups.length) return;
    const steps = groups.flatMap((g) => groupSteps(g, pivots));
    const sliders = [...new Set(steps.map((st) => st.slider))];
    const apply = () => {
      const shape = Object.fromEntries(sliders.map((id) => [id, (values[id] as any).__getValue()]));
      const [a, b, c, d, e, f] = layerMatrix(steps, shape);
      const el = node.current as HTMLElement | null;
      if (el?.style) { el.style.transformOrigin = '0 0'; el.style.transform = `matrix(${a},${b},${c},${d},${e * k},${f * k})`; }
    };
    apply();
    const subs = sliders.map((id) => [id, values[id].addListener(apply)] as const);
    return () => subs.forEach(([id, sub]) => values[id].removeListener(sub));
  }, [groups.join(), pivots, values, k]);
  if (web) return <View ref={node} style={style}>{children}</View>;
  return <Animated.View style={[style, { transform: animatedTransform(groups, pivots, values, k, center) }]}>{children}</Animated.View>;
}

/**
 * Native-driver transform for a run of layers: each step scales about its pivot (RN scales about
 * the view center, so pivots are expressed relative to it) or translates.
 */
const transformCache = new WeakMap<object, Map<string, any[]>>();
function animatedTransform(groups: TransformGroup[], pivots: CartoonPivots, values: Record<CartoonSliderId, Animated.Value>, k: number, center: [number, number]) {
  let cache = transformCache.get(values);
  if (!cache) { cache = new Map(); transformCache.set(values, cache); }
  const key = `${groups.join()}|${k}|${center.join()}|${JSON.stringify(pivots)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [cx, cy] = center; // wrapper center in points
  const out: any[] = [];
  for (const g of groups) {
    for (const st of groupSteps(g, pivots)) {
      const v = values[st.slider];
      if (st.op === 'translateY') { out.push({ translateY: Animated.multiply(v, st.gain * k) }); continue; }
      const s = Animated.add(1, Animated.multiply(v, st.gain));
      const px = st.pivot[0] * k - cx, py = st.pivot[1] * k - cy;
      out.push({ translateX: px }, { translateY: py });
      out.push(st.op === 'scale' ? { scale: s } : st.op === 'scaleX' ? { scaleX: s } : { scaleY: s });
      out.push({ translateX: -px }, { translateY: -py });
    }
  }
  cache.set(key, out);
  return out;
}
