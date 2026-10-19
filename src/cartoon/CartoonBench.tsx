// <CartoonBench>: on-device acceptance test for the cartoon avatar. Drop it into a dev screen of
// your app, run it on a weak Android and a mid iPhone, and it reports each SLO as PASS/FAIL:
//
//   1. First frame after warm  <= 300 ms   (files on disk -> all layers of the first angle drawn)
//   2. Slider drag: no JS stalls          (2 s of 60 Hz slider updates; JS frame p95 <= 20 ms, max <= 50 ms)
//   3. Swap keeps the previous look        (hair/outfit swap: old look stays, new one within 1 s from disk)
//   4. Angle swipe                         (JS stays free while all 5 angles are swiped through)
//
// The UI thread renders the slider and swipe animations natively; confirm ~60 fps there with the
// RN Perf Monitor (iOS/Android dev menu) or `scripts/android-jank.sh` (gfxinfo jank %).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { CartoonView, CartoonViewHandle } from './CartoonView';
import { CARTOON_SLIDERS, CartoonConfig, CartoonSliderId, DEFAULT_CARTOON, cartoonFiles } from './model';
import type { CartoonPackage } from './package';

export interface CartoonBenchProps {
  pkg: CartoonPackage;
  config?: Partial<CartoonConfig>;
  width?: number;
}

interface Result { name: string; value: string; pass: boolean | null; note?: string }

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];

/** Record JS frame intervals (requestAnimationFrame) while `work` runs. */
const workTimes: number[] = [];
async function jsFrames(ms: number, onFrame?: (i: number) => void) {
  const gaps: number[] = [];
  workTimes.length = 0;
  return new Promise<number[]>((resolve) => {
    const t0 = now();
    let last = t0, i = 0;
    const tick = () => {
      const t = now();
      gaps.push(t - last);
      last = t;
      if (onFrame) { const w0 = now(); onFrame(i++); workTimes.push(now() - w0); }
      if (t - t0 < ms) requestAnimationFrame(tick);
      else resolve(gaps.slice(1));
    };
    requestAnimationFrame(tick);
  });
}

export function CartoonBench({ pkg, config, width = 240 }: CartoonBenchProps) {
  const base = { ...DEFAULT_CARTOON, ...config } as CartoonConfig;
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [mount, setMount] = useState<{ n: number; cfg: CartoonConfig } | null>(null);
  const ready = useRef<(() => void) | null>(null);
  const committed = useRef<((k: string) => void) | null>(null);
  const view = useRef<CartoonViewHandle>(null);
  const values = useRef(Object.fromEntries(CARTOON_SLIDERS.map((s) => [s.id, new Animated.Value(0)])) as Record<CartoonSliderId, Animated.Value>).current;
  const add = (r: Result) => setResults((x) => [...x, r]);
  (globalThis as any).__cartoonBenchValues = values; // for profiling from a debugger

  const remount = (cfg: CartoonConfig) => new Promise<number>((resolve) => {
    const t0 = now();
    ready.current = () => resolve(now() - t0);
    setMount((m) => ({ n: (m?.n ?? 0) + 1, cfg }));
  });

  async function run() {
    setRunning(true);
    setResults([]);
    try {
      // warm: everything on disk first (the SLO is about drawing from cache)
      const hairs = pkg.manifest.items.hair.filter((h) => h.fit !== 'male').map((h) => h.id);
      const outfits = pkg.manifest.items.outfit.map((o) => o.id);
      const swapA = { ...base }, swapB = { ...base, hair: hairs.find((h) => h !== base.hair) ?? base.hair, outfit: outfits[0] };
      await pkg.ensure([...cartoonFiles(pkg.manifest, swapA), ...cartoonFiles(pkg.manifest, swapB)]);

      // 1. first frame after warm (5 cold mounts, median)
      const firsts: number[] = [];
      for (let i = 0; i < 5; i++) firsts.push(await remount({ ...base }));
      const ff = median(firsts);
      add({ name: 'First frame after warm', value: `${Math.round(ff)} ms (median of 5; ${firsts.map(Math.round).join(', ')})`, pass: ff <= 300 });

      // 2. slider drag: 2 s of per-frame updates on three sliders
      await new Promise((r) => setTimeout(r, 400));
      const gaps = await jsFrames(2000, (i) => {
        const v = Math.sin(i / 12);
        values.eyeSize.setValue(v); values.headSize.setValue(v * 0.6); values.bodyWidth.setValue(-v);
      });
      for (const id of ['eyeSize', 'headSize', 'bodyWidth'] as CartoonSliderId[]) values[id].setValue(0);
      const p95 = pct(gaps, 0.95), worst = Math.max(...gaps), dropped = gaps.filter((g) => g > 20).length;
      const work = workTimes.length ? workTimes.reduce((a, b) => a + b, 0) / workTimes.length : 0;
      add({ name: 'Slider drag (JS thread)', value: `p95 ${p95.toFixed(1)} ms, worst ${worst.toFixed(0)} ms, ${dropped}/${gaps.length} frames > 20 ms; JS cost per update ${work.toFixed(2)} ms`, pass: p95 <= 20 && worst <= 50 && work < 2 });

      // 3. swap: hair + outfit change; previous look stays until the new layers are loaded
      const t0 = now();
      const done = new Promise<number>((resolve) => { committed.current = () => resolve(now() - t0); });
      setMount((m) => (m ? { ...m, cfg: swapB } : m));
      const swapGaps = jsFrames(600);
      const swapMs = await Promise.race([done, new Promise<number>((r) => setTimeout(() => r(-1), 5000))]);
      const sg = await swapGaps;
      committed.current = null;
      add({ name: 'Hair/outfit swap', value: swapMs < 0 ? 'did not commit within 5 s' : `new look after ${Math.round(swapMs)} ms; worst JS frame ${sg.length ? Math.max(...sg).toFixed(0) + ' ms' : 'n/a'}`, pass: swapMs >= 0 && swapMs <= 1000, note: 'the previous look stays on screen until then (by design); target: new look within 1 s from disk' });

      // 4. angle swipe through all angles and back
      const ids = pkg.manifest.views.map((v) => v.id);
      const sweep = jsFrames(ids.length * 2 * 350);
      for (const id of [...ids, ...[...ids].reverse()]) { view.current?.setView(id, true); await new Promise((r) => setTimeout(r, 350)); }
      const sw = await sweep;
      view.current?.setView('front', false);
      add({ name: 'Angle swipe (JS thread)', value: `p95 ${pct(sw, 0.95).toFixed(1)} ms, worst ${Math.max(...sw).toFixed(0)} ms`, pass: pct(sw, 0.95) <= 20, note: 'check UI-thread fps with Perf Monitor / android-jank.sh while this runs' });
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => { remount(base); }, []);
  const allPass = results.length === 4 && results.every((r) => r.pass);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ alignItems: 'center', height: width * 1.6 }}>
        {mount ? (
          <CartoonView key={mount.n} ref={view} pkg={pkg} config={mount.cfg} width={width} shapeValues={values}
            onReady={() => { ready.current?.(); ready.current = null; }} onSwapCommitted={(k) => committed.current?.(k)} />
        ) : null}
      </View>
      <Pressable disabled={running} onPress={run} style={{ backgroundColor: running ? '#999' : '#2d3440', padding: 14, borderRadius: 12, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{running ? 'Running…' : 'Run performance test'}</Text>
      </Pressable>
      {results.map((r) => (
        <View key={r.name} style={{ padding: 12, borderRadius: 10, backgroundColor: r.pass === false ? '#fde8e8' : '#e8f6ec' }}>
          <Text style={{ fontWeight: '700' }}>{r.pass === false ? '✗' : '✓'} {r.name}</Text>
          <Text>{r.value}</Text>
          {r.note ? <Text style={{ color: '#666', fontSize: 12 }}>{r.note}</Text> : null}
        </View>
      ))}
      {results.length === 4 ? (
        <Pressable onPress={() => Share.share({ message: JSON.stringify({ density: pkg.density, results }, null, 2) })} style={{ padding: 12, alignItems: 'center' }}>
          <Text style={{ color: allPass ? '#1a7f37' : '#b42318', fontWeight: '700' }}>{allPass ? 'All JS-side checks pass' : 'Some checks failed'} · Share results</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
