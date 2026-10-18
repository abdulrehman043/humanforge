// <HumanView>: realistic MakeHuman-based avatar for React Native (expo-gl + three).
// Renders on demand only; a static avatar costs no GPU after the first frame.
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, PixelRatio, StyleProp, View, ViewStyle } from 'react-native';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import {
  HumanAvatar, HumanConfig, HumanPackage, LoadOptions, PreloadOptions, TextureTier, loadHumanPackage, warmHumanPackage,
} from '../human/runtime';
import { expoLoadOptions } from './humanExpo';

export interface UseHumanPackageOptions extends Omit<PreloadOptions, keyof LoadOptions | 'onProgress'> {
  /** Host of the mobile texture pack, if not next to the manifest or in manifest.mobileTextures.baseUrl. */
  mobileBaseUrl?: string;
  /** Also download this look's meshes and textures before `ready` (default: true, with DEFAULT_HUMAN). */
  preload?: boolean;
}

/**
 * Preload on Expo: loads the package with the disk cache and JPEG/PNG textures, then downloads
 * everything `config` needs for its first textured frame. Resolves when those files are on disk.
 *
 *   await preloadHumanPackage(ASSETS, { config: savedAvatar, textureSize: '1k' });  // e.g. during splash
 */
export function preloadHumanPackage(baseUrl: string, opts: Omit<PreloadOptions, keyof LoadOptions> & { mobileBaseUrl?: string } = {}) {
  return getPackage(baseUrl, opts.mobileBaseUrl).then(async (pkg) => { await warmHumanPackage(pkg, opts); return pkg; });
}

const packages = new Map<string, Promise<HumanPackage>>();
function getPackage(baseUrl: string, mobileBaseUrl?: string) {
  let p = packages.get(baseUrl);
  if (!p) {
    p = loadHumanPackage(baseUrl, { ...expoLoadOptions, mobileBaseUrl });
    packages.set(baseUrl, p);
    p.catch(() => packages.delete(baseUrl));
  }
  return p;
}

/**
 * Load (and disk-cache) the human package once per base URL. `ready` turns true when the first
 * textured frame can be painted: manifest, base mesh, and (unless `preload: false`) the meshes and
 * textures of `config`, all on disk. `progress` is 0..1 while preloading.
 */
export function useHumanPackage(baseUrl: string, opts: UseHumanPackageOptions = {}) {
  const [pkg, setPkg] = useState<HumanPackage | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const key = JSON.stringify([opts.config ?? null, opts.textureSize ?? '1k', opts.normalMaps ?? true, opts.preload ?? true]);
  useEffect(() => {
    let live = true;
    setReady(false);
    getPackage(baseUrl, opts.mobileBaseUrl)
      .then(async (p) => {
        if (!live) return;
        setPkg(p);
        if (opts.preload !== false) {
          await warmHumanPackage(p, { ...opts, onProgress: (d, t) => live && setProgress(d / t) });
        }
        if (live) { setProgress(1); setReady(true); }
      })
      .catch((e) => live && setError(e));
    return () => { live = false; };
  }, [baseUrl, key]);
  return { pkg, ready, progress, error };
}

export interface HumanViewProps {
  pkg: HumanPackage;
  config: Partial<HumanConfig>;
  framing?: 'face' | 'body';
  /** ARKit-style expression weights, e.g. { mouthSmile: 1 } */
  expressions?: Record<string, number>;
  background?: string;
  rotatable?: boolean;
  /**
   * Texture tier. Default '1k': at face/bust framing on a phone it looks like web '2k'.
   * '512' for lists and avatars under ~120 pt; '2k' only for full-screen close-ups.
   */
  textureSize?: TextureTier;
  /** Render resolution in pixels per point. Default: the device's (max 3). 2 is a good speed/quality balance. */
  pixelRatio?: number;
  /** MSAA. Default true (expo-gl multisampling on iOS, three's antialias elsewhere). */
  antialias?: boolean;
  /** Anisotropic texture filtering. Default 2; 1 turns it off. */
  maxTextureAnisotropy?: number;
  /** Clothing normal maps. Default true; false for lighter materials on low-end phones. */
  normalMaps?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Called once, after the first frame with all textures has been drawn. */
  onReady?: (avatar: HumanAvatar) => void;
}

export interface HumanViewHandle {
  avatar: HumanAvatar | null;
  render(): void;
  snapshot(): Promise<string | null>;
}

export const HumanView = forwardRef<HumanViewHandle, HumanViewProps>(function HumanView(
  {
    pkg, config, framing = 'face', expressions, background = '#e9ecf1', rotatable = true, textureSize = '1k',
    pixelRatio, antialias = true, maxTextureAnisotropy = 2, normalMaps = true, style, onReady,
  }, ref,
) {
  const gl = useRef<ExpoWebGLRenderingContext | null>(null);
  const renderer = useRef<WebGLRenderer | null>(null);
  const yaw = useRef(0);
  const pending = useRef(false);
  const textured = useRef(false); // config applied with all textures loaded
  const readyFired = useRef(false);
  const readyCb = useRef(onReady);
  readyCb.current = onReady;
  const [layout, setLayout] = useState<{ w: number; h: number } | null>(null);

  const stage = useMemo(() => {
    const scene = new Scene();
    scene.background = new Color(background);
    const key = new DirectionalLight('#fff4e8', 2.2);
    key.position.set(1.2, 2.2, 2.5);
    const rim = new DirectionalLight('#dfe8ff', 1.0);
    rim.position.set(-2, 2, -2);
    scene.add(key, rim, new HemisphereLight('#ffffff', '#b9a99a', 1.1));
    const avatar = new HumanAvatar(pkg);
    avatar.textureSize = textureSize;
    avatar.anisotropy = maxTextureAnisotropy;
    avatar.normalMaps = normalMaps;
    scene.add(avatar.group);
    textured.current = false;
    readyFired.current = false;
    return { scene, camera: new PerspectiveCamera(24, 1, 0.05, 50), avatar };
  }, [pkg]);

  useEffect(() => { (stage.scene.background as Color).set(background); requestRender(); }, [background]);

  const draw = () => {
    const ctx = gl.current, r = renderer.current;
    if (!ctx || !r) return;
    const { camera, avatar } = stage;
    const w = ctx.drawingBufferWidth, h = ctx.drawingBufferHeight;
    if (r.domElement.width !== w || r.domElement.height !== h) {
      r.domElement.width = w; r.domElement.height = h;
      r.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const m = avatar.metrics();
    const target = framing === 'face' ? new Vector3(0, m.headY - 0.08, 0) : new Vector3(0, m.height * 0.52, 0);
    const vh = framing === 'face' ? 0.42 : m.height * 1.12;
    const dist = vh / 2 / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect * 1.1);
    camera.position.set(Math.sin(yaw.current) * dist, target.y + dist * 0.03, Math.cos(yaw.current) * dist);
    camera.lookAt(target);
    r.render(stage.scene, camera);
    ctx.endFrameEXP();
    if (textured.current && !readyFired.current) {
      readyFired.current = true;
      readyCb.current?.(avatar);
    }
  };
  const requestRender = () => {
    if (pending.current) return;
    pending.current = true;
    requestAnimationFrame(() => { pending.current = false; draw(); });
  };

  const onContextCreate = (ctx: ExpoWebGLRenderingContext) => {
    const w = ctx.drawingBufferWidth, h = ctx.drawingBufferHeight;
    const canvas = { width: w, height: h, style: {}, clientWidth: w, clientHeight: h, addEventListener: () => {}, removeEventListener: () => {}, getContext: () => ctx };
    const r = new WebGLRenderer({ canvas: canvas as any, context: ctx as any, antialias });
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = ACESFilmicToneMapping;
    stage.camera.aspect = w / h;
    stage.camera.updateProjectionMatrix();
    gl.current = ctx;
    renderer.current = r;
    requestRender();
  };

  // Shape/color changes reuse the cached textures; only a new item or tier loads files.
  const key = JSON.stringify(config);
  useEffect(() => {
    let live = true;
    stage.avatar.setConfig(config).then(() => {
      if (!live) return;
      textured.current = true;
      requestRender();
    });
    return () => { live = false; };
  }, [key, stage]);

  // quality knobs that need the textures reapplied
  useEffect(() => {
    const a = stage.avatar;
    if (a.textureSize === textureSize && a.anisotropy === maxTextureAnisotropy && a.normalMaps === normalMaps) return;
    a.textureSize = textureSize;
    a.anisotropy = maxTextureAnisotropy;
    a.normalMaps = normalMaps;
    a.reloadTextures().then(requestRender);
  }, [textureSize, maxTextureAnisotropy, normalMaps, stage]);

  useEffect(() => {
    for (const [k, v] of Object.entries(expressions ?? {})) stage.avatar.setExpression(k, v);
    requestRender();
  }, [JSON.stringify(expressions), framing]);

  useEffect(() => () => { stage.avatar.dispose(); renderer.current?.dispose(); gl.current = null; renderer.current = null; }, [stage]);

  const pan = useMemo(() => {
    let start = 0;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => { start = yaw.current; },
      onPanResponderMove: (_, g) => { yaw.current = start - g.dx * 0.01; requestRender(); },
      onPanResponderTerminationRequest: () => false,
    });
  }, []);

  useImperativeHandle(ref, () => ({
    avatar: stage.avatar,
    render: requestRender,
    async snapshot() {
      if (!gl.current) return null;
      draw();
      const snap = await GLView.takeSnapshotAsync(gl.current, { format: 'png' });
      return typeof snap.uri === 'string' ? snap.uri : null;
    },
  }));

  // expo-gl sizes its buffer to (view size x device scale). For a lower pixelRatio, render a
  // smaller GLView and scale it up to fill the box.
  const device = Math.min(3, PixelRatio.get());
  const k = pixelRatio && pixelRatio < device ? pixelRatio / device : 1;
  const onLayout = (e: LayoutChangeEvent) => setLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const glStyle: StyleProp<ViewStyle> = k === 1 || !layout
    ? { flex: 1 }
    : {
      position: 'absolute', width: layout.w * k, height: layout.h * k,
      left: (layout.w - layout.w * k) / 2, top: (layout.h - layout.h * k) / 2, transform: [{ scale: 1 / k }],
    };

  return (
    <View style={[{ overflow: 'hidden' }, style]} onLayout={onLayout} {...(rotatable ? pan.panHandlers : null)}>
      {k === 1 || layout ? (
        <GLView style={glStyle} msaaSamples={antialias ? 4 : 0} onContextCreate={onContextCreate} />
      ) : null}
    </View>
  );
});
