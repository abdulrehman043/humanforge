// Headless preview renderer driven by tools/build-previews.mts (puppeteer).
// window.renderPreview(spec) -> PNG data URL with a transparent background.
import {
  Box3, Mesh, ACESFilmicToneMapping, DirectionalLight, HemisphereLight, PMREMGenerator, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HumanAvatar, HumanConfig, loadHumanPackage } from '../../src/human/runtime';

export interface PreviewSpec {
  config: Partial<HumanConfig>;
  /** what to frame */
  shot: 'head' | 'brows' | 'eye' | 'body' | 'feet';
  yaw: number;
  size: number;
  armL?: number;
}

const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);
const scene = new Scene();
scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
const key = new DirectionalLight('#fff4e8', 1.7);
key.position.set(1.2, 2.2, 2.5);
const rim = new DirectionalLight('#dfe8ff', 0.9);
rim.position.set(-2, 2, -2);
scene.add(key, rim, new HemisphereLight('#ffffff', '#b9a99a', 0.45));
const camera = new PerspectiveCamera(22, 1, 0.01, 50);

const pkg = await loadHumanPackage('/human');
const avatar = new HumanAvatar(pkg);
avatar.textureSize = '1k';
scene.add(avatar.group);

const bone = (re: RegExp) => avatar.bones.find((b) => re.test(b.name))!.getWorldPosition(new Vector3());

(window as any).renderPreview = async (spec: PreviewSpec) => {
  await avatar.setConfig(spec.config);
  const m = avatar.metrics();
  const head = bone(/Head$/);
  const box = (prefix: string, side = 0) => {
    const b = new Box3();
    avatar.group.traverse((o) => {
      if (!(o as Mesh).isMesh || !o.name.startsWith(prefix)) return;
      const pos = (o as Mesh).geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        if (side && Math.sign(x) !== side) continue;
        b.expandByPoint(new Vector3(x, pos.getY(i), pos.getZ(i)));
      }
    });
    return b;
  };
  let target: Vector3, h: number, pitch = 0.05;
  switch (spec.shot) {
    case 'head': target = new Vector3(0, head.y + 0.1, 0.0); h = 0.36; break;
    case 'brows': { const b = box('eyes-'); target = b.getCenter(new Vector3()); target.y += 0.015; h = (b.max.x - b.min.x) * 0.95; break; }
    case 'eye': { const b = box('eyes-', 1); target = b.getCenter(new Vector3()); h = (b.max.x - b.min.x) * 1.9; break; }
    case 'feet': target = bone(/LeftFoot$/).lerp(bone(/LeftToeBase$/), 0.6); target.y = 0.07; h = 0.32; pitch = 0.35; break;
    default: target = new Vector3(0, m.height * 0.5, 0); h = m.height * 1.06;
  }
  // arms down for full-body shots so the outfit fills the thumbnail
  if (spec.shot === 'body' || spec.shot === 'feet') {
    for (const b of avatar.bones) {
      if (/LeftArm$/.test(b.name)) b.rotateZ(-(spec.armL ?? 0.62));
      if (/RightArm$/.test(b.name)) b.rotateZ(spec.armL ?? 0.62);
    }
    avatar.group.updateMatrixWorld(true);
  }
  const dist = h / 2 / Math.tan((camera.fov * Math.PI) / 360);
  camera.position.set(target.x + Math.sin(spec.yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(spec.yaw) * Math.cos(pitch) * dist);
  camera.lookAt(target);
  renderer.setSize(spec.size, spec.size, false);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
};
(window as any).previewReady = true;
