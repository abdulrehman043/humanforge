// <HumanView>: realistic MakeHuman-based avatar for React Native (expo-gl + three).
// Renders on demand only; a static avatar costs no GPU after the first frame.
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleProp, View, ViewStyle } from 'react-native';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { HumanAvatar, HumanConfig, HumanPackage, loadHumanPackage } from '../human/runtime';
import { expoLoadOptions } from './humanExpo';

/** Load (and disk-cache) the human package once per base URL. */
const packages = new Map<string, Promise<HumanPackage>>();
export function useHumanPackage(baseUrl: string) {
  const [pkg, setPkg] = useState<HumanPackage | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let p = packages.get(baseUrl);
    if (!p) {
      p = loadHumanPackage(baseUrl, expoLoadOptions);
      packages.set(baseUrl, p);
      p.catch(() => packages.delete(baseUrl));
    }
    let live = true;
    p.then((v) => live && setPkg(v), (e) => live && setError(e));
    return () => { live = false; };
  }, [baseUrl]);
  return { pkg, error };
}

export interface HumanViewProps {
  pkg: HumanPackage;
  config: Partial<HumanConfig>;
  framing?: 'face' | 'body';
  /** ARKit-style expression weights, e.g. { mouthSmile: 1 } */
  expressions?: Record<string, number>;
  background?: string;
  rotatable?: boolean;
  /** '1k' textures for lists/low-end devices, '2k' for the editor. */
  textureSize?: '1k' | '2k';
  style?: StyleProp<ViewStyle>;
  onReady?: (avatar: HumanAvatar) => void;
}

export interface HumanViewHandle {
  avatar: HumanAvatar | null;
  render(): void;
  snapshot(): Promise<string | null>;
}

export const HumanView = forwardRef<HumanViewHandle, HumanViewProps>(function HumanView(
  { pkg, config, framing = 'face', expressions, background = '#e9ecf1', rotatable = true, textureSize = '2k', style, onReady }, ref,
) {
  const gl = useRef<ExpoWebGLRenderingContext | null>(null);
  const renderer = useRef<WebGLRenderer | null>(null);
  const yaw = useRef(0);
  const pending = useRef(false);
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
    scene.add(avatar.group);
    return { scene, camera: new PerspectiveCamera(24, 1, 0.05, 50), avatar };
  }, [pkg]);

  const draw = () => {
    if (!gl.current || !renderer.current) return;
    const { camera, avatar } = stage;
    const m = avatar.metrics();
    const target = framing === 'face' ? new Vector3(0, m.headY - 0.08, 0) : new Vector3(0, m.height * 0.52, 0);
    const h = framing === 'face' ? 0.42 : m.height * 1.12;
    const dist = h / 2 / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect * 1.1);
    camera.position.set(Math.sin(yaw.current) * dist, target.y + dist * 0.03, Math.cos(yaw.current) * dist);
    camera.lookAt(target);
    renderer.current.render(stage.scene, camera);
    gl.current.endFrameEXP();
  };
  const requestRender = () => {
    if (pending.current) return;
    pending.current = true;
    requestAnimationFrame(() => { pending.current = false; draw(); });
  };

  const onContextCreate = (ctx: ExpoWebGLRenderingContext) => {
    const w = ctx.drawingBufferWidth, h = ctx.drawingBufferHeight;
    const canvas = { width: w, height: h, style: {}, clientWidth: w, clientHeight: h, addEventListener: () => {}, removeEventListener: () => {}, getContext: () => ctx };
    const r = new WebGLRenderer({ canvas: canvas as any, context: ctx as any, antialias: true });
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

  const key = JSON.stringify(config);
  useEffect(() => {
    let live = true;
    stage.avatar.setConfig(config).then(() => {
      if (!live) return;
      requestRender();
      onReady?.(stage.avatar);
    });
    return () => { live = false; };
  }, [key, stage]);

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

  return (
    <View style={[{ overflow: 'hidden' }, style]} {...(rotatable ? pan.panHandlers : null)}>
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
    </View>
  );
});
