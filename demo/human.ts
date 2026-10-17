// Web editor for the realistic human (humanforge/human).
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PMREMGenerator, PerspectiveCamera, Scene,
  SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DEFAULT_HUMAN, HumanAvatar, HumanConfig, loadHumanPackage } from '../src/human/runtime';
import { exportHumanGLB } from '../src/human/export';
import { DETAIL_SLIDERS, MACRO_SLIDERS } from '../src/human/sliders';
import type { SelfieFitterResult } from '../src/human/selfie';
import { DEFAULT_FIT_MACROS } from '../src/human/fit';

const view = document.getElementById('view')!;
const panel = document.getElementById('panel')!;
const hud = document.getElementById('hud')!;
const bar = document.getElementById('bar')!;

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
view.prepend(renderer.domElement);
const scene = new Scene();
scene.background = new Color('#e9ecf1');
scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const key = new DirectionalLight('#fff4e8', 1.6);
key.position.set(1.2, 2.2, 2.5);
const rim = new DirectionalLight('#dfe8ff', 0.9);
rim.position.set(-2, 2, -2);
scene.add(key, rim, new HemisphereLight('#ffffff', '#b9a99a', 0.4));
const camera = new PerspectiveCamera(24, 1, 0.05, 50);

const qp = new URLSearchParams(location.search);
let framing = (qp.get('framing') as 'face' | 'body') || 'face';
let yaw = Number(qp.get('yaw') || 0);
if (qp.has('bare')) { panel.style.display = 'none'; view.style.height = '100vh'; view.style.flex = '1'; }

const pkg = await loadHumanPackage('/human');
const avatar = new HumanAvatar(pkg);
scene.add(avatar.group);
let config: HumanConfig = { ...DEFAULT_HUMAN };
try { if (location.hash.length > 1) config = { ...config, ...JSON.parse(decodeURIComponent(location.hash.slice(1))) }; } catch {}
await avatar.setConfig(config);
document.getElementById('loading')!.remove();

function frame() {
  const m = avatar.metrics();
  const target = framing === 'face' ? new Vector3(0, m.headY - 0.08 + Number(qp.get('ty') || 0), 0) : new Vector3(0, m.height * 0.52, 0);
  const h = (framing === 'face' ? 0.42 : m.height * 1.12) / Number(qp.get('zoom') || 1);
  const dist = h / 2 / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect * 1.1);
  camera.position.set(Math.sin(yaw) * dist, target.y + dist * 0.03, Math.cos(yaw) * dist);
  camera.lookAt(target);
}
function render() { frame(); renderer.render(scene, camera); }
function resize() {
  renderer.setSize(view.clientWidth, view.clientHeight, false);
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
  render();
}
new ResizeObserver(resize).observe(view);
let drag: number | null = null;
renderer.domElement.onpointerdown = (e) => { drag = e.clientX; renderer.domElement.setPointerCapture(e.pointerId); };
renderer.domElement.onpointermove = (e) => { if (drag === null) return; yaw -= (e.clientX - drag) * 0.01; drag = e.clientX; render(); };
renderer.domElement.onpointerup = () => (drag = null);

let pending: Promise<void> | null = null;
async function update(patch: Partial<HumanConfig>) {
  config = { ...config, ...patch, detail: { ...config.detail, ...(patch.detail ?? {}) } };
  history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify(config)));
  pending = avatar.setConfig(config);
  await pending;
  render();
  stats();
  renderPanel();
}
function stats() {
  let tris = 0, draws = 0;
  avatar.group.traverse((o: any) => { if (o.isMesh) { draws++; tris += (o.geometry.index?.count ?? 0) / 3; } });
  hud.textContent = `${Math.round(tris).toLocaleString()} triangles · ${draws} draw calls`;
}

function renderBar() {
  bar.innerHTML = '';
  for (const f of ['face', 'body'] as const) {
    const b = document.createElement('button');
    b.textContent = f === 'face' ? 'Face' : 'Body';
    b.className = framing === f ? 'on' : '';
    b.onclick = () => { framing = f; renderBar(); render(); };
    bar.append(b);
  }
  const ex = document.createElement('button');
  ex.textContent = '😊 Smile';
  let on = false;
  ex.onclick = () => { on = !on; avatar.setExpression('mouthSmile', on ? 1 : 0); avatar.setExpression('eyeSquintLeft', on ? 0.3 : 0); avatar.setExpression('eyeSquintRight', on ? 0.3 : 0); render(); };
  bar.append(ex);
  const dl = document.createElement('button');
  dl.textContent = 'Download GLB';
  dl.onclick = async () => {
    const blob = new Blob([(await exportHumanGLB(avatar)) as Uint8Array<ArrayBuffer>], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'avatar.glb';
    a.click();
  };
  bar.append(dl);
  const sb = document.createElement('button');
  sb.textContent = '📷 From selfie';
  const file = document.createElement('input');
  file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
  file.onchange = () => { if (file.files?.[0]) fromSelfie(file.files[0]); file.value = ''; };
  sb.onclick = () => file.click();
  const sex = document.createElement('select');
  sex.title = 'Gender for selfie fitting';
  sex.innerHTML = '<option value="0">female</option><option value="1">male</option><option value="auto">auto (experimental)</option>';
  sex.value = selfieGender;
  sex.onchange = () => (selfieGender = sex.value);
  bar.append(sb, sex, file);
}

// ---------------------------------------------------------------- selfie -> avatar
// Landmarks say little about gender, so the user picks it (like MetaPerson); 'auto' guesses from geometry.
let selfieGender = qp.get('gender') ?? (config.gender >= 0.5 ? '1' : '0');
let fitter: Promise<Awaited<ReturnType<typeof import('../src/human/selfie').createSelfieFitter>>> | null = null;
const thumb = document.createElement('canvas');
thumb.id = 'selfie';
view.append(thumb);
async function fromSelfie(src: Blob | string) {
  hud.textContent = 'Fitting selfie…';
  try {
    fitter ??= import('../src/human/selfie').then((m) => m.createSelfieFitter());
    const f = await fitter;
    const img = typeof src === 'string' ? await fetch(src).then((r) => r.blob()) : src;
    const t0 = performance.now();
    const auto = selfieGender === 'auto';
    const res = await f.fit(pkg, img, {
      base: { ...config, detail: {} }, hints: auto ? {} : { gender: Number(selfieGender) },
      macros: auto ? ['gender', ...DEFAULT_FIT_MACROS] : DEFAULT_FIT_MACROS,
    });
    const ms = performance.now() - t0;
    const c = res.config;
    const male = c.gender >= 0.5;
    const swapClothes = config.clothes.some((id) => id.startsWith(male ? 'female' : 'male'));
    await update({
      gender: c.gender, african: c.african, asian: c.asian, caucasian: c.caucasian, age: c.age,
      skin: c.skin, skinTint: c.skinTint, eyes: c.eyes, detail: Object.fromEntries(DETAIL_SLIDERS.map((s) => [s.id, c.detail[s.id] ?? 0])),
      ...(swapClothes ? { clothes: [male ? 'male_casualsuit01' : 'female_casualsuit01', 'shoes01'], hair: male ? 'short02' : 'bob02' } : {}),
    });
    drawThumb(res);
    hud.textContent = `Selfie fit in ${ms.toFixed(0)} ms · error ${(res.error * 100).toFixed(1)}% (was ${(res.initialError * 100).toFixed(1)}%) · ${c.skin} · eyes ${c.eyes}`;
    (window as any).__selfie = { config: c, error: res.error, initialError: res.initialError, colors: res.colors, expression: res.expression, landmarks: res.landmarks, canvas: res.canvas };
  } catch (e) {
    hud.textContent = `Selfie fit failed: ${(e as Error).message}`;
    (window as any).__selfie = { error: String(e) };
  }
}
function drawThumb(res: SelfieFitterResult) {
  const s = res.canvas, h = 220, w = Math.round((s.width / s.height) * h);
  thumb.width = w * 2; thumb.height = h * 2;
  thumb.style.width = `${w}px`; thumb.style.height = `${h}px`;
  const ctx = thumb.getContext('2d')!;
  ctx.drawImage(s, 0, 0, thumb.width, thumb.height);
  ctx.fillStyle = 'rgba(0,255,160,0.8)';
  for (const p of res.landmarks) ctx.fillRect(p.x * thumb.width - 1, p.y * thumb.height - 1, 2, 2);
  thumb.style.display = 'block';
}

const open = new Set(['Body', 'Style']);
function section(title: string, build: (el: HTMLElement) => void) {
  const d = document.createElement('details');
  d.open = open.has(title);
  d.ontoggle = () => (d.open ? open.add(title) : open.delete(title));
  d.innerHTML = `<summary>${title}</summary>`;
  build(d);
  panel.append(d);
}
function slider(el: HTMLElement, label: string, value: number, min: number, set: (v: number) => void) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label>${label}</label>`;
  const r = document.createElement('input');
  r.type = 'range'; r.min = String(min); r.max = '1'; r.step = '0.01'; r.value = String(value);
  r.onchange = () => set(Number(r.value));
  row.append(r);
  el.append(row);
}
function chips(el: HTMLElement, opts: { id: string | null; label: string }[], value: (id: string | null) => boolean, set: (id: string | null) => void) {
  const box = document.createElement('div');
  box.className = 'chips';
  for (const o of opts) {
    const b = document.createElement('button');
    b.textContent = o.label;
    b.className = value(o.id) ? 'on' : '';
    b.onclick = () => set(o.id);
    box.append(b);
  }
  el.append(box);
}
function swatches(el: HTMLElement, colors: string[], value: string, set: (c: string) => void) {
  const box = document.createElement('div');
  box.className = 'chips';
  for (const c of colors) {
    const b = document.createElement('button');
    b.className = 'sw' + (c === value ? ' on' : '');
    b.style.background = c;
    b.onclick = () => set(c);
    box.append(b);
  }
  el.append(box);
}
const pretty = (s: string) => s.replace(/_/g, ' ').replace(/(\d+)$/, ' $1');
const HAIR_COLORS = ['#0e0b0a', '#2c1b10', '#4a2f1b', '#7a4a26', '#a76b3a', '#d6b370', '#e8d8b0', '#9a9a9a', '#b5452e'];

function renderPanel() {
  const scroll = panel.scrollTop;
  panel.innerHTML = '';
  const proxies = pkg.manifest.proxies;
  section('Body', (el) => {
    for (const s of MACRO_SLIDERS) slider(el, s.label, config[s.id], 0, (v) => update({ [s.id]: v } as Partial<HumanConfig>));
  });
  section('Style', (el) => {
    el.append('Skin');
    chips(el, pkg.manifest.skins.map((s) => ({ id: s.id, label: pretty(s.id) })), (id) => id === config.skin, (id) => update({ skin: id! }));
    el.append('Eyes');
    chips(el, pkg.manifest.eyes.map((e) => ({ id: e, label: e })), (id) => id === config.eyes, (id) => update({ eyes: id! }));
    el.append('Hair');
    chips(el, [{ id: null, label: 'none' }, ...proxies.filter((p) => p.kind === 'hair').map((p) => ({ id: p.id, label: pretty(p.id) }))],
      (id) => id === config.hair, (id) => update({ hair: id }));
    swatches(el, HAIR_COLORS, config.hairColor, (c) => update({ hairColor: c, eyebrowColor: c }));
    el.append('Eyebrows');
    chips(el, [{ id: null, label: 'none' }, ...proxies.filter((p) => p.kind === 'eyebrows').map((p) => ({ id: p.id, label: p.id.replace('eyebrow', '') }))],
      (id) => id === config.eyebrows, (id) => update({ eyebrows: id }));
    el.append('Clothes');
    chips(el, proxies.filter((p) => p.kind === 'clothes').map((p) => ({ id: p.id, label: pretty(p.id) })),
      (id) => config.clothes.includes(id!), (id) => update({ clothes: config.clothes.includes(id!) ? config.clothes.filter((c) => c !== id) : [...config.clothes.filter((c) => !(id!.startsWith('shoes') && c.startsWith('shoes')) && !(id!.includes('suit') && c.includes('suit'))), id!] }));
  });
  for (const group of ['head', 'eyes', 'nose', 'mouth', 'ears', 'body'] as const) {
    section(`Detail: ${group}`, (el) => {
      for (const s of DETAIL_SLIDERS.filter((d) => d.group === group)) {
        slider(el, s.label, config.detail[s.id] ?? 0, s.neg.length ? -1 : 0, (v) => update({ detail: { [s.id]: v } }));
      }
    });
  }
  section('Expressions', (el) => {
    for (const name of avatar.expressionNames) slider(el, name, 0, 0, (v) => { avatar.setExpression(name, v); render(); });
  });
  panel.scrollTop = scroll;
}

renderBar();
renderPanel();
resize();
stats();
if (qp.get('selfie')) await fromSelfie(qp.get('selfie')!);
(window as any).__ready = true;
(window as any).__fromSelfie = fromSelfie;
(window as any).__avatar = avatar;
(window as any).__render = render;
