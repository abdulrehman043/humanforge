// Renderer-agnostic stage: lights, camera framing and avatar swapping.
// Used by both the React Native <AvatarView> and the web demo.
import { AmbientLight, Color, DirectionalLight, Group, HemisphereLight, PerspectiveCamera, Scene, Vector3 } from 'three';
import { AvatarConfig } from './config';
import { AvatarMetrics, BuildOptions, buildAvatar, disposeAvatar } from './build';

export type Framing = 'face' | 'bust' | 'body';

export class AvatarStage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(28, 1, 0.05, 50);
  readonly pivot = new Group();
  avatar: Group | null = null;
  framing: Framing = 'body';
  yaw = 0;
  /** Extra zoom multiplier (1 = default framing). */
  zoom = 1;

  constructor(background: string | null = '#eef1f5') {
    if (background) this.scene.background = new Color(background);
    this.scene.add(new HemisphereLight('#ffffff', '#8a8f99', 1.6));
    this.scene.add(new AmbientLight('#ffffff', 0.35));
    const key = new DirectionalLight('#ffffff', 1.6);
    key.position.set(1.5, 2.5, 3);
    const rim = new DirectionalLight('#cfe0ff', 0.7);
    rim.position.set(-2, 1.5, -2);
    this.scene.add(key, rim, this.pivot);
  }

  setAvatar(config: Partial<AvatarConfig>, opts?: BuildOptions) {
    if (this.avatar) {
      this.pivot.remove(this.avatar);
      disposeAvatar(this.avatar);
    }
    this.avatar = buildAvatar(config, opts);
    this.pivot.add(this.avatar);
    this.updateCamera();
  }

  get metrics(): AvatarMetrics | undefined {
    return this.avatar?.userData.metrics;
  }

  setSize(width: number, height: number) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.updateCamera();
  }

  setFraming(f: Framing) {
    this.framing = f;
    this.updateCamera();
  }

  setYaw(yaw: number) {
    this.yaw = yaw;
    this.pivot.rotation.y = yaw;
  }

  updateCamera() {
    const m = this.metrics ?? { headY: 1.55, height: 1.7 };
    const t = Math.tan((this.camera.fov * Math.PI) / 360);
    // distance that fits a box of h x w (metres) in view, whichever side is limiting
    const fit = (h: number, w: number) => Math.max(h / 2 / t, w / 2 / t / this.camera.aspect);
    let target: Vector3, dist: number;
    if (this.framing === 'face') {
      target = new Vector3(0, m.headY + 0.005, 0);
      dist = fit(0.42, 0.4);
    } else if (this.framing === 'bust') {
      target = new Vector3(0, m.headY - 0.1, 0);
      dist = fit(0.7, 0.62);
    } else {
      target = new Vector3(0, m.height / 2, 0);
      dist = fit(m.height * 1.1, 0.75);
    }
    dist /= this.zoom;
    this.camera.position.set(0, target.y + dist * 0.05, dist);
    this.camera.lookAt(target);
  }

  dispose() {
    if (this.avatar) disposeAvatar(this.avatar);
    this.avatar = null;
  }
}
