// Contact sheet for the generated garments: every outfit/headwear from front, side and back, plus
// body-shape variants. Query: ?ids=abaya01,hijab01&views=0,90,180&cell=320&variants=1&face=1
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PMREMGenerator, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HumanAvatar, HumanConfig, loadHumanPackage } from '../src/human/runtime';
import { createHumanEditor } from '../src/human/editor';
import { clothingInfo } from '../src/human/catalog';

const q = new URLSearchParams(location.search);
const cell = +(q.get('cell') ?? 300);
const views = (q.get('views') ?? '0,90,180').split(',').map(Number);
const face = q.has('face');

(async () => {
  const pkg = await loadHumanPackage('/human');
  const editor = createHumanEditor(pkg.manifest, { gender: 'female' });
  const base = editor.initial;
  const generated = pkg.manifest.proxies.filter((p) => (p as any).generated).map((p) => p.id);
  const ids = q.get('ids')?.split(',') ?? generated;
  const looks: { label: string; c: Partial<HumanConfig> }[] = [];
  for (const id of ids) {
    const slot = clothingInfo(id).slot;
    const clothes = slot === 'headwear' ? [...base.clothes, id] : [id, 'shoes02'];
    looks.push({ label: id, c: { clothes } });
    if (q.has('variants')) {
      looks.push({ label: `${id} heavy+bust`, c: { clothes, weight: 1, cupSize: 1 } });
      looks.push({ label: `${id} slim+tall`, c: { clothes, weight: 0, height: 1, cupSize: 0.2, muscle: 0.3 } });
      looks.push({ label: `${id} old+short`, c: { clothes, age: 0.9, height: 0, weight: 0.7 } });
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = cell * views.length; canvas.height = cell * looks.length * (face ? 1 : 1.6);
  const ch = canvas.height / looks.length;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(cell, ch, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  const scene = new Scene();
  scene.background = new Color('#e9ecf1');
  scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const key = new DirectionalLight('#fff4e8', 1.6); key.position.set(1.2, 2.2, 2.5);
  const rim = new DirectionalLight('#dfe8ff', 0.9); rim.position.set(-2, 2, -2);
  scene.add(key, rim, new HemisphereLight('#ffffff', '#b9a99a', 0.4));
  const avatar = new HumanAvatar(pkg);
  scene.add(avatar.group);
  const camera = new PerspectiveCamera(24, cell / ch, 0.05, 50);
  for (let r = 0; r < looks.length; r++) {
    await avatar.setConfig({ ...base, ...looks[r].c });
    const m = avatar.metrics();
    const target = face ? new Vector3(0, m.headY - 0.12, 0) : new Vector3(0, m.height * 0.5, 0);
    const h = face ? 0.55 : m.height * 1.08;
    const dist = h / 2 / Math.tan((camera.fov * Math.PI) / 360);
    for (let c = 0; c < views.length; c++) {
      const yaw = (views[c] * Math.PI) / 180;
      camera.position.set(Math.sin(yaw) * dist, target.y + dist * 0.03, Math.cos(yaw) * dist);
      camera.lookAt(target);
      renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, c * cell, r * ch, cell, ch);
    }
    ctx.fillStyle = '#333';
    ctx.fillText(looks[r].label, 6, r * ch + 14);
  }
  document.title = 'ready';
  (window as any).sheet = canvas.toDataURL('image/png');
})();
