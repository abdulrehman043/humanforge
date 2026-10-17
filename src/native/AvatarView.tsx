// <AvatarView>: renders an avatar with expo-gl + three (no expo-three, no R3F).
// Renders on demand only (on change / drag), so an idle avatar costs zero GPU.
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { PanResponder, StyleProp, View, ViewStyle } from 'react-native';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { WebGLRenderer } from 'three';
import { AvatarConfig, AvatarStage, Framing, avatarToGLB, encodeAvatar, normalizeConfig, toBase64 } from '../core';

export interface AvatarViewProps {
  config: Partial<AvatarConfig>;
  framing?: Framing;
  /** Hex background, or null for transparent. */
  background?: string | null;
  /** Faceted low-poly shading (default true). */
  flatShading?: boolean;
  /** Drag horizontally to spin (default true). */
  rotatable?: boolean;
  /** Slowly spin continuously (renders every frame while on). */
  autoRotate?: boolean;
  /** Initial yaw in radians. */
  yaw?: number;
  style?: StyleProp<ViewStyle>;
  onReady?: () => void;
}

export interface AvatarViewHandle {
  /** Render and save a PNG; resolves to a local file URI. */
  snapshot(): Promise<string | null>;
  /** Binary glTF of the current avatar, base64 encoded (write with expo-file-system). */
  toGLBBase64(): string;
  setYaw(yaw: number): void;
}

export const AvatarView = forwardRef<AvatarViewHandle, AvatarViewProps>(function AvatarView(
  { config, framing = 'body', background = '#eef1f5', flatShading = true, rotatable = true, autoRotate = false, yaw = 0, style, onReady },
  ref,
) {
  const stage = useMemo(() => new AvatarStage(background), []);
  const gl = useRef<ExpoWebGLRenderingContext | null>(null);
  const renderer = useRef<WebGLRenderer | null>(null);
  const pending = useRef(false);
  const live = useRef({ autoRotate, config, flatShading });
  live.current = { autoRotate, config, flatShading };
  const key = encodeAvatar(normalizeConfig(config));

  const requestRender = () => {
    if (pending.current || !gl.current || !renderer.current) return;
    pending.current = true;
    requestAnimationFrame(() => {
      pending.current = false;
      if (!gl.current || !renderer.current) return;
      if (live.current.autoRotate) stage.setYaw(stage.yaw + 0.012);
      renderer.current.render(stage.scene, stage.camera);
      gl.current.endFrameEXP();
      if (live.current.autoRotate) requestRender();
    });
  };

  const onContextCreate = (ctx: ExpoWebGLRenderingContext) => {
    const w = ctx.drawingBufferWidth, h = ctx.drawingBufferHeight;
    // Minimal canvas shim: three only needs size + no-op listeners when given a context.
    const canvas = {
      width: w, height: h, style: {}, clientWidth: w, clientHeight: h,
      addEventListener: () => {}, removeEventListener: () => {}, getContext: () => ctx,
    };
    const r = new WebGLRenderer({ canvas: canvas as any, context: ctx as any, antialias: true, alpha: background === null });
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    if (background === null) r.setClearColor(0x000000, 0);
    gl.current = ctx;
    renderer.current = r;
    stage.setSize(w, h);
    stage.setFraming(framing);
    stage.setYaw(yaw);
    stage.setAvatar(config, { flatShading });
    requestRender();
    onReady?.();
  };

  useEffect(() => {
    if (!renderer.current) return;
    stage.setAvatar(live.current.config, { flatShading: live.current.flatShading });
    requestRender();
  }, [key, flatShading]);

  useEffect(() => {
    stage.setFraming(framing);
    requestRender();
  }, [framing]);

  useEffect(() => {
    if (autoRotate) requestRender();
  }, [autoRotate]);

  useEffect(() => () => {
    stage.dispose();
    renderer.current?.dispose();
    gl.current = null;
    renderer.current = null;
  }, []);

  const pan = useMemo(() => {
    let start = 0;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => { start = stage.yaw; },
      onPanResponderMove: (_, g) => {
        stage.setYaw(start + g.dx * 0.012);
        requestRender();
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, []);

  useImperativeHandle(ref, () => ({
    async snapshot() {
      if (!gl.current || !renderer.current) return null;
      renderer.current.render(stage.scene, stage.camera);
      const snap = await GLView.takeSnapshotAsync(gl.current, { format: 'png' });
      gl.current.endFrameEXP();
      return typeof snap.uri === 'string' ? snap.uri : null;
    },
    toGLBBase64: () => toBase64(avatarToGLB(live.current.config, { flatShading: live.current.flatShading })),
    setYaw(y: number) {
      stage.setYaw(y);
      requestRender();
    },
  }));

  return (
    <View style={[{ overflow: 'hidden' }, style]} {...(rotatable ? pan.panHandlers : null)}>
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
    </View>
  );
});
