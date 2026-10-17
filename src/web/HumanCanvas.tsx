// <HumanCanvas>: the realistic avatar in a React (web) app. Renders on demand only.
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PMREMGenerator, PerspectiveCamera, Scene, SRGBColorSpace,
  Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HumanAvatar, HumanConfig, HumanPackage } from '../human/runtime';

export interface HumanCanvasProps {
  pkg: HumanPackage;
  config: Partial<HumanConfig>;
  framing?: 'face' | 'body';
  /** ARKit-style expression weights, e.g. { mouthSmile: 0.6 } */
  expressions?: Record<string, number>;
  background?: string;
  /** Drag to turn the avatar. Default true. */
  rotatable?: boolean;
  textureSize?: '1k' | '2k';
  className?: string;
  style?: React.CSSProperties;
  onReady?: (avatar: HumanAvatar) => void;
}

export interface HumanCanvasHandle {
  avatar: HumanAvatar | null;
  render(): void;
  /** PNG data URL of the current view. */
  snapshot(): string | null;
}

interface Stage { renderer: WebGLRenderer; scene: Scene; camera: PerspectiveCamera; avatar: HumanAvatar; yaw: number; framing: 'face' | 'body'; frame?: number; ready: boolean }

export const HumanCanvas = forwardRef<HumanCanvasHandle, HumanCanvasProps>(function HumanCanvas(
  { pkg, config, framing = 'face', expressions, background = '#e9ecf1', rotatable = true, textureSize = '2k', className, style, onReady }, ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const ready = useRef(onReady);
  ready.current = onReady;

  const draw = () => {
    const s = stage.current;
    // the skeleton is only bound after the first setConfig
    if (!s || !s.ready || s.frame) return;
    s.frame = requestAnimationFrame(() => {
      s.frame = 0;
      const m = s.avatar.metrics();
      const face = s.framing === 'face';
      const target = face ? new Vector3(0, m.headY - 0.08, 0) : new Vector3(0, m.height * 0.52, 0);
      const h = face ? 0.42 : m.height * 1.12;
      const dist = h / 2 / Math.tan((s.camera.fov * Math.PI) / 360) / Math.min(1, s.camera.aspect * 1.1);
      s.camera.position.set(Math.sin(s.yaw) * dist, target.y + dist * 0.03, Math.cos(s.yaw) * dist);
      s.camera.lookAt(target);
      s.renderer.render(s.scene, s.camera);
    });
  };

  useEffect(() => {
    const el = host.current!;
    const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: rotatable ? 'grab' : 'default' });
    el.appendChild(renderer.domElement);
    const scene = new Scene();
    scene.background = new Color(background);
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    const key = new DirectionalLight('#fff4e8', 1.6);
    key.position.set(1.2, 2.2, 2.5);
    const rim = new DirectionalLight('#dfe8ff', 0.9);
    rim.position.set(-2, 2, -2);
    scene.add(key, rim, new HemisphereLight('#ffffff', '#b9a99a', 0.4));
    const avatar = new HumanAvatar(pkg);
    avatar.textureSize = textureSize;
    scene.add(avatar.group);
    const s: Stage = { renderer, scene, camera: new PerspectiveCamera(24, 1, 0.05, 50), avatar, yaw: 0, framing, ready: false };
    stage.current = s;

    const resize = () => {
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      s.camera.aspect = w / h;
      s.camera.updateProjectionMatrix();
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let drag: number | null = null;
    const canvas = renderer.domElement;
    canvas.onpointerdown = (e) => { if (!rotatable) return; drag = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; };
    canvas.onpointermove = (e) => { if (drag === null) return; s.yaw -= (e.clientX - drag) * 0.01; drag = e.clientX; draw(); };
    canvas.onpointerup = canvas.onpointercancel = () => { drag = null; canvas.style.cursor = rotatable ? 'grab' : 'default'; };

    return () => {
      ro.disconnect();
      if (s.frame) cancelAnimationFrame(s.frame);
      avatar.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
      stage.current = null;
    };
  }, [pkg]);

  const key = JSON.stringify(config);
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    let live = true;
    s.avatar.setConfig(config).then(() => {
      if (!live) return;
      s.ready = true;
      draw();
      ready.current?.(s.avatar);
    });
    return () => { live = false; };
  }, [key, pkg]);

  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    s.framing = framing;
    (s.scene.background as Color).set(background);
    for (const name of s.avatar.expressionNames) s.avatar.setExpression(name, expressions?.[name] ?? 0);
    draw();
  }, [framing, background, JSON.stringify(expressions)]);

  useImperativeHandle(ref, () => ({
    get avatar() { return stage.current?.avatar ?? null; },
    render: draw,
    snapshot() {
      const s = stage.current;
      if (!s) return null;
      s.renderer.render(s.scene, s.camera);
      return s.renderer.domElement.toDataURL('image/png');
    },
  }));

  return <div ref={host} className={className} style={{ position: 'relative', overflow: 'hidden', ...style }} />;
});
