// Web preview of the core library: same schema + stage the RN components use.
import { WebGLRenderer } from 'three';
import {
  AvatarConfig, AvatarStage, DEFAULT_AVATAR, EDITOR_SCHEMA, Framing, avatarToGLB, decodeAvatar, encodeAvatar,
  prettyLabel, randomAvatar,
} from '../src/core';

const view = document.getElementById('view')!;
const panel = document.getElementById('panel')!;
const stats = document.getElementById('stats')!;

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
view.prepend(renderer.domElement);
const stage = new AvatarStage();

let config: AvatarConfig = location.hash.length > 1 ? decodeAvatar(location.hash.slice(1)) : { ...DEFAULT_AVATAR };
let flat = true;

function rebuild() {
  stage.setAvatar(config, { flatShading: flat });
  const code = encodeAvatar(config);
  history.replaceState(null, '', '#' + code);
  stats.textContent = `${stage.metrics!.triangles} triangles · ${stage.avatar!.children.length} draw calls`;
  render();
  renderPanel();
}
function render() {
  renderer.render(stage.scene, stage.camera);
}
function resize() {
  renderer.setSize(view.clientWidth, view.clientHeight, false);
  stage.setSize(view.clientWidth, view.clientHeight);
  render();
}
new ResizeObserver(resize).observe(view);

// drag to rotate, wheel to zoom
let dragX: number | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => { dragX = e.clientX; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (dragX === null) return;
  stage.setYaw(stage.yaw + (e.clientX - dragX) * 0.01);
  dragX = e.clientX;
  render();
});
renderer.domElement.addEventListener('pointerup', () => (dragX = null));
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  stage.zoom = Math.min(3, Math.max(0.6, stage.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
  stage.updateCamera();
  render();
}, { passive: false });

const framingBar = document.getElementById('framing')!;
function renderFraming() {
  framingBar.innerHTML = '';
  for (const f of ['face', 'bust', 'body'] as Framing[]) {
    const b = document.createElement('button');
    b.textContent = prettyLabel(f);
    b.className = stage.framing === f ? 'on' : '';
    b.onclick = () => { stage.setFraming(f); renderFraming(); render(); };
    framingBar.append(b);
  }
}

function set<K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) {
  config = { ...config, [k]: v };
  rebuild();
}

function renderPanel() {
  panel.innerHTML = '';
  const actions = document.createElement('div');
  actions.className = 'actions';
  const mk = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = fn;
    actions.append(b);
  };
  mk('🎲 Randomize', () => { config = randomAvatar(); rebuild(); });
  mk('Reset', () => { config = { ...DEFAULT_AVATAR }; rebuild(); });
  mk(flat ? 'Smooth' : 'Faceted', () => { flat = !flat; rebuild(); });
  mk('Download GLB', () => {
    const blob = new Blob([avatarToGLB(config, { flatShading: flat }) as Uint8Array<ArrayBuffer>], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'avatar.glb';
    a.click();
  });
  mk('PNG', () => {
    render();
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = 'avatar.png';
    a.click();
  });
  panel.append(actions);
  const code = document.createElement('code');
  code.textContent = encodeAvatar(config);
  panel.append(code);

  for (const section of EDITOR_SCHEMA) {
    const h = document.createElement('h3');
    h.textContent = section.label;
    h.style.cursor = 'pointer';
    h.onclick = () => { stage.setFraming(section.focus === 'face' ? 'face' : 'body'); renderFraming(); render(); };
    panel.append(h);
    for (const ctl of section.controls) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<label>${ctl.label}</label>`;
      const box = document.createElement('div');
      box.className = 'chips';
      if (ctl.type === 'enum') {
        for (const o of ctl.options) {
          const b = document.createElement('button');
          b.textContent = prettyLabel(o);
          b.className = config[ctl.key] === o ? 'on' : '';
          b.onclick = () => set(ctl.key, o as never);
          box.append(b);
        }
      } else if (ctl.type === 'color') {
        for (const col of ctl.palette) {
          const b = document.createElement('button');
          b.className = 'sw' + (config[ctl.key] === col ? ' on' : '');
          b.style.background = col;
          b.title = col;
          b.onclick = () => set(ctl.key, col as never);
          box.append(b);
        }
      } else {
        const r = document.createElement('input');
        r.type = 'range'; r.min = '0'; r.max = '1'; r.step = '0.02';
        r.value = String(config[ctl.key]);
        r.onchange = () => set(ctl.key, Number(r.value) as never);
        r.oninput = () => { config = { ...config, [ctl.key]: Number(r.value) }; stage.setAvatar(config, { flatShading: flat }); render(); };
        box.append(r);
      }
      row.append(box);
      panel.append(row);
    }
  }
}

const qp = new URLSearchParams(location.search);
if (qp.get('framing')) stage.framing = qp.get('framing') as Framing;
if (qp.get('yaw')) stage.setYaw(Number(qp.get('yaw')));
renderFraming();
resize();
rebuild();
(window as any).__stage = stage;
