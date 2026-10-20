// Renderer for tools/cartoon-g3d/kit.mts: Grab3d CC0 stylized people + MakeHuman CC0 modest wear (hijab / abaya / jalabiya) refitted onto them,
// with region recolours (hair, skin, top, bottom, shoes) painted into the fused texture.
import {
  ACESFilmicToneMapping, Bone, Box3, BufferAttribute, BufferGeometry, CanvasTexture, Color, DirectionalLight, DoubleSide, FrontSide, HemisphereLight,
  Matrix4, Mesh, MeshBasicMaterial, DataTexture, NearestFilter, NoToneMapping, LinearSRGBColorSpace, NoColorSpace, OrthographicCamera, PCFSoftShadowMap, MeshStandardMaterial, Skeleton, Object3D, PMREMGenerator, PerspectiveCamera, Quaternion, Raycaster, Scene, SkinnedMesh, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HumanAvatar, loadHumanPackage } from '../../src/human/runtime.ts';

const G3D = (window as any).G3D as string;
const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);
const scene = new Scene();
scene.background = new Color('#eef0f4');
scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.8;
const key = new DirectionalLight('#fff6ec', 1.6); key.position.set(1.2, 2.4, 2.6);
const rim = new DirectionalLight('#dfe8ff', 1.0); rim.position.set(-2.2, 2.0, -2.0);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.015; key.shadow.radius = 6;
Object.assign(key.shadow.camera, { left: -1, right: 1, top: 2.1, bottom: -0.2, near: 0.1, far: 8 }); key.shadow.camera.updateProjectionMatrix();
scene.add(key, rim, new HemisphereLight('#ffffff', '#c7b6a6', 0.5));
const camera = new PerspectiveCamera(20, 1, 0.01, 100);
const loader = new GLTFLoader();
const pkg = await loadHumanPackage('/human');
const mh = new HumanAvatar(pkg);
mh.textureSize = '1k';

class Grid {
  cell = 0.03; map = new Map<string, number[]>();
  constructor(public P: Float32Array, keep?: (i: number) => boolean) { for (let i = 0; i < P.length / 3; i++) if (!keep || keep(i)) this.add(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], i); }
  private k(x: number, y: number, z: number) { return `${x},${y},${z}`; }
  add(x: number, y: number, z: number, i: number) {
    const k = this.k(Math.floor(x / this.cell), Math.floor(y / this.cell), Math.floor(z / this.cell));
    let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(i);
  }
  nearest(x: number, y: number, z: number, maxR = 40) {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell), cz = Math.floor(z / this.cell);
    let best = -1, bd = Infinity, found = -1;
    // grow shells of cells outward; once a hit is found, one more shell settles the true nearest
    for (let r = 0; r <= maxR && (found < 0 || r <= found + 1); r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        const edge = Math.abs(i) === r || Math.abs(j) === r;
        for (let k = -r; k <= r; k += edge ? 1 : 2 * r || 1) {
          const a = this.map.get(this.k(cx + i, cy + j, cz + k)); if (!a) continue;
          for (const v of a) { const dx = this.P[v * 3] - x, dy = this.P[v * 3 + 1] - y, dz = this.P[v * 3 + 2] - z; const d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = v; } }
        }
      }
      if (best >= 0 && found < 0) found = r;
    }
    return best;
  }
}
function vertexNormals(P: Float32Array, index: ArrayLike<number>) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}
const worldPos = (b: Object3D) => b.getWorldPosition(new Vector3());
function aimBone(bone: Bone, child: Bone, dir: Vector3) {
  const cur = worldPos(child).sub(worldPos(bone)).normalize();
  const q = new Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
  const parentQ = bone.parent!.getWorldQuaternion(new Quaternion());
  const worldQ = bone.getWorldQuaternion(new Quaternion());
  bone.quaternion.copy(parentQ.invert().multiply(q.multiply(worldQ)));
  bone.updateMatrixWorld(true);
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// texture regions
const HAIR = 1, TOP = 2, BOTTOM = 3, SHOES = 4, HANDS = 5, HEAD = 6, FOREHEAD = 7;
type Look = { char: string; mh: any; yaw: number; shot: 'full' | 'bust'; size: number; colors?: Record<string, string>; skin?: string; hairColor?: string; debug?: boolean; longHair?: boolean; hideGarments?: boolean; noCut?: boolean; cut?: boolean; rimX?: number; rimY?: number; noMirror?: boolean; mirror?: boolean; noBand?: boolean; target?: [number, number, number]; frame?: number; rimTop?: number; bellSleeves?: boolean; noMirrorFill?: boolean; cleanSide?: number; noLower?: boolean; debugBind?: boolean; sleeveSlim?: number; hijabStyle?: 'fitted' | 'amira'; crown?: number; hem?: number; mirrorFace?: boolean; armSpread?: number; kit?: { yaws: number[]; ss: number; beard?: boolean } };

const cache = new Map<string, any>();
let current: Object3D | null = null;
(window as any).renderG3d = async (o: Look) => {
  (window as any)._torsoGrid = undefined;
  const t0 = performance.now(); const tick = (l: string) => console.log('HEADFIT T ' + l + ' ' + Math.round(performance.now() - t0));
  if (current) scene.remove(current);
  const root = new Object3D(); current = root; scene.add(root);
  // ---- MakeHuman, dressed, for its garments and limb directions
  await mh.setConfig({ hair: null, clothes: [], ...o.mh });
  mh.group.updateMatrixWorld(true);
  let mhBody: Mesh | null = null; const garments: Mesh[] = [];
  mh.group.traverse((n: any) => { if (!n.isMesh) return; if (n.name === 'body') mhBody = n; else if (/^clothes-/.test(n.name)) garments.push(n); });
  const mb = mhBody! as Mesh;
  const mhP = mb.geometry.getAttribute('position').array as Float32Array;
  const mhN = mb.geometry.getAttribute('normal').array as Float32Array;
  const mhBox = new Box3().setFromBufferAttribute(mb.geometry.getAttribute('position') as BufferAttribute);
  const mhBone = (re: RegExp) => mh.bones.find((b) => re.test(b.name))!;

  tick('mh');
  // ---- the Grab3d character, arms posed to MakeHuman's
  const gl = await loader.loadAsync(`/@fs${G3D}/${o.char}-rigged.glb`);
  const qs = gl.scene; root.add(qs); qs.updateMatrixWorld(true);
  let body!: SkinnedMesh; qs.traverse((n: any) => { if (n.isSkinnedMesh) body = n; });
  const skel = body.skeleton;
  const qb = (name: string) => skel.bones.find((b) => b.name === name)!;
  for (const s of ['Left', 'Right']) {
    const side = (worldPos(qb(`${s}Arm`)).x > 0) === (worldPos(mhBone(/LeftArm$/)).x > 0) ? 'Left' : 'Right';
    const up = mhBone(new RegExp(`${side}Arm$`)), fore = mhBone(new RegExp(`${side}ForeArm$`)), hand = mhBone(new RegExp(`${side}Hand$`));
    aimBone(qb(`${s}Arm`), qb(`${s}ForeArm`), worldPos(fore).sub(worldPos(up)));
    aimBone(qb(`${s}ForeArm`), qb(`${s}Hand`), worldPos(hand).sub(worldPos(fore)));
  }
  body.castShadow = body.receiveShadow = true;
  qs.updateMatrixWorld(true);
  const geo0 = body.geometry;
  const n = geo0.getAttribute('position').count;
  const QP = new Float32Array(n * 3); const v = new Vector3();
  for (let i = 0; i < n; i++) { body.getVertexPosition(i, v); v.applyMatrix4(body.matrixWorld); QP.set([v.x, v.y, v.z], i * 3); }
  const QN = vertexNormals(QP, geo0.index!.array);
  const qBox = new Box3(); for (let i = 0; i < n; i++) qBox.expandByPoint(v.fromArray(QP, i * 3));

  tick('posed');
  // ---- per-vertex region from the dominant bone; skin from the texture colour at the vertex
  const mat = (body.material as MeshStandardMaterial);
  if ((o.mh.clothes ?? []).some((c: string) => /hijab|amira/.test(c))) mat.side = FrontSide;
  if (!cache.has(o.char)) {
    const img = mat.map!.image as CanvasImageSource & { width: number; height: number };
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    cv.getContext('2d')!.drawImage(img, 0, 0);
    cache.set(o.char, { cv, px: cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height) });
  }
  const { px: srcPx, cv: srcCv } = cache.get(o.char);
  const TW = srcCv.width, TH = srcCv.height;
  const uv = geo0.getAttribute('uv');
  const texAt = (i: number) => {
    const x = Math.min(TW - 1, Math.max(0, Math.floor(uv.getX(i) * TW))), y = Math.min(TH - 1, Math.max(0, Math.floor((mat.map!.flipY ? 1 - uv.getY(i) : uv.getY(i)) * TH)));
    const k = (y * TW + x) * 4; return [srcPx.data[k], srcPx.data[k + 1], srcPx.data[k + 2]];
  };
  const si = geo0.getAttribute('skinIndex'), sw = geo0.getAttribute('skinWeight');
  const boneName = (i: number) => { let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } } return skel.bones[best].name; };
  const neckY = worldPos(qb('neck')).y, headY = worldPos(qb('Head')).y, hipY = worldPos(qb('Hips')).y;
  const front = worldPos(qb('headfront'));
  // skin reference: the vertex nearest the face front
  const all = new Grid(QP);
  const skinRef = texAt(all.nearest(front.x, front.y, front.z + 0.02));
  const isSkin = (c: number[]) => {
    const d = Math.hypot(c[0] - skinRef[0], c[1] - skinRef[1], c[2] - skinRef[2]);
    const lr = (c[0] + 1) / (skinRef[0] + 1); // shading changes brightness, keep hue
    const dn = Math.hypot(c[0] / (c[0] + c[1] + c[2] + 1) - skinRef[0] / (skinRef[0] + skinRef[1] + skinRef[2] + 1), c[1] / (c[0] + c[1] + c[2] + 1) - skinRef[1] / (skinRef[0] + skinRef[1] + skinRef[2] + 1));
    return d < 60 || (dn < 0.03 && lr > 0.55 && lr < 1.25);
  };
  // face features (eyes, brows, lips) are not hair: the front of the head between chin and brow
  const headX = worldPos(qb('Head')).x;
  const inFaceZone = (i: number) => QN[i * 3 + 2] > 0.2 && QP[i * 3 + 2] > front.z - 0.06 && Math.abs(QP[i * 3] - headX) < 0.055 && QP[i * 3 + 1] < front.y + 0.095 && QP[i * 3 + 1] > neckY + 0.02;
  const region = new Uint8Array(n), skin = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const b = boneName(i), y = QP[i * 3 + 1];
    skin[i] = isSkin(texAt(i)) ? 1 : 0;
    if (/Head|neck|head/.test(b)) region[i] = skin[i] || inFaceZone(i) || (b === 'Head' && y <= neckY + 0.05 && Math.abs(QP[i * 3] - headX) > 0.06) ? HEAD : (y > neckY + 0.05 ? HAIR : TOP); // earrings hang off the head
    else if (/Hand/.test(b)) region[i] = skin[i] ? HANDS : TOP;
    else if (/Foot|Toe/.test(b)) region[i] = SHOES;
    else if (/Leg/.test(b)) region[i] = BOTTOM;
    else if (/Hips/.test(b)) region[i] = y > hipY + 0.02 ? TOP : BOTTOM;
    else region[i] = TOP;
  }
  { // a blazer hem hangs over the hips and a waistband rides up the torso: the colour decides
    const ch = (c: number[]) => { const t = c[0] + c[1] + c[2] + 1; return [c[0] / t, c[1] / t]; };
    const med = (test: (i: number) => boolean) => { const a: number[][] = []; for (let i = 0; i < n; i += 5) if (test(i)) a.push(ch(texAt(i))); a.sort((p, q) => p[0] - q[0]); const r = a[a.length >> 1]; a.sort((p, q) => p[1] - q[1]); return r ? [r[0], a[a.length >> 1][1]] : null; };
    const topC = med((i) => region[i] === TOP && /^Spine0[12]$/.test(boneName(i)) && !skin[i]);
    const botC = med((i) => region[i] === BOTTOM && /Leg$/.test(boneName(i)));
    if (topC && botC && Math.hypot(topC[0] - botC[0], topC[1] - botC[1]) > 0.05) for (let i = 0; i < n; i++) {
      if ((region[i] !== TOP && region[i] !== BOTTOM) || skin[i] || /Arm|Hand|Shoulder/.test(boneName(i))) continue;
      const c = ch(texAt(i)); const dt = Math.hypot(c[0] - topC[0], c[1] - topC[1]), db = Math.hypot(c[0] - botC[0], c[1] - botC[1]);
      if (Math.min(dt, db) < 0.04) region[i] = dt < db ? TOP : BOTTOM;
    }
  }
  let hairC = [0, 0, 0];
  { // long hair hangs onto the shoulders: re-label hair-coloured, non-skin vertices there
    const hsm: number[][] = []; for (let i = 0; i < n; i += 7) if (region[i] === HAIR) hsm.push(texAt(i));
    hsm.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]); hairC = hsm[hsm.length >> 1] ?? [0, 0, 0]; const hc = hairC;
    if (o.longHair) for (let i = 0; i < n; i++) {
      if (region[i] !== TOP || skin[i] || QP[i * 3 + 1] < neckY - 0.2) continue;
      const c = texAt(i); if (Math.hypot(c[0] - hc[0], c[1] - hc[1], c[2] - hc[2]) < 40 && QP[i * 3 + 2] < front.z - 0.06) region[i] = HAIR;
    }
  }
  let jewel = 0;
  // jewellery: off-centre bits on the head bone whose colour is nothing like the hair (gold hoops, studs)
  for (let i = 0; i < n; i++) {
    if (region[i] !== HAIR && region[i] !== TOP) continue;
    if (!/Head|head|neck/.test(boneName(i)) || Math.abs(QP[i * 3] - headX) < 0.06) continue;
    const c = texAt(i), gold = c[0] > 120 && c[1] > 0.72 * c[0] && c[2] < 0.6 * c[1], silver = Math.min(...c) > 170 && Math.max(...c) - Math.min(...c) < 30;
    if ((gold || silver) && !isSkin(c)) { region[i] = HEAD; jewel++; }
  }

  console.log('HEADFIT JEWEL ' + jewel);
  tick('regions');
  // ---- align MakeHuman to the character: height scale, hips on hips
  const sc = (qBox.max.y - qBox.min.y) / (mhBox.max.y - mhBox.min.y);
  const mhHip = worldPos(mhBone(/Hips$/)), qHip = worldPos(qb('Hips'));
  const T = (x: number, y: number, z: number): [number, number, number] => [(x - mhHip.x) * sc + qHip.x, (y - mhBox.min.y) * sc + qBox.min.y, (z - mhHip.z) * sc + qHip.z];
  const mhPs = new Float32Array(mhP.length);
  for (let i = 0; i < mhP.length; i += 3) mhPs.set(T(mhP[i], mhP[i + 1], mhP[i + 2]), i);
  // head transform for headwear: stylized heads are bigger than the body scale suggests
  const mhNeckY = T(0, worldPos(mhBone(/neck01$|Neck$|neck$/i)).y, 0)[1];
  // match heads by the nose tip and the head width at nose level (stylized heads are bigger than the body scale suggests)
  const nose = (P: Float32Array, ok: (i: number) => boolean) => { let best = -1; for (let i = 0; i < P.length / 3; i++) if (ok(i) && (best < 0 || P[i * 3 + 2] > P[best * 3 + 2])) best = i; return new Vector3().fromArray(P, best * 3); };
  const width = (P: Float32Array, ok: (i: number) => boolean, y: number, cx: number) => {
    const xs: number[] = []; for (let i = 0; i < P.length / 3; i++) if (ok(i) && Math.abs(P[i * 3 + 1] - y) < 0.015) xs.push(Math.abs(P[i * 3] - cx));
    xs.sort((p, q) => p - q); return 2 * (xs[Math.floor(xs.length * 0.97)] ?? 0.08);
  };
  const mhHeadOk = (i: number) => mhPs[i * 3 + 1] > mhNeckY + 0.05;
  const qHeadOk = (i: number) => region[i] === HEAD && QP[i * 3 + 1] > neckY + 0.03;
  const mhNose = nose(mhPs, mhHeadOk), qNose = nose(QP, qHeadOk);
  const hs = width(QP, qHeadOk, qNose.y, qNose.x) / width(mhPs, mhHeadOk, mhNose.y, mhNose.x);
  // head fit from the skeleton: neck base -> crown (head_end) on the character, neck base -> top of the bald MakeHuman head
  let mhTop = -Infinity; for (let i = 0; i < mhPs.length; i += 3) if (Math.abs(mhPs[i] - mhNose.x) < 0.03) mhTop = Math.max(mhTop, mhPs[i + 1]);
  const crown = worldPos(qb('head_end'));
  const hsV = (crown.y - neckY) / (mhTop - mhNeckY);
  console.log('HEADFIT FACE ' + JSON.stringify({ hs, hsV, crown, neckY, mhTop, mhNeckY }));
  const hsU = hsV;
  const mhHC = new Vector3(mhNose.x, mhTop, mhNose.z), qHC = new Vector3(qNose.x, crown.y, qNose.z);
  const Hd = (p: number[]) => [qHC.x + (p[0] - mhHC.x) * hsU, qHC.y + (p[1] - mhHC.y) * hsU, qHC.z + (p[2] - mhHC.z) * hsU];

  tick('headfit');
  const hijab = (o.mh.clothes ?? []).some((c: string) => /hijab|amira/.test(c));
  // face oval: the front-facing skin of the face
  const faceB = new Box3();
  for (let i = 0; i < n; i++) if (region[i] === HEAD && QN[i * 3 + 2] > 0.35 && QP[i * 3 + 1] > neckY + 0.04) faceB.expandByPoint(v.fromArray(QP, i * 3));
  const fc = faceB.getCenter(new Vector3());
  // symmetric about the nose: the skin box can lean to one side (a stray lock, an earring)
  const noseX = worldPos(qb('Head')).x;
  const halfW = (() => { const xs: number[] = []; for (let i = 0; i < n; i++) if (skin[i] && region[i] === HEAD && QN[i * 3 + 2] > 0.3 && Math.abs(QP[i * 3 + 1] - (front.y + 0.04)) < 0.02) xs.push(Math.abs(QP[i * 3] - noseX)); xs.sort((p, q) => p - q); return xs[Math.floor(xs.length * 0.95)] ?? 0.06; })();
  const face = { x: noseX, y: fc.y + 0.004, z: front.z - 0.07, rx: halfW, ry: (faceB.max.y - faceB.min.y) * 0.5 };
  console.log('HEADFIT OVAL ' + JSON.stringify({ noseX, rx: face.rx, ry: face.ry, y: face.y }));
  const inFace = (x: number, y: number, z: number, k = 1) => z > face.z && ((x - face.x) / (face.rx * k)) ** 2 + ((y - face.y) / (face.ry * k)) ** 2 < 1;

  const hidden = new Uint8Array(n);
  const keepFace = new Uint8Array(n);
  // brow line: hair-coloured face features above it are fringe, not brows
  const browY = (() => {
    const side = (sg: number) => { const ys: number[] = []; for (let i = 0; i < n; i++) { const dx = (QP[i * 3] - face.x) * sg; if (region[i] === HEAD && !skin[i] && dx > 0.012 && dx < 0.045 && QP[i * 3 + 1] > front.y + 0.025 && QP[i * 3 + 1] < front.y + 0.1 && QN[i * 3 + 2] > 0.3) ys.push(QP[i * 3 + 1]); } ys.sort((p, q) => p - q); return ys[Math.floor(ys.length * 0.98)] ?? front.y + 0.07; };
    return Math.min(side(1), side(-1)); // a fringe lock on one side would lift that side's estimate
  })();
  // the scarf's face opening: an oval round the face whose top sits a little above the brows (as a pinned hijab does)
  const fitted = o.hijabStyle !== 'amira';
  const OP = { x: face.x, y: face.y - 0.004, rx: face.rx * (o.rimX ?? (fitted ? 0.97 : 0.9)), ry: face.ry * (o.rimY ?? (fitted ? 0.92 : 1.02)), top: 0 };
  OP.top = Math.min(OP.ry, Math.max(0.5 * OP.ry, browY + (o.rimTop ?? (fitted ? 0.012 : 0.014)) - OP.y));
  const opRy = (y: number) => (y > OP.y ? OP.top : OP.ry);
  // below the eyes the opening narrows toward the chin (an egg, as a pinned scarf frames the jaw)
  const opRx = (y: number) => OP.rx * (!fitted ? 1 : y < OP.y ? 1 - 0.34 * Math.min(1, (OP.y - y) / OP.ry) ** 2 : 1 - 0.18 * Math.min(1, (y - OP.y) / OP.top) ** 2);
  const opR = (x: number, y: number) => Math.hypot((x - OP.x) / opRx(y), (y - OP.y) / opRy(y));

  // raised strands lying on the face (a fringe lock) stand off the skin; painted brows don't
  const skinHead = new Grid(QP, (i) => skin[i] === 1 && region[i] === HEAD);
  const raised = (i: number) => {
    const q = skinHead.nearest(QP[i * 3], QP[i * 3 + 1], QP[i * 3 + 2], 2); if (q < 0) return false;
    return (QP[i * 3] - QP[q * 3]) * QN[q * 3] + (QP[i * 3 + 1] - QP[q * 3 + 1]) * QN[q * 3 + 1] + (QP[i * 3 + 2] - QP[q * 3 + 2]) * QN[q * 3 + 2] > 0.003;
  };
  // brows come in mirrored pairs; a dark feature with no mirror partner near the brows is a fringe lock
  const darkFace = new Grid(QP, (i) => region[i] === HEAD && !skin[i]);
  const lock = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (region[i] !== HEAD || skin[i]) continue;
    const y = QP[i * 3 + 1]; if (y < browY - 0.01 || y > front.y + 0.13) continue;
    const mx = 2 * face.x - QP[i * 3];
    const q = darkFace.nearest(mx, y, QP[i * 3 + 2], 1);
    const d = q < 0 ? 1 : Math.hypot(QP[q * 3] - mx, QP[q * 3 + 1] - y, QP[q * 3 + 2] - QP[i * 3 + 2]);
    if (d > 0.006) lock[i] = 1;
  }
  // under a hijab: hide the hair, ears and earrings; keep the whole face (the hijab sits in front of it and covers by depth)
  if (hijab) for (let i = 0; i < n; i++) {
    const x = QP[i * 3], y = QP[i * 3 + 1], z = QP[i * 3 + 2];
    const c = texAt(i);
    const dHair = Math.hypot(c[0] - hairC[0], c[1] - hairC[1], c[2] - hairC[2]), dSkin = Math.hypot(c[0] - skinRef[0], c[1] - skinRef[1], c[2] - skinRef[2]);
    const ax = Math.abs(x - face.x) / face.rx;
    const rOp = opR(x, y);
    const strand = rOp > 0.97 && (!skin[i] || dHair < dSkin) && dHair < 90 && ax > (y < front.y + 0.04 ? 0.62 : 0.74);
    const ear = ax > 0.85 && z < qNose.z - 0.05 && y > neckY;
    const hairish = !skin[i] && dHair < 70 && y > neckY - 0.3 && region[i] !== HEAD;
    const fringe = region[i] === HEAD && !skin[i] && ((y > browY + 0.012 && rOp > 0.85) || (fitted && rOp > 0.96 && y > browY - 0.004));
    if (region[i] === HEAD && !skin[i] && y > browY - 0.01 && raised(i)) lock[i] = 1; // painted to skin below
    if (lock[i] && (rOp > 0.85 || raised(i))) { hidden[i] = 1; continue; }
    if (!o.noMirrorFill && region[i] === HEAD && (x - face.x) * (o.cleanSide ?? 1) < -0.008 && y > neckY + 0.02) { hidden[i] = 1; continue; } // the mirrored clean brow shows instead // under the band: a raised lock would poke past it
    if (region[i] === HAIR || strand || ear || hairish || fringe || (region[i] === HEAD && !skin[i] && !inFaceZone(i))) { hidden[i] = 1; continue; }
    // skin beyond the scarf's opening is behind fabric anyway; dropping it stops flecks poking through at the rim
    if ((region[i] === HEAD || y > neckY + 0.02) && y > face.y - (fitted ? 1.2 : 0.4) * face.ry && rOp > (fitted ? 1.08 : 1)) { hidden[i] = 1; continue; }
    if (region[i] === HEAD && z > face.z - 0.03) keepFace[i] = 1;
  }
  // without a hijab the face can still take the mirrored clean half (painted strand shadows on the forehead)
  if (!hijab && o.mirrorFace) for (let i = 0; i < n; i++) if (region[i] === HEAD && (QP[i * 3] - face.x) * (o.cleanSide ?? 1) < -0.008 && QP[i * 3 + 1] > neckY + 0.02) hidden[i] = 1;
  const visGrid = new Grid(QP, (i) => !hidden[i] && region[i] !== HAIR);
  if ((o.mh.clothes ?? []).some((c: string) => /abaya|jalabiya/.test(c))) for (let i = 0; i < n; i++) if (region[i] === TOP || region[i] === BOTTOM) hidden[i] = 1;
  const hasRobe = (o.mh.clothes ?? []).some((c: string) => /abaya|jalabiya/.test(c));
  const minOff = 0.006;
  const mhGrid = new Grid(mhPs);
  const fitSkel = new Skeleton(skel.bones.slice()); // inverses from the fitting pose
  const garmentPts: Float32Array[] = []; const garmentMeshes: Mesh[] = []; const garmentIds = new Map<Mesh, number>();
  if (fitted) for (let k = garments.length - 1; k >= 0; k--) if (/hijab|amira/.test(garments[k].name)) garments.splice(k, 1);
  garments.sort((a, b) => Number(/abaya|jalabiya/.test(b.name)) - Number(/abaya|jalabiya/.test(a.name)));
  let robeGrid: Grid | null = null, robeN: Float32Array | null = null, robeMesh: SkinnedMesh | null = null;
  for (const g of garments) {
    const gp = g.geometry.getAttribute('position');
    const isHead = /hijab|amira/.test(g.name);
    const robe = /abaya|jalabiya/.test(g.name);
    const G = new Float32Array(gp.count * 3), D = new Float32Array(gp.count * 3);
    for (let i = 0; i < gp.count; i++) G.set(T(gp.getX(i), gp.getY(i), gp.getZ(i)), i * 3);
    for (let i = 0; i < gp.count; i++) {
      const p = [G[i * 3], G[i * 3 + 1], G[i * 3 + 2]];
      const m = mhGrid.nearest(p[0], p[1], p[2]);
      const nm = [mhN[m * 3], mhN[m * 3 + 1], mhN[m * 3 + 2]];
      const rel = [p[0] - mhPs[m * 3], p[1] - mhPs[m * 3 + 1], p[2] - mhPs[m * 3 + 2]];
      const d = rel[0] * nm[0] + rel[1] * nm[1] + rel[2] * nm[2];
      const q = visGrid.nearest(mhPs[m * 3], mhPs[m * 3 + 1], mhPs[m * 3 + 2]);
      const off = minOff + Math.max(d, 0);
      const snap = [0, 1, 2].map((k) => QP[q * 3 + k] + QN[q * 3 + k] * off + (rel[k] - nm[k] * d));
      // above the neck a headwear follows the scaled head, not the (hidden) hair surface
      const w = isHead ? smooth(mhNeckY - 0.05, mhNeckY + 0.02, p[1]) : 0;
      const hp = Hd(p);
      // a hijab drape lies on top of the robe: lift it off by a centimetre so the two never interleave
      if (robe || (isHead && hasRobe)) { for (let k = 0; k < 3; k++) D[i * 3 + k] = (hp[k] - p[k]) * w + (robe ? 0 : nm[k] * 0.012 * (1 - w)); continue; }
      for (let k = 0; k < 3; k++) D[i * 3 + k] = snap[k] * (1 - w) + hp[k] * w - p[k];
    }
    const idx = g.geometry.index!.array as ArrayLike<number>;
    const nb: number[][] = Array.from({ length: gp.count }, () => []);
    for (let t = 0; t < idx.length; t += 3) for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) { nb[a].push(b); nb[b].push(a); }
    const loose = /abaya|jalabiya|dress|gown/.test(g.name);
    // over a robe the hijab's blend is already smooth (head fit above the neck, its own drape below): no smoothing
    for (let it = 0; it < (isHead && hasRobe ? 0 : isHead ? 30 : loose ? 24 : 6); it++) {
      const E = new Float32Array(D);
      for (let i = 0; i < gp.count; i++) { if (!nb[i].length) continue; for (let k = 0; k < 3; k++) { let sum = D[i * 3 + k]; for (const j of nb[i]) sum += D[j * 3 + k]; E[i * 3 + k] = sum / (nb[i].length + 1); } }
      D.set(E);
    }
    const out = new Float32Array(gp.count * 3);
    for (let i = 0; i < out.length; i++) out[i] = G[i] + D[i];
    tick('smoothed');
    const armBind = new Map<number, [number, number, number]>(); // vertex -> [forearm bone, hand bone, hand weight]
    if (robe && !o.bellSleeves) {
      // sleeves follow the character's arm chain: stretch each sleeve so it ends just past the top of the visible hand,
      // taper it into a cuff there, and ride the arm bones
      const hipX = worldPos(qb('Hips')).x;
      for (const sd of ['Left', 'Right']) {
        const S = worldPos(qb(`${sd}Arm`)), E = worldPos(qb(`${sd}ForeArm`)), H = worldPos(qb(`${sd}Hand`));
        const L1 = S.distanceTo(E), L2 = E.distanceTo(H);
        const at = (u: number) => (u <= L1 ? S.clone().lerp(E, u / L1) : E.clone().lerp(H, Math.min(1.6, (u - L1) / L2)));
        const dirAt = (u: number) => (u <= L1 ? E.clone().sub(S) : H.clone().sub(E)).normalize();
        const proj = (P0: Vector3) => {
          let best = { u: 0, d: Infinity };
          for (const [a, b, off, len] of [[S, E, 0, L1], [E, H, L1, L2 * 1.6]] as [Vector3, Vector3, number, number][]) {
            const ab = b.clone().sub(a).normalize(); const t = Math.max(0, Math.min(len, P0.clone().sub(a).dot(ab)));
            const d = a.clone().addScaledVector(ab, t).distanceTo(P0); if (d < best.d) best = { u: off + t, d };
          }
          return best;
        };
        const sel: { i: number; u: number; rv: Vector3 }[] = [];
        for (let i = 0; i < gp.count; i++) {
          const P0 = new Vector3(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
          if (Math.abs(P0.x - hipX) < Math.abs(S.x - hipX) * 0.85 || Math.sign(P0.x - hipX) !== Math.sign(S.x - hipX)) continue;
          const pr = proj(P0); if (pr.d > 0.2) continue;
          sel.push({ i, u: pr.u, rv: P0.clone().sub(at(pr.u)) });
        }
        if (!sel.length) continue;
        let uMax = 0; for (const v of sel) uMax = Math.max(uMax, v.u);
        let uHand = L1 + L2; // top of the visible hand along the chain
        for (let i = 0; i < n; i++) if (region[i] === HANDS && QP[i * 3 + 1] > -1 && new Vector3(QP[i * 3], QP[i * 3 + 1], QP[i * 3 + 2]).distanceTo(H) < 0.14) { const pr = proj(new Vector3(QP[i * 3], QP[i * 3 + 1], QP[i * 3 + 2])); if (pr.u > L1) uHand = Math.min(uHand, pr.u); }
        const uEnd = uHand + 0.015, u0 = 0.3 * L1;
        for (const v of sel) {
          const u2 = v.u <= u0 ? v.u : u0 + (v.u - u0) * (uEnd - u0) / Math.max(1e-3, uMax - u0);
          const r = v.rv.length() || 1, r0 = 0.045, w = smooth(0.55, 1.0, u2 / uEnd);
          const slim = 1 - (1 - (o.sleeveSlim ?? 0.72)) * smooth(0.3 * L1, 0.75 * L1, u2); // shoulder seam stays put
          const nr = r > r0 ? r0 + (r - r0) * (1 - 0.85 * w) * slim : r;
          const P1 = at(u2).addScaledVector(v.rv.clone().normalize(), nr);
          out[v.i * 3] = P1.x; out[v.i * 3 + 1] = P1.y; out[v.i * 3 + 2] = P1.z;
          const onUpper = u2 <= L1;
          if (u2 < 0.45 * L1) { // near the shoulder: blend from the (still) shoulder bone into the arm, so the seam stretches instead of tearing
            armBind.set(v.i, [skel.bones.indexOf(qb(`${sd}Shoulder`)), skel.bones.indexOf(qb(`${sd}Arm`)), smooth(0.0, 0.45, u2 / L1)]); continue;
          }
          armBind.set(v.i, onUpper
            ? [skel.bones.indexOf(qb(`${sd}Arm`)), skel.bones.indexOf(qb(`${sd}ForeArm`)), smooth(0.8, 1.0, u2 / L1)]
            : [skel.bones.indexOf(qb(`${sd}ForeArm`)), skel.bones.indexOf(qb(`${sd}Hand`)), smooth(0.85, 1.05, (u2 - L1) / L2)]);
          void dirAt;
        }
      }
    }
    let rimIn: Uint8Array | null = null;
    if (isHead && !o.cut) {
      // clean face opening: hijab vertices in front of the face are pulled out to an even oval rim around it,
      // then tucked onto the skin there, so the edge frames the face like a pinned scarf
      const ox = OP.x, oy = OP.y, orx = OP.rx, ory = OP.ry;
      rimIn = new Uint8Array(gp.count);
      const rimBin = new Int32Array(gp.count), binZ = new Array(48).fill(-1e9);
      const skinFront = new Grid(QP, (i) => keepFace[i] === 1 && skin[i] === 1);
      for (let i = 0; i < gp.count; i++) {
        const x = out[i * 3], y = out[i * 3 + 1], z = out[i * 3 + 2];
        if (z < qNose.z - 0.1) continue;
        const ex = (x - ox) / orx, ey = (y - oy) / opRy(y), r = Math.hypot(ex, ey);
        if (r >= 1) continue;
        rimIn[i] = 1;
        const th = Math.atan2(ey, ex);
        const nx = ox + Math.cos(th) * orx, ny = oy + Math.sin(th) * (Math.sin(th) > 0 ? OP.top : ory);
        // rim depth follows a smooth curve round the face (deepest at the temples), not the skin under each vertex
        const c = Math.cos(th), sn = Math.sin(th);
        const curve = qNose.z - 0.03 - 0.055 * c * c - (sn > 0 ? 0.02 * sn * sn : 0.012 * sn * sn);
        const q = skinFront.nearest(nx, ny, qNose.z, 4);
        const nz = q >= 0 ? Math.max(curve, QP[q * 3 + 2] + 0.007) : curve;
        out[i * 3] = nx; out[i * 3 + 1] = ny; out[i * 3 + 2] = nz;
        const b = Math.floor(((th + Math.PI) / (2 * Math.PI)) * 48) % 48; rimBin[i] = b; binZ[b] = Math.max(binZ[b], nz);
      }
      // one smooth depth around the ring: per-angle maximum, circularly averaged
      const sm = binZ.map((_, b) => { let t = 0, w = 0; for (let d = -3; d <= 3; d++) { const z = binZ[(b + d + 48) % 48]; if (z > -1e8) { t += z; w++; } } return w ? t / w : -1e9; });
      for (let i = 0; i < gp.count; i++) if (rimIn[i] && sm[rimBin[i]] > -1e8) out[i * 3 + 2] = Math.max(out[i * 3 + 2], sm[rimBin[i]]);
    }
    if (rimIn) {
      // relax the band of fabric just outside the opening (rim fixed) so tucked layers lie flat instead of bunching
      const ox = OP.x, oy = OP.y, orx = OP.rx, ory = OP.ry;
      const band: number[] = [];
      for (let i = 0; i < gp.count; i++) if (!rimIn[i] && out[i * 3 + 2] > qNose.z - 0.12 && out[i * 3 + 1] > oy - 0.2 * ory && Math.hypot((out[i * 3] - ox) / orx, (out[i * 3 + 1] - oy) / opRy(out[i * 3 + 1])) < 2.0) band.push(i);
      for (let it = 0; it < 22; it++) {
        const E = new Float32Array(out);
        for (const i of band) { if (!nb[i].length) continue; for (let k = 0; k < 3; k++) { let m = out[i * 3 + k]; for (const j of nb[i]) m += out[j * 3 + k]; E[i * 3 + k] = m / (nb[i].length + 1); } }
        out.set(E);
      }
    }
    if (isHead || robe) {
      // clean hems: smooth open-edge vertices along the edge itself (source meshes have saw-tooth borders)
      const ec = new Map<string, number>();
      for (let t = 0; t < idx.length; t += 3) for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) { const k = a < b ? a + ',' + b : b + ',' + a; ec.set(k, (ec.get(k) ?? 0) + 1); }
      const bn = new Map<number, number[]>();
      for (const [k, c] of ec) if (c === 1) { const [a, b] = k.split(',').map(Number); (bn.get(a) ?? bn.set(a, []).get(a)!).push(b); (bn.get(b) ?? bn.set(b, []).get(b)!).push(a); }
      const hem = [...bn.keys()].filter((i) => out[i * 3 + 1] < neckY - 0.06 && !(rimIn && rimIn[i]));
      for (let it = 0; it < 12; it++) {
        const E = new Float32Array(out);
        for (const i of hem) { const nbs = bn.get(i)!; if (nbs.length !== 2) continue; for (let k = 0; k < 3; k++) E[i * 3 + k] = out[i * 3 + k] * 0.4 + (out[nbs[0] * 3 + k] + out[nbs[1] * 3 + k]) * 0.3; }
        out.set(E);
      }
    }
    let tris = Array.from(idx);
    if (rimIn) { // triangles wholly inside the opening go; the rest keep their snapped rim corners
      const keep: number[] = [];
      for (let t = 0; t < tris.length; t += 3) if (!(rimIn[tris[t]] && rimIn[tris[t + 1]] && rimIn[tris[t + 2]])) keep.push(tris[t], tris[t + 1], tris[t + 2]);
      tris = keep;
    }
    let uvA = g.geometry.getAttribute('uv') as BufferAttribute;
    let outF = out;
    if (isHead && o.mirror) {
      // scarf wraps are asymmetric (one side tucks over the other); a symmetric frame reads cleaner: mirror the clean half
      const cx = face.x, keep: number[] = [];
      for (let t = 0; t < tris.length; t += 3) if ((out[tris[t] * 3] + out[tris[t + 1] * 3] + out[tris[t + 2] * 3]) / 3 < cx) keep.push(tris[t], tris[t + 1], tris[t + 2]);
      const nv = gp.count; const o2 = new Float32Array(nv * 6); o2.set(out);
      for (let i = 0; i < nv; i++) { if (o2[i * 3] > cx) o2[i * 3] = cx; o2[nv * 3 + i * 3] = 2 * cx - o2[i * 3]; o2[nv * 3 + i * 3 + 1] = o2[i * 3 + 1]; o2[nv * 3 + i * 3 + 2] = o2[i * 3 + 2]; }
      const uv2 = new Float32Array(nv * 4); uv2.set(uvA.array as Float32Array); uv2.set(uvA.array as Float32Array, nv * 2);
      const t2 = keep.slice(); for (let t = 0; t < keep.length; t += 3) t2.push(keep[t] + nv, keep[t + 2] + nv, keep[t + 1] + nv);
      outF = o2; uvA = new BufferAttribute(uv2, 2); tris = t2;
    }
    const vcount = outF.length / 3;
    if (isHead && o.cut) {
      const ins = (i: number) => inFace(out[i * 3], out[i * 3 + 1], out[i * 3 + 2], 0.95);
      const keep: number[] = [];
      for (let t = 0; t < tris.length; t += 3) if (!(ins(tris[t]) || ins(tris[t + 1]) || ins(tris[t + 2]))) keep.push(tris[t], tris[t + 1], tris[t + 2]);
      tris = keep;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(outF, 3));
    geo.setAttribute('uv', uvA);
    geo.setIndex(tris); geo.computeVertexNormals();
    const gm2 = (g.material as MeshStandardMaterial).clone();
    gm2.side = DoubleSide;
    const id = g.name.replace(/^clothes-/, '');
    const tint = o.colors?.[id];
    if (tint && gm2.map?.image) {
      // tintable fabric: turn the texture into normalized grey detail (mean 0.8) so the tint shows true even on dark cloth
      const img = gm2.map.image as CanvasImageSource & { width: number; height: number };
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d')!; cx.drawImage(img, 0, 0);
      const px = cx.getImageData(0, 0, cv.width, cv.height); const d = px.data;
      let sum = 0, k = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { sum += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; k++; }
      const mean = Math.max(1, sum / Math.max(1, k));
      console.log('HEADFIT TEX ' + id + ' ' + img.width + 'x' + img.height + ' mean ' + mean.toFixed(1) + ' n ' + k + ' ' + gm2.type + ' transparent ' + gm2.transparent + ' alphaMap ' + !!gm2.alphaMap + ' metal ' + gm2.metalness + ' mmap ' + !!gm2.metalnessMap + ' vc ' + gm2.vertexColors + ' emis ' + gm2.emissive?.getHexString() + ' color ' + gm2.color.getHexString() + ' attrs ' + Object.keys(g.geometry.attributes).join('/'));
      for (let i = 0; i < d.length; i += 4) { const l = Math.max(0, Math.min(255, (0.8 + (((0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / mean) - 1) * 1.5) * 255)); d[i] = d[i + 1] = d[i + 2] = l; }
      cx.putImageData(px, 0, 0);
      const t = new CanvasTexture(cv); t.flipY = gm2.map.flipY; t.colorSpace = SRGBColorSpace; t.wrapS = gm2.map.wrapS; t.wrapT = gm2.map.wrapT;
      gm2.map = t; gm2.color = new Color(tint).multiplyScalar(1.15);
    } else if (tint) gm2.color = new Color(tint);
    gm2.roughness = Math.max(gm2.roughness, 0.8); gm2.metalness = 0; gm2.metalnessMap = null; gm2.vertexColors = false; gm2.needsUpdate = true;
    // skin each garment vertex like the nearest body vertex, so the garment follows when the arms are lowered
    if (robe) {
      // every sleeve vertex (outboard of the torso, near an arm) rides on that arm's bones
      const hipX = worldPos(qb('Hips')).x;
      for (let i = 0; i < gp.count; i++) {
        if (armBind.has(i)) continue;
        const P0 = new Vector3(outF[i * 3], outF[i * 3 + 1], outF[i * 3 + 2]);
        let best: [number, number, number] | null = null, bd = 0.2;
        for (const sd of ['Left', 'Right']) {
          const S = worldPos(qb(`${sd}Arm`)), E = worldPos(qb(`${sd}ForeArm`)), H = worldPos(qb(`${sd}Hand`));
          if (Math.abs(P0.x - hipX) < Math.abs(S.x - hipX) * 0.8) continue;
          const segs: [Vector3, Vector3, string, string][] = [[S, E, `${sd}Arm`, `${sd}ForeArm`], [E, H, `${sd}ForeArm`, `${sd}Hand`]];
          for (const [a, b, ba, bb] of segs) {
            const ab = b.clone().sub(a); const t = Math.max(0, Math.min(1, P0.clone().sub(a).dot(ab) / ab.lengthSq()));
            const d = a.clone().addScaledVector(ab, t).distanceTo(P0);
            if (d < bd) { bd = d; best = ba === `${sd}Arm` && t < 0.45
              ? [skel.bones.indexOf(qb(`${sd}Shoulder`)), skel.bones.indexOf(qb(ba)), smooth(0.0, 0.45, t)]
              : [skel.bones.indexOf(qb(ba)), skel.bones.indexOf(qb(bb)), smooth(0.7, 1.0, t)]; }
          }
        }
        if (best) armBind.set(i, best);
      }
    }
    // robe fabric away from the arms must not follow them (no dents when the arms come down)
    const armish = (i: number) => /Arm|Hand|Shoulder/.test(boneName(i));
    const torsoGrid = robe ? ((window as any)._torsoGrid ??= new Grid(QP, (i) => !armish(i) && region[i] !== HAIR)) : null;
    const armDist = (x: number, y: number, z: number) => {
      let best = Infinity;
      for (const sd of ['Left', 'Right']) for (const [a, b] of [[`${sd}Arm`, `${sd}ForeArm`], [`${sd}ForeArm`, `${sd}Hand`]]) {
        const A = worldPos(qb(a)), B = worldPos(qb(b)); const ab = B.clone().sub(A); const t = Math.max(0, Math.min(1, new Vector3(x, y, z).sub(A).dot(ab) / ab.lengthSq()));
        best = Math.min(best, A.clone().addScaledVector(ab, t).distanceTo(new Vector3(x, y, z)));
      }
      return best;
    };
    const SI = new Uint16Array(vcount * 4), SW = new Float32Array(vcount * 4);
    for (let i = 0; i < vcount; i++) {
      let q = visGrid.nearest(outF[i * 3], outF[i * 3 + 1], outF[i * 3 + 2]);
      if (torsoGrid && armish(q) && armDist(outF[i * 3], outF[i * 3 + 1], outF[i * 3 + 2]) > 0.11) q = torsoGrid.nearest(outF[i * 3], outF[i * 3 + 1], outF[i * 3 + 2]);
      const ab = i < gp.count ? armBind.get(i) : undefined;
      if (ab) { SI[i * 4] = ab[0]; SW[i * 4] = 1 - ab[2]; SI[i * 4 + 1] = ab[1]; SW[i * 4 + 1] = ab[2]; continue; }
      for (let k = 0; k < 4; k++) { SI[i * 4 + k] = si.getComponent(q, k); SW[i * 4 + k] = sw.getComponent(q, k); }
    }
    geo.setAttribute('skinIndex', new BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new BufferAttribute(SW, 4));
    if (o.debugBind) { const C = new Float32Array(vcount * 3); for (let i = 0; i < vcount; i++) { const ab = armBind.get(i); C.set(ab ? [1, 0.2 + ab[2] * 0.8, 0.2] : [0.3, 0.3, 1], i * 3); } geo.setAttribute('color', new BufferAttribute(C, 3)); gm2.vertexColors = true; gm2.map = null; gm2.color = new Color('#ffffff'); }
    const gm = new SkinnedMesh(geo, gm2); if (!o.hideGarments) root.add(gm); gm.bind(fitSkel, new Matrix4()); gm.frustumCulled = false; gm.castShadow = gm.receiveShadow = true;
    garmentIds.set(gm, isHead ? 13 : 12);
    garmentMeshes.push(gm); garmentPts.push(outF); tick('garment ' + id);
    if (robe) {
      robeMesh = gm;
      robeGrid = new Grid(out); robeN = vertexNormals(out, tris);
      // winding may be either way: make every normal point away from the body's vertical axis
      const hip = worldPos(qb('Hips'));
      for (let i = 0; i < gp.count; i++) if ((out[i * 3] - hip.x) * robeN[i * 3] + (out[i * 3 + 2] - hip.z) * robeN[i * 3 + 2] < 0) for (let k = 0; k < 3; k++) robeN[i * 3 + k] *= -1;
    }
  }
  function lowerArms() {
    for (const s of ['Left', 'Right']) {
      const sx = Math.sign(worldPos(qb(`${s}Arm`)).x - worldPos(qb('Hips')).x);
      aimBone(qb(`${s}Arm`), qb(`${s}ForeArm`), new Vector3(sx * (o.armSpread ?? (hasRobe ? 0.3 : 0.2)), -1, 0.0));
      aimBone(qb(`${s}ForeArm`), qb(`${s}Hand`), new Vector3(sx * 0.12, -1, 0.18));
    }
  }
  if (hijab && fitted) buildFittedHijab();
  function buildFittedHijab() {
    const C = 192; // columns round the body (theta = 0 faces front)
    const Cx = face.x, Cy = OP.y;
    const headSkin = (i: number) => region[i] === HEAD && skin[i] === 1 && QP[i * 3 + 2] > qNose.z - 0.13 && !(Math.abs(QP[i * 3] - face.x) > 0.85 * face.rx && QP[i * 3 + 2] < qNose.z - 0.05 && QP[i * 3 + 1] > neckY);
    const pct = (a: number[], q: number) => { a.sort((p, r) => p - r); return a[Math.floor(a.length * q)] ?? 0; };
    const wid: number[] = []; for (let i = 0; i < n; i++) if (headSkin(i) && Math.abs(QP[i * 3 + 1] - Cy) < 0.02) wid.push(Math.abs(QP[i * 3] - Cx));
    const Rx = pct(wid, 0.97) + 0.018, Rz = Rx * 1.12, Cz = qNose.z - 0.035 - Rz;
    let skinTop = browY; for (let i = 0; i < n; i++) if (headSkin(i) && !hidden[i] && QP[i * 3 + 1] > skinTop) skinTop = QP[i * 3 + 1];
    const RyTop = Math.min(browY - Cy + 0.1, Math.max(browY - Cy + 0.075, skinTop - Cy + (o.crown ?? 0.045)));
    const chinY = face.y - face.ry;
    const chinZ: number[] = []; for (let i = 0; i < n; i++) if (headSkin(i) && Math.abs(QP[i * 3] - Cx) < 0.02 && Math.abs(QP[i * 3 + 1] - (chinY + 0.012)) < 0.012) chinZ.push(QP[i * 3 + 2]);
    const chinFront = (chinZ.length ? pct(chinZ, 0.95) : qNose.z - 0.03) - Cz;
    const sp = worldPos(qb('Spine02'));
    const hipX = worldPos(qb('Hips')).x, shX = Math.abs(worldPos(qb('LeftArm')).x - hipX);
    const yNeck = neckY - 0.015;
    const hemY = (th: number) => neckY - 0.11 - ((o.hem ?? 0.24) - 0.11) * Math.abs(Math.cos(th)) ** 0.8; // long front and back, short at the arms
    // what the fabric must clear: the face/head skin, and below the chin the neck and the robe (or clothes) inside the shoulders
    const U: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = QP[i * 3], y = QP[i * 3 + 1];
      if (y > chinY - 0.01) { if (headSkin(i) && !hidden[i]) U.push(x, y, QP[i * 3 + 2]); continue; }
      if (Math.abs(x - hipX) > shX * (y > neckY - 0.1 ? 1.25 : 0.95)) continue;
      if (region[i] === HEAD || (!hasRobe && (region[i] === TOP))) U.push(x, y, QP[i * 3 + 2]);
    }
    if (robeMesh) {
      // clear the robe as it will be seen: with the arms down (sleeves hang beside the body, under the drape)
      const saved = skel.bones.map((b) => b.quaternion.clone());
      if (!o.noLower) lowerArms(); root.updateMatrixWorld(true); robeMesh.skeleton.update();
      const pos = robeMesh.geometry.getAttribute('position'), v = new Vector3();
      for (let i = 0; i < pos.count; i++) { robeMesh.getVertexPosition(i, v); v.applyMatrix4(robeMesh.matrixWorld); if (v.y < chinY) U.push(v.x, v.y, v.z); }
      skel.bones.forEach((b, k) => b.quaternion.copy(saved[k])); root.updateMatrixWorld(true);
    }
    const slab = new Map<number, number[]>(); const DY = 0.006;
    for (let k = 0; k < U.length; k += 3) { const b = Math.floor(U[k + 1] / DY); (slab.get(b) ?? slab.set(b, []).get(b)!).push(k); }
    const reach = (y: number, th: number, cx: number, cz: number) => { // furthest underlying surface along this direction, near this height
      let m = 0; const bw = (2 * Math.PI) / C * 1.6;
      for (let b = Math.floor(y / DY) - 1; b <= Math.floor(y / DY) + 1; b++) for (const k of slab.get(b) ?? []) {
        const dx = U[k] - cx, dz = U[k + 2] - cz; let d = Math.atan2(dx, dz) - th; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < bw) m = Math.max(m, Math.hypot(dx, dz) * Math.cos(d));
      }
      return m;
    };
    const ell = (th: number, rx: number, rzF: number, rzB: number) => { if (rx < 1e-5) return 0; const s = Math.sin(th), c = Math.cos(th), rz = Math.max(1e-5, c > 0 ? rzF : rzB); return 1 / Math.sqrt((s / rx) ** 2 + (c / rz) ** 2); };
    type Row = (th: number) => { y: number; cx: number; cz: number; r: number; clear: number; fold: number; bone: [string, string, number] };
    const rows: Row[] = [];
    const NT = 34, NL = 22, NN = 12, NC = 30;
    for (let j = 0; j <= NT; j++) { // crown dome down to eye level
      const phi = (j / NT) * Math.PI / 2, s = Math.sin(phi), y = Cy + RyTop * Math.cos(phi);
      rows.push((th) => ({ y, cx: Cx, cz: Cz, r: ell(th, Rx * s, Rz * s, Rz * 1.08 * s), clear: 0.01, fold: 0, bone: ['Head', 'Head', 0] }));
    }
    for (let j = 1; j <= NL; j++) { // eye level down to the chin: the jaw narrows, the back stays full
      const u = j / NL, y = Cy + (chinY - Cy) * u, e = u ** 1.6;
      rows.push((th) => ({ y, cx: Cx, cz: Cz, r: ell(th, Rx * (1 - 0.18 * e), Rz + (chinFront + 0.006 - Rz) * e * 0.6, Rz * 1.06), clear: 0.006, fold: 0, bone: ['Head', 'Head', 0] }));
    }
    for (let j = 1; j <= NN; j++) { // under the chin to the base of the neck: the front falls straight down from the chin
      const u = j / NN, y = chinY + (yNeck - chinY) * u;
      const cx = Cx + (sp.x - Cx) * u * 0.5, cz = Cz + (sp.z - Cz) * u * 0.5;
      rows.push((th) => ({ y, cx, cz, r: ell(th, Rx * 0.9 + (shX * 0.95 - Rx * 0.9) * Math.sqrt(u), chinFront + 0.01 - (cz - Cz) + 0.01 * u, Rz * 1.06 + 0.01 * u), clear: 0.01, fold: 0.006 * u, bone: ['Head', 'neck', smooth(0, 1, u)] }));
    }
    for (let j = 1; j <= NC; j++) { // over the shoulders down to the hem, flaring, with soft folds
      const v = j / NC;
      rows.push((th) => {
        const y = yNeck + (hemY(th) - yNeck) * v;
        const cx = Cx + (sp.x - Cx) * (0.5 + 0.5 * smooth(0, 0.3, v)), cz = Cz + (sp.z - Cz) * (0.5 + 0.5 * smooth(0, 0.3, v));
        const rx = shX * 0.95 + (shX + 0.06 + 0.02 * v - shX * 0.95) * smooth(0, 0.3, v);
        return { y, cx, cz, r: ell(th, rx, 0.06, 0.07), clear: 0.012, fold: 0.024 * smooth(0.05, 1, v), bone: ['neck', 'Spine02', smooth(0, 0.3, v)] };
      });
    }
    const NR = rows.length, nv = NR * C;
    const P = new Float32Array(nv * 3), rMin = new Float32Array(nv), rr = new Float32Array(nv), meta: ReturnType<Row>[] = [];
    for (let j = 0; j < NR; j++) for (let c = 0; c < C; c++) {
      const th = (c / C) * Math.PI * 2, m = rows[j](th), k = j * C + c; meta.push(m);
      rMin[k] = j < 6 ? 0 : reach(m.y, th, m.cx, m.cz) + m.clear;
      rr[k] = Math.max(m.r, rMin[k]);
    }
    { const M = new Float32Array(rMin); // 3x3 median: one stray sample (an earring, a seam) must not raise a horn
      for (let j = 1; j < NR - 1; j++) for (let c = 0; c < C; c++) { const vals: number[] = []; for (let dj = -1; dj <= 1; dj++) for (let dc = -1; dc <= 1; dc++) vals.push(rMin[(j + dj) * C + (c + dc + C) % C]); vals.sort((p, q) => p - q); M[j * C + c] = vals[4]; }
      rMin.set(M); for (let k = 0; k < nv; k++) rr[k] = Math.max(meta[k].r, rMin[k]); }
    { const bad: string[] = []; for (let k = 0; k < nv; k++) if (rr[k] > meta[k].r + 0.025) bad.push(`${Math.floor(k / C)}:${k % C} y=${meta[k].y.toFixed(3)} r=${meta[k].r.toFixed(3)} min=${rMin[k].toFixed(3)}`); console.log('HEADFIT HJ ' + bad.length + ' ' + [...new Set(bad.map((b) => b.split(':')[0]))].join(',') + ' :: ' + bad.filter((_, i) => i % 50 === 0).slice(0, 10).join(' | ')); }
    for (let it = 0; it < 10; it++) { // smooth the silhouette, never inside the clearance
      const E = new Float32Array(rr);
      for (let j = 1; j < NR - 1; j++) for (let c = 0; c < C; c++) { const k = j * C + c; E[k] = Math.max(rMin[k], (rr[k] * 2 + rr[k - C] + rr[k + C] + rr[j * C + (c + 1) % C] + rr[j * C + (c + C - 1) % C]) / 6); }
      rr.set(E);
    }
    { // the drape's clearance is blurred first (cloth bridges over small shapes), then lifted a touch to stay clear
      const jA = NT + NL + 1;
      for (let it = 0; it < 12; it++) { const E = new Float32Array(rMin); for (let j = jA; j < NR - 1; j++) for (let c = 0; c < C; c++) { const k = j * C + c; E[k] = (rMin[k] * 2 + rMin[k - C] + rMin[k + C] + rMin[j * C + (c + 1) % C] + rMin[j * C + (c + C - 1) % C]) / 6; } rMin.set(E); }
      for (let j = jA; j < NR; j++) for (let c = 0; c < C; c++) { const k = j * C + c; rMin[k] += 0.006; rr[k] = Math.max(rr[k], rMin[k]); } }
    { const j0 = NT + NL, j1 = NT + NL + NN + 2; // chin row .. a little into the drape
      for (let c = 0; c < C; c++) for (let j = j0 + 1; j < j1; j++) { const u = (j - j0) / (j1 - j0), k = j * C + c; rr[k] = Math.max(rMin[k], rr[j0 * C + c] + (rr[j1 * C + c] - rr[j0 * C + c]) * u * u * (3 - 2 * u)); } }
    for (let it = 0; it < 24; it++) { // the drape is cloth: much smoother than the head
      const E = new Float32Array(rr);
      for (let j = NT + NL + NN; j < NR - 1; j++) for (let c = 0; c < C; c++) { const k = j * C + c; E[k] = Math.max(rMin[k], (rr[k] * 2 + rr[k - C] + rr[k + C] + rr[j * C + (c + 1) % C] + rr[j * C + (c + C - 1) % C] + rr[j * C + (c + 2) % C] + rr[j * C + (c + C - 2) % C]) / 8); }
      for (let c = 0; c < C; c++) E[(NR - 1) * C + c] = E[(NR - 2) * C + c]; // hem row follows
      rr.set(E);
    }
    for (let j = 0; j < NR; j++) for (let c = 0; c <= C / 2; c++) { const a = j * C + c, b = j * C + (C - c) % C, m = Math.max(rr[a], rr[b]); rr[a] = rr[b] = m; } // exactly symmetric
    for (let c = 0; c < C; c++) rr[c] = 0; // the crown closes to a point
    for (let j = 0; j < NR; j++) for (let c = 0; c < C; c++) {
      const th = (c / C) * Math.PI * 2, k = j * C + c, m = meta[k];
      const r = rr[k] + m.fold * (0.5 + 0.5 * Math.cos(10 * th)) ** 1.5; // even, symmetric soft folds
      P.set([m.cx + Math.sin(th) * r, m.y, m.cz + Math.cos(th) * r], k * 3);
    }
    { let worst = -1, wd = 0; for (let k = 0; k < nv; k++) { const m = meta[k]; const d = Math.hypot(P[k * 3] - m.cx, P[k * 3 + 2] - m.cz) - m.r; if (d > wd) { wd = d; worst = k; } }
      const m = meta[worst]; console.log('HEADFIT WORST ' + JSON.stringify({ j: Math.floor(worst / C), c: worst % C, y: m.y, r: m.r, rMin: rMin[worst], rr: rr[worst], fold: m.fold, NT, NL, NN, NC })); }
    // face opening: vertices inside the oval move onto it (riding just above the skin); fully-inside cells are dropped
    const inside = new Uint8Array(nv);
    const skinF = new Grid(QP, (i) => headSkin(i));
    const ring = new Array(96).fill(-1e9), ringOf = new Int32Array(nv).fill(-1);
    for (let k = 0; k < nv; k++) {
      const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
      if (z < Cz || opR(x, y) >= 1) continue;
      inside[k] = 1;
      const th = Math.atan2((y - OP.y) / opRy(y), (x - OP.x) / opRx(y));
      const ny = OP.y + Math.sin(th) * opRy(OP.y + Math.sin(th)), nx = OP.x + Math.cos(th) * opRx(ny);
      const q = skinF.nearest(nx, ny, qNose.z, 4); const nz = q >= 0 ? QP[q * 3 + 2] + 0.004 : z;
      P[k * 3] = nx; P[k * 3 + 1] = ny; P[k * 3 + 2] = nz;
      const b = Math.floor(((th + Math.PI) / (2 * Math.PI)) * 96) % 96; ringOf[k] = b; ring[b] = Math.max(ring[b], nz);
    }
    const rs = ring.map((_, b) => { let t = 0, w = 0; for (let d = -3; d <= 3; d++) { const z = ring[(b + d + 96) % 96]; if (z > -1e8) { t += z; w++; } } return w ? t / w : -1e9; });
    for (let k = 0; k < nv; k++) if (ringOf[k] >= 0 && rs[ringOf[k]] > -1e8) P[k * 3 + 2] = rs[ringOf[k]];
    // relax the fabric round the opening (rim fixed) so the edge reads as one clean line
    const near: number[] = []; for (let k = 0; k < nv; k++) if (!inside[k] && P[k * 3 + 2] > Cz && opR(P[k * 3], P[k * 3 + 1]) < 1.5) near.push(k);
    for (let it = 0; it < 16; it++) {
      const E = new Float32Array(P);
      for (const k of near) { const j = Math.floor(k / C), c = k % C; if (j < 1 || j >= NR - 1) continue; const nb = [k - C, k + C, j * C + (c + 1) % C, j * C + (c + C - 1) % C]; for (let a = 0; a < 3; a++) { let t = P[k * 3 + a] * 2; for (const q of nb) t += P[q * 3 + a]; E[k * 3 + a] = t / 6; } }
      P.set(E);
    }
    const tri: number[] = [];
    for (let j = 0; j < NR - 1; j++) for (let c = 0; c < C; c++) {
      const a = j * C + c, b = j * C + (c + 1) % C, d = a + C, e = b + C;
      if (!(inside[a] && inside[b] && inside[d])) tri.push(a, d, b);
      if (!(inside[b] && inside[d] && inside[e])) tri.push(b, d, e);
    }
    // a soft tuck shadow at the opening and a touch of shade under the drape; no hard border
    const col = new Float32Array(nv * 3);
    for (let k = 0; k < nv; k++) { const t = P[k * 3 + 2] > Cz ? smooth(1.0, 1.3, opR(P[k * 3], P[k * 3 + 1])) : 1; const v = 0.84 + 0.16 * t; col.set([v, v, v], k * 3); }
    if (o.debugBind) for (let k = 0; k < nv; k++) { const j = Math.floor(k / C); col.set(inside[k] ? [0, 0, 0] : j <= NT ? [1, 0.3, 0.3] : j <= NT + NL ? [0.3, 1, 0.3] : j <= NT + NL + NN ? [0.3, 0.3, 1] : [1, 1, 0.3], k * 3); }
    const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(P, 3)); geo.setAttribute('color', new BufferAttribute(col, 3)); geo.setIndex(tri); geo.computeVertexNormals();
    const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
    for (let k = 0; k < nv; k++) { const bn = meta[k].bone; SI[k * 4] = skel.bones.indexOf(qb(bn[0])); SW[k * 4] = 1 - bn[2]; SI[k * 4 + 1] = skel.bones.indexOf(qb(bn[1])); SW[k * 4 + 1] = bn[2]; }
    geo.setAttribute('skinIndex', new BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new BufferAttribute(SW, 4));
    const tint = Object.entries(o.colors ?? {}).find(([k]) => /hijab|amira/.test(k))?.[1] ?? '#3a3c42';
    const hm = new SkinnedMesh(geo, new MeshStandardMaterial({ color: new Color(tint), roughness: 0.82, side: DoubleSide, vertexColors: true }));
    hm.bind(fitSkel, new Matrix4()); hm.frustumCulled = false; hm.castShadow = hm.receiveShadow = true;
    if (!o.hideGarments) root.add(hm);
    garmentIds.set(hm, 13);
    garmentMeshes.push(hm); garmentPts.push(P);
  }
  // under-scarf band: a smooth ring of fabric framing the face, covering the rim seam and the cut edge of the skin
  if (hijab && !fitted && !o.cut && !o.noBand) {
    const headIdx = skel.bones.indexOf(qb('Head'));
    const tintH = Object.entries(o.colors ?? {}).find(([k]) => /hijab|amira/.test(k))?.[1] ?? '#3a3c42';
    const N = 120, ox = OP.x, oy = OP.y, orx = OP.rx, ory = OP.ry;
    const skinF = new Grid(QP, (i) => keepFace[i] === 1 && skin[i] === 1 && !hidden[i]);
    const zs: number[] = [];
    for (let j = 0; j < N; j++) {
      const th = (j / N) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      const curve = qNose.z - 0.03 - 0.055 * c * c - (sn > 0 ? 0.02 * sn * sn : 0.012 * sn * sn);
      let z = curve;
      for (const k of [0.97, 1.04, 1.12]) { const q = skinF.nearest(ox + c * orx * k, oy + sn * (sn > 0 ? OP.top : ory) * k, qNose.z, 4); if (q >= 0) z = Math.max(z, QP[q * 3 + 2] + 0.01); }
      zs.push(z);
    }
    const zsm = zs.map((_, j) => { let t = 0; for (let d = -4; d <= 4; d++) t += zs[(j + d + N) % N]; return t / 9; });
    const P = new Float32Array(N * 3 * 3); const tri: number[] = [];
    for (let j = 0; j < N; j++) {
      const th = (j / N) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      const top = Math.max(0, sn) ** 2; // a touch wider at the forehead, like an under-scarf
      [[0.96 - 0.04 * top, 0.0], [1.02, 0.004], [1.18, -0.016]].forEach(([k, dz], r) => P.set([ox + c * orx * k, oy + sn * (sn > 0 ? OP.top : ory) * k, zsm[j] + dz + (r === 0 ? 0.004 * top : 0)], (j * 3 + r) * 3));
      const a = j * 3, b = ((j + 1) % N) * 3;
      tri.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
    }
    const bg = new BufferGeometry(); bg.setAttribute('position', new BufferAttribute(P, 3)); bg.setIndex(tri); bg.computeVertexNormals();
    const SI = new Uint16Array(N * 3 * 4), SW = new Float32Array(N * 3 * 4);
    for (let v = 0; v < N * 3; v++) { SI[v * 4] = headIdx; SW[v * 4] = 1; }
    bg.setAttribute('skinIndex', new BufferAttribute(SI, 4)); bg.setAttribute('skinWeight', new BufferAttribute(SW, 4));
    const bm = new SkinnedMesh(bg, new MeshStandardMaterial({ color: new Color(tintH).multiplyScalar(0.9), roughness: 0.85, side: DoubleSide }));
    bm.bind(fitSkel, new Matrix4()); bm.frustumCulled = false; bm.castShadow = bm.receiveShadow = true; if (!o.hideGarments) root.add(bm);
  }
  tick('garments');
  // hide the character's own surface under the garments
  if (garmentPts.length) {
    const allG = new Float32Array(garmentPts.reduce((a, b) => a + b.length, 0));
    let o2 = 0; for (const g of garmentPts) { allG.set(g, o2); o2 += g.length; }
    const gg = new Grid(allG);
    for (let i = 0; i < n; i++) {
      if (hidden[i] || keepFace[i] || region[i] === HANDS) continue;
      const j = gg.nearest(QP[i * 3], QP[i * 3 + 1], QP[i * 3 + 2], 5);
      if (j < 0) continue;
      const dx = allG[j * 3] - QP[i * 3], dy = allG[j * 3 + 1] - QP[i * 3 + 1], dz = allG[j * 3 + 2] - QP[i * 3 + 2];
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 0.14) continue;
      if (dist < 0.025 && dx * QN[i * 3] + dy * QN[i * 3 + 1] + dz * QN[i * 3 + 2] > -0.004) { hidden[i] = 1; continue; }
      // the nearest fabric lies outward along the surface normal (a cheap stand-in for a ray test; 170k vertices)
      if (dx * QN[i * 3] + dy * QN[i * 3 + 1] + dz * QN[i * 3 + 2] > 0.6 * dist) hidden[i] = 1;
    }
  }
  if (hidden.some((x) => x)) {
    const src = geo0.index!.array; const keep: number[] = [];
    // under a hijab, a head triangle with any hidden corner goes (no stray curls hanging off the face)
    const strict = (i: number) => hijab && (region[i] === HAIR || region[i] === HEAD) && QP[i * 3 + 1] > neckY - 0.05;
    for (let t = 0; t < src.length; t += 3) {
      const a = src[t], b = src[t + 1], c = src[t + 2];
      const gone = strict(a) || strict(b) || strict(c) ? hidden[a] || hidden[b] || hidden[c] : hidden[a] && hidden[b] && hidden[c];
      if (!gone) keep.push(a, b, c);
    }
    geo0.setIndex(keep);
  }

  let mirrorPatch: SkinnedMesh | null = null, patchSrc: number[] = [];
  // fill the face where hair used to cover it (a fused mesh has no skin under the hair): a mirrored copy of the clean
  // half of the face sits 1.5 mm behind the other half and shows only where that half has holes
  if ((hijab || o.mirrorFace) && !o.noMirrorFill) {
    const src = geo0.index!.array; const pick: number[] = [];
    const cleanSide = o.cleanSide ?? 1;
    for (let t = 0; t < src.length; t += 3) {
      const a = src[t], b = src[t + 1], c = src[t + 2];
      if (region[a] !== HEAD || hidden[a] || hidden[b] || hidden[c]) continue;
      const cx = (QP[a * 3] + QP[b * 3] + QP[c * 3]) / 3, cy = (QP[a * 3 + 1] + QP[b * 3 + 1] + QP[c * 3 + 1]) / 3;
      if ((cx - face.x) * cleanSide < -0.006 || cy < neckY + 0.02 || QN[a * 3 + 2] < -0.2) continue;
      pick.push(a, b, c);
    }
    const map = new Map<number, number>(); const ids: number[] = [];
    for (const v of pick) if (!map.has(v)) { map.set(v, ids.length); ids.push(v); }
    const g2 = new BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'] as const) {
      const at = geo0.getAttribute(name) as BufferAttribute; if (!at) continue;
      const arr = new (at.array.constructor as any)(ids.length * at.itemSize);
      ids.forEach((v, k) => { for (let c = 0; c < at.itemSize; c++) arr[k * at.itemSize + c] = at.getComponent(v, c); });
      if (name === 'position') for (let k = 0; k < ids.length; k++) { arr[k * 3] = -arr[k * 3]; arr[k * 3 + 2] -= 0.0015; }
      if (name === 'normal') for (let k = 0; k < ids.length; k++) arr[k * 3] = -arr[k * 3];
      g2.setAttribute(name, new BufferAttribute(arr, at.itemSize, at.normalized));
    }
    const tri2: number[] = []; for (let t = 0; t < pick.length; t += 3) tri2.push(map.get(pick[t])!, map.get(pick[t + 2])!, map.get(pick[t + 1])!);
    g2.setIndex(tri2);
    patchSrc = ids;
    const patch = new SkinnedMesh(g2, mat); patch.bind(body.skeleton, body.bindMatrix); patch.frustumCulled = false;
    patch.position.copy(body.position); patch.quaternion.copy(body.quaternion); patch.scale.copy(body.scale);
    body.parent!.add(patch);
    mirrorPatch = patch;
  }
  tick('hidden');
  // ---- recolour regions in the texture: paint a region map in UV space, then shift each region's colour
  const recol: Record<number, string | undefined> = { [HAIR]: o.hairColor, [TOP]: o.colors?.top, [BOTTOM]: o.colors?.bottom, [SHOES]: o.colors?.shoes };
  // grow the lock mask a little (texture strokes run past the sampled vertices)
  const lockNear = new Uint8Array(n);
  if (hijab) { const lg = new Grid(QP, (i) => lock[i] === 1); for (let i = 0; i < n; i++) if (region[i] === HEAD) { const q = lg.nearest(QP[i * 3], QP[i * 3 + 1], QP[i * 3 + 2], 1); if (q >= 0 && Math.hypot(QP[q * 3] - QP[i * 3], QP[q * 3 + 1] - QP[i * 3 + 1], QP[q * 3 + 2] - QP[i * 3 + 2]) < 0.006) lockNear[i] = 1; } }
  // painted strands: a dark triangle near the brows whose mirror image is plain skin
  const triLock = new Set<number>();
  if (hijab) {
    const darkG = new Grid(QP, (i) => region[i] === HEAD && !skin[i] && !lockNear[i]);
    const ix = geo0.index!.array;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t], b = ix[t + 1], c = ix[t + 2];
      if (region[a] !== HEAD) continue;
      const cy = (QP[a * 3 + 1] + QP[b * 3 + 1] + QP[c * 3 + 1]) / 3; if (cy < browY - 0.01 || cy > browY + 0.03) continue;
      const u = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3, vv = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3;
      const px2 = Math.min(TW - 1, Math.max(0, Math.floor(u * TW))), py2 = Math.min(TH - 1, Math.max(0, Math.floor((mat.map!.flipY ? 1 - vv : vv) * TH)));
      const k = (py2 * TW + px2) * 4; if (isSkin([srcPx.data[k], srcPx.data[k + 1], srcPx.data[k + 2]])) continue;
      const cx = (QP[a * 3] + QP[b * 3] + QP[c * 3]) / 3, cz = (QP[a * 3 + 2] + QP[b * 3 + 2] + QP[c * 3 + 2]) / 3;
      const q = darkG.nearest(2 * face.x - cx, cy, cz, 1);
      if (q < 0 || Math.hypot(QP[q * 3] - (2 * face.x - cx), QP[q * 3 + 1] - cy, QP[q * 3 + 2] - cz) > 0.005) triLock.add(t);
    }
  }
  if (o.skin || Object.values(recol).some(Boolean) || o.debug || hijab) {
    const lab = document.createElement('canvas'); lab.width = TW; lab.height = TH;
    const lx = lab.getContext('2d')!; lx.lineWidth = 2; lx.lineJoin = 'round';
    const idx = geo0.index!.array, fy = mat.map!.flipY;
    const U = (i: number) => [uv.getX(i) * TW, (fy ? 1 - uv.getY(i) : uv.getY(i)) * TH];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const r = region[a] === region[b] ? region[a] : region[c];
      const fh = hijab && r === HEAD && ((QP[a * 3 + 1] + QP[b * 3 + 1] + QP[c * 3 + 1]) / 3 > browY + 0.004 || lockNear[a] || lockNear[b] || lockNear[c] || triLock.has(t));
      const col = `rgb(${(fh ? FOREHEAD : r) * 30},0,0)`; lx.fillStyle = col; lx.strokeStyle = col;
      const [p, q, s] = [U(a), U(b), U(c)];
      lx.beginPath(); lx.moveTo(p[0], p[1]); lx.lineTo(q[0], q[1]); lx.lineTo(s[0], s[1]); lx.closePath(); lx.fill(); lx.stroke();
    }
    const L = lx.getImageData(0, 0, TW, TH).data;
    const out = new ImageData(new Uint8ClampedArray(srcPx.data), TW, TH);
    const d = out.data;
    const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;
    const sRef = lum(skinRef[0], skinRef[1], skinRef[2]);
    // per-region mean luminance (non-skin pixels), so the new colour keeps the painted shading
    const sat = (r: number, g: number, b: number) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
    const sums: Record<number, [number, number]> = {};
    for (let k = 0; k < d.length; k += 4) { const r = Math.round(L[k] / 30); if (!r || r >= HANDS) continue; if (r !== HAIR && sat(d[k], d[k + 1], d[k + 2]) < 0.18 && lum(d[k], d[k + 1], d[k + 2]) > 60) continue; (sums[r] ??= [0, 0]); sums[r][0] += lum(d[k], d[k + 1], d[k + 2]); sums[r][1]++; }
    const tint = (k: number, hex: string, ref: number, gain = 1) => {
      const c = new Color(hex); const l = Math.pow(lum(d[k], d[k + 1], d[k + 2]) / ref, gain);
      d[k] = Math.min(255, c.r * 255 * l); d[k + 1] = Math.min(255, c.g * 255 * l); d[k + 2] = Math.min(255, c.b * 255 * l);
    };
    const hexSRGB = (h: string) => '#' + new Color(h).getHexString(); // Color() takes sRGB hex; .r/.g/.b are linear in r152+, so convert
    // dominant fabric chroma per region (median of saturated pixels): only that fabric is recoloured, prints/whites stay
    const chroma = (r: number, g: number, b: number) => { const t = r + g + b + 1; return [r / t, g / t]; };
    const dom: Record<number, number[]> = {};
    for (const reg of [HAIR, TOP, BOTTOM]) {
      const rs: number[] = [], gs: number[] = [];
      for (let k = 0; k < d.length; k += 64) if (Math.round(L[k] / 30) === reg && sat(d[k], d[k + 1], d[k + 2]) > 0.18) { const c = chroma(d[k], d[k + 1], d[k + 2]); rs.push(c[0]); gs.push(c[1]); }
      rs.sort(); gs.sort(); if (rs.length) dom[reg] = [rs[rs.length >> 1], gs[gs.length >> 1]];
    }
    const skinC = chroma(skinRef[0], skinRef[1], skinRef[2]);
    // mean colour of each region's dominant fabric (and of the skin): recolouring multiplies by new/mean per channel,
    // which keeps the painted shading and detail; when that would brighten a lot (dark -> light) fall back to a luminance tint
    const mean: Record<number, number[]> = {};
    for (let k = 0; k < d.length; k += 16) {
      const r = Math.round(L[k] / 30); if (!r) continue;
      const ch = chroma(d[k], d[k + 1], d[k + 2]);
      const ref = r >= HANDS ? skinC : dom[r]; if (!ref || Math.hypot(ch[0] - ref[0], ch[1] - ref[1]) > 0.03) continue;
      const key = r >= HANDS ? HEAD : r; const m = (mean[key] ??= [0, 0, 0, 0]); m[0] += d[k]; m[1] += d[k + 1]; m[2] += d[k + 2]; m[3]++;
    }
    const lin = (v: number) => Math.pow(v / 255, 2.2);
    const recolour = (k: number, key: number, hex: string, w: number) => {
      const m = mean[key]; if (!m || !m[3]) return;
      const c = new Color(hex); const tgt = [c.r, c.g, c.b].map((x) => Math.pow(x, 1 / 2.2) * 255); // sRGB 0..255
      const src = [m[0] / m[3], m[1] / m[3], m[2] / m[3]];
      const ratio = tgt.map((t, q) => Math.pow(lin(t) / Math.max(1e-4, lin(src[q])), 1 / 2.2));
      const k0 = [d[k], d[k + 1], d[k + 2]];
      let res: number[];
      if (Math.max(...ratio) < 2.2) res = k0.map((x, q) => Math.min(255, x * ratio[q]));
      else { const l = lum(k0[0], k0[1], k0[2]) / Math.max(1, lum(src[0], src[1], src[2])); res = tgt.map((t) => Math.min(255, t * l)); }
      for (let q = 0; q < 3; q++) d[k + q] = k0[q] * (1 - w) + res[q] * w;
    };
    for (let k = 0; k < d.length; k += 4) {
      let r = Math.round(L[k] / 30); if (!r) continue;
      if (r === FOREHEAD) { // painted fringe on the forehead skin: under a hijab it becomes skin
        const ch0 = chroma(d[k], d[k + 1], d[k + 2]);
        const off = Math.hypot(ch0[0] - skinC[0], ch0[1] - skinC[1]);
        const w = smooth(0.02, 0.05, off) || (lum(d[k], d[k + 1], d[k + 2]) < 0.7 * sRef ? 1 : 0);
        if (w > 0) for (let q = 0; q < 3; q++) d[k + q] = d[k + q] * (1 - w) + skinRef[q] * 0.97 * w;
        r = HEAD;
      }
      const c = [d[k], d[k + 1], d[k + 2]]; const l = lum(c[0], c[1], c[2]); const ch = chroma(c[0], c[1], c[2]);
      if (o.debug) { const dc = ['#000', '#e33', '#3a3', '#33e', '#ee3', '#3ee', '#e3e'][r]; tint(k, dc, 128, 0); continue; }
      if (r === HEAD || r === HANDS) {
        if (!o.skin) continue;
        const w = 1 - smooth(0.035, 0.075, Math.hypot(ch[0] - skinC[0], ch[1] - skinC[1]));
        if (w > 0) recolour(k, HEAD, o.skin, w);
        continue;
      }
      const hex = recol[r]; if (!hex || r === SHOES) continue;
      let w = 1;
      if (r !== HAIR && dom[r]) w = Math.max(1 - smooth(0.06, 0.12, Math.hypot(ch[0] - dom[r][0], ch[1] - dom[r][1])), l < 50 ? 1 : 0);
      if (r !== HAIR && l >= 50 && sat(c[0], c[1], c[2]) < 0.2 && mean[r] && sat(mean[r][0], mean[r][1], mean[r][2]) > 0.3) w = 0;
      if (r !== HAIR && l > 205 && sat(c[0], c[1], c[2]) < 0.15) w = 0;
      if (r !== HAIR && dom[r] && l >= 50 && sat(c[0], c[1], c[2]) < 0.25 && Math.hypot(ch[0] - dom[r][0], ch[1] - dom[r][1]) > 0.05 && mean[r] && sat(mean[r][0], mean[r][1], mean[r][2]) > 0.3) w = 0;
      if (r !== HAIR && mean[r] && l > 1.6 * lum(mean[r][0] / mean[r][3], mean[r][1] / mean[r][3], mean[r][2] / mean[r][3]) && sat(c[0], c[1], c[2]) < sat(mean[r][0], mean[r][1], mean[r][2])) w = 0;
      if (w > 0) recolour(k, r, hex, w);
    }
    const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH; cv.getContext('2d')!.putImageData(out, 0, 0);
    const t = new CanvasTexture(cv); t.flipY = mat.map!.flipY; t.colorSpace = SRGBColorSpace; t.wrapS = mat.map!.wrapS; t.wrapT = mat.map!.wrapT;
    mat.map = t; mat.needsUpdate = true;
  }

  // relaxed pose: arms down along the body, elbows slightly bent
  if (!o.noLower) lowerArms();
  tick('recolour');
  root.updateMatrixWorld(true);
  if (o.kit) return exportKit(o.kit);
  const target = o.target ? new Vector3(...o.target) : o.shot === 'bust' ? new Vector3(0, (neckY + qBox.max.y) / 2 - 0.03, 0) : new Vector3(0, qBox.min.y + (qBox.max.y - qBox.min.y) * 0.5, 0);
  const h = o.frame ?? (o.shot === 'bust' ? 0.62 : (qBox.max.y - qBox.min.y) * 1.08);
  const dist = h / 2 / Math.tan((camera.fov * Math.PI) / 360);
  camera.position.set(Math.sin(o.yaw) * dist, target.y + dist * 0.03, Math.cos(o.yaw) * dist);
  camera.lookAt(target);
  renderer.setSize(o.size, o.size, false); camera.aspect = 1; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');

  // ------------------------------------------------------------------ art-kit export
  // Per angle: a lit colour pass and a part-id pass (orthographic, transparent, ss x supersampled) on the
  // 800x1280 art canvas = 400x640 units, 1 unit = UNIT metres, feet on y = 610.
  function exportKit(k: { yaws: number[]; ss: number; beard?: boolean }) {
    const UNIT = 0.00305, W = 400, H = 640, FEET = 610;
    const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;
    const chroma = (r: number, g: number, b: number) => { const t = r + g + b + 1; return [r / t, g / t]; };
    // ---- part ids for the fused character, decided per fragment: region from a vertex attribute, face zone from the
    // fit-pose position, and skin / lip-red / hair-dark / other from a colour-class texture
    // real nose tip: the most forward face vertex below the brows (a stylized forehead can stick out further)
    let ntI = -1; for (let i = 0; i < n; i++) { if (region[i] !== HEAD || Math.abs(QP[i * 3] - face.x) > 0.02) continue; const y = QP[i * 3 + 1]; if (y > browY - 0.035 || y < neckY + 0.05) continue; if (ntI < 0 || QP[i * 3 + 2] > QP[ntI * 3 + 2]) ntI = i; }
    const qNose = new Vector3(QP[ntI * 3], QP[ntI * 3 + 1], QP[ntI * 3 + 2]);
    console.log('HEADFIT NOSE ' + JSON.stringify({ qNose, browY, neckY }));
    const sRefL = lum(skinRef[0], skinRef[1], skinRef[2]);
    const skinC2 = chroma(skinRef[0], skinRef[1], skinRef[2]);
    const CL = new Uint8Array(TW * TH * 4), Dd = srcPx.data;
    for (let q = 0; q < TW * TH; q++) {
      const c = [Dd[q * 4], Dd[q * 4 + 1], Dd[q * 4 + 2]], ch = chroma(c[0], c[1], c[2]), l = lum(c[0], c[1], c[2]);
      const skinT = Math.hypot(ch[0] - skinC2[0], ch[1] - skinC2[1]) < 0.05 && l > 0.4 * sRefL && l < 1.7 * sRefL;
      const red = ch[0] > skinC2[0] + 0.02 && l > 70 && l < 1.2 * sRefL;
      const hairy = Math.hypot(c[0] - hairC[0], c[1] - hairC[1], c[2] - hairC[2]) < 80 && l < 0.75 * sRefL;
      const gold = c[0] > 120 && c[1] > 0.62 * c[0] && c[2] < 0.5 * c[1], silver = Math.min(c[0], c[1], c[2]) > 185 && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 14;
      const dark = !red && l < 0.82 * sRefL && ch[0] > skinC2[0] - 0.01; // stubble: warmer-than-grey, darker than skin
      CL[q * 4] = (gold || silver) ? 5 * 40 : red ? 2 * 40 : hairy ? 3 * 40 : dark ? 6 * 40 : skinT ? 1 * 40 : 4 * 40; CL[q * 4 + 1] = !skinT && !(gold || silver) && !red && !hairy && !dark && l > 0.6 * sRefL && Math.hypot(ch[0] - skinC2[0], ch[1] - skinC2[1]) < 0.08 ? 255 : 0; CL[q * 4 + 2] = l > 1.08 * sRefL || l < 0.45 * sRefL ? 255 : 0; CL[q * 4 + 3] = 255;
    }
    const clTex = new DataTexture(CL, TW, TH); clTex.magFilter = clTex.minFilter = NearestFilter; clTex.generateMipmaps = false; clTex.flipY = !!mat.map!.flipY; clTex.colorSpace = NoColorSpace; clTex.needsUpdate = true;
    const addAttrs = (g: BufferGeometry, src: number[] | null) => {
      const cnt = g.getAttribute('position').count, R2 = new Float32Array(cnt), F = new Float32Array(cnt * 3);
      for (let v = 0; v < cnt; v++) { const i = src ? src[v] : v; R2[v] = region[i]; F[v * 3] = src ? 2 * face.x - QP[i * 3] : QP[i * 3]; F[v * 3 + 1] = QP[i * 3 + 1]; F[v * 3 + 2] = QP[i * 3 + 2]; }
      g.setAttribute('aRegion', new BufferAttribute(R2, 1)); g.setAttribute('aFit', new BufferAttribute(F, 3));
    };
    addAttrs(geo0, null); if (mirrorPatch) addAttrs(mirrorPatch.geometry, patchSrc);
    const fusedId = new MeshBasicMaterial({ map: clTex, side: FrontSide });
    const U = { fx: face.x, fz: front.z, nx: qNose.x, ny: qNose.y, nz: qNose.z, by: browY, beard: k.beard ? 1 : 0 };
    fusedId.customProgramCacheKey = () => 'g3d-id-' + JSON.stringify(U);
    fusedId.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRegion; attribute vec3 aFit; flat out float vRegion; out vec3 vFit;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion; vFit = aFit;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nflat in float vRegion; in vec3 vFit;
float zoneOf(vec3 p) {
  float ax = abs(p.x - ${U.fx.toFixed(5)});
  if (p.z < ${(U.nz - 0.1).toFixed(5)} || ax > 0.075) return 0.0;
  if (ax < 0.022 && p.y > ${(U.ny - 0.014).toFixed(5)} && p.y < ${(U.ny + 0.03).toFixed(5)} && p.z > ${(U.nz - 0.035).toFixed(5)}) return 4.0;
  if (p.y > ${(U.by - 0.022).toFixed(5)} && p.y < ${(U.by + 0.004).toFixed(5)}) return 1.0;
  if (p.y > ${(U.ny + 0.012).toFixed(5)} && p.y <= ${(U.by - 0.022).toFixed(5)}) return 2.0;
  if (p.y < ${(U.ny - 0.012).toFixed(5)} && p.y > ${(U.ny - 0.075).toFixed(5)} && ax < 0.042) return 3.0;
  return 0.0;
}`).replace('#include <dithering_fragment>', `#include <dithering_fragment>
{
  vec4 clt = texture2D(map, vMapUv); float cls = floor(clt.r * 255.0 / 40.0 + 0.5); bool lightOther = clt.g > 0.5;
  float r = floor(vRegion + 0.5), id = 3.0; bool sk = cls == 1.0;
  float zz = zoneOf(vFit); bool eyeTone = clt.b > 0.5; // sclera highlights, lash and iris darks
  bool skHead = sk || (lightOther && zz != 2.0 && zz != 1.0) || (cls == 6.0 && ${U.beard}.0 < 0.5) || (cls == 2.0 && zoneOf(vFit) != 3.0); // rosy cheeks, light and shadowed skin
  bool stubble = ${U.beard}.0 > 0.5 && (cls == 6.0 || cls == 3.0) && vFit.y < ${(U.ny - 0.004).toFixed(5)} && abs(vFit.x - ${U.fx.toFixed(5)}) < 0.08 && vFit.z > ${(U.nz - 0.1).toFixed(5)};
  if (cls == 5.0 && (r == ${HAIR}.0 || r == ${TOP}.0 || r == ${HEAD}.0) && vFit.y > ${(neckY - 0.03).toFixed(5)} && abs(vFit.x - ${face.x.toFixed(5)}) > 0.05) id = 3.0; // jewellery
  else if (r == ${HAIR}.0 && (sk || lightOther || (cls == 2.0 && ${U.beard}.0 > 0.5)) && abs(vFit.x - ${U.fx.toFixed(5)}) > 0.055 && vFit.y > ${(U.ny - 0.01).toFixed(5)} && vFit.y < ${(U.by + 0.01).toFixed(5)}) id = 2.0; // ear skin the hair region swept up
  else if (r == ${HAIR}.0) id = (${U.beard}.0 > 0.5 && vFit.y < ${(U.ny - 0.005).toFixed(5)} && vFit.z > ${(U.nz - 0.13).toFixed(5)}) ? 7.0 : 8.0;
  else if (r == ${TOP}.0) id = sk ? 1.0 : 9.0;
  else if (r == ${BOTTOM}.0) id = sk ? 1.0 : 10.0;
  else if (r == ${SHOES}.0) id = 11.0;
  else if (r == ${HANDS}.0) id = 1.0;
  else if (stubble && r == ${HEAD}.0) id = 7.0;
  else {
    float z = zoneOf(vFit);
    if (z == 2.0 && eyeTone) id = 4.0;
    else if (skHead) id = z == 4.0 ? 14.0 : 2.0;
    else if (z == 1.0) id = 5.0;
    else if (z == 2.0) id = 4.0;
    else if (z == 3.0) id = cls == 2.0 ? 6.0 : (${U.beard}.0 > 0.5 ? 7.0 : 3.0);
    else id = (${U.beard}.0 > 0.5 && cls == 3.0) ? 7.0 : 3.0;
  }
  gl_FragColor = vec4(id * 16.0 / 255.0, mod(id * 53.0, 256.0) / 255.0, 0.0, 1.0);
}`);
    };
    const idx = geo0.index!.array;
    const flat = (id: number) => new MeshBasicMaterial({ color: new Color().setRGB((id * 16) / 255, ((id * 53) % 256) / 255, 0, LinearSRGBColorSpace), side: DoubleSide });
    const idMats = new Map<Mesh, MeshBasicMaterial>();
    root.traverse((m: any) => {
      if (!m.isMesh) return;
      if (m === body || m === mirrorPatch) idMats.set(m, fusedId);
      else if (garmentMeshes.includes(m)) { const gid = garmentIds.get(m) ?? 12; idMats.set(m, flat(gid)); }
    });
    // ---- camera, pivots
    const cam = new OrthographicCamera(-W / 2 * UNIT, W / 2 * UNIT, (FEET - qBox.min.y / UNIT) * UNIT, -(H - FEET) * UNIT + qBox.min.y, 0.1, 20);
    cam.top = FEET * UNIT + qBox.min.y; cam.bottom = -(H - FEET) * UNIT + qBox.min.y; cam.updateProjectionMatrix();
    const zoneOf = (a: number, b: number, c: number) => {
      const x = (QP[a * 3] + QP[b * 3] + QP[c * 3]) / 3, y = (QP[a * 3 + 1] + QP[b * 3 + 1] + QP[c * 3 + 1]) / 3, z = (QP[a * 3 + 2] + QP[b * 3 + 2] + QP[c * 3 + 2]) / 3;
      const ax = Math.abs(x - face.x);
      if (z < qNose.z - 0.1 || ax > 0.075) return 0;
      if (ax < 0.022 && y > qNose.y - 0.014 && y < qNose.y + 0.03 && z > qNose.z - 0.035) return 4;
      if (y > browY - 0.022 && y < browY + 0.004) return 1;
      if (y > qNose.y + 0.012 && y <= browY - 0.022) return 2;
      if (y < qNose.y - 0.012 && y > qNose.y - 0.075 && ax < 0.042) return 3;
      return 0;
    };
    const eyeV: number[][] = [[], []], lipV: number[] = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t]; if (region[a] !== HEAD || skin[a]) continue;
      const z = zoneOf(a, idx[t + 1], idx[t + 2]);
      if (z === 2) eyeV[QP[a * 3] > face.x ? 1 : 0].push(a);
      if (z === 3) { const c = texAt(a), ch = chroma(c[0], c[1], c[2]); if (ch[0] > skinC2[0] + 0.02) lipV.push(a); }
    }
    const cen = (vs: number[], fb: Vector3) => { if (!vs.length) return fb; const v = new Vector3(); for (const i of vs) v.add(new Vector3(QP[i * 3], QP[i * 3 + 1], QP[i * 3 + 2])); return v.divideScalar(vs.length); };
    const eyeL = cen(eyeV[0], new Vector3(face.x - 0.03, browY - 0.035, qNose.z - 0.02)), eyeR = cen(eyeV[1], new Vector3(face.x + 0.03, browY - 0.035, qNose.z - 0.02));
    const mouth = cen(lipV, new Vector3(face.x, qNose.y - 0.04, qNose.z - 0.01));
    const P3 = { neck: worldPos(qb('neck')), head: worldPos(qb('Head')).add(new Vector3(0, 0.08, 0)), eyes: [eyeL, eyeR], nose: new Vector3(qNose.x, qNose.y, qNose.z), mouth };
    const out: any = { angles: {} };
    const W2 = W * 2 * k.ss, H2 = H * 2 * k.ss;
    renderer.setSize(W2, H2, false);
    const bg = scene.background; scene.background = null; renderer.setClearColor(0x000000, 0);
    // headwear casts no shadow in the kit: the face is shared with the uncovered looks and must be lit the same
    for (const [m, gid] of garmentIds) if (gid === 13) m.castShadow = false;
    for (const yaw of k.yaws) {
      const yr = (yaw * Math.PI) / 180;
      cam.position.set(Math.sin(yr) * 5, 0, Math.cos(yr) * 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
      const proj = (v: Vector3) => { const q = v.clone().project(cam); return [Math.round(((q.x + 1) / 2) * W * 2 * 10) / 10, Math.round(((1 - q.y) / 2) * H * 2 * 10) / 10]; };
      const piv = { neck: proj(P3.neck), head: proj(P3.head), eyes: P3.eyes.map(proj), nose: proj(P3.nose), mouth: proj(P3.mouth) };
      renderer.toneMapping = ACESFilmicToneMapping; renderer.outputColorSpace = SRGBColorSpace;
      renderer.render(scene, cam);
      const color = renderer.domElement.toDataURL('image/png');
      // id pass: unlit, no tone mapping, no colour conversion
      const saved = new Map<Mesh, any>();
      for (const [m, idm] of idMats) { saved.set(m, m.material); m.material = idm; }
      root.traverse((m: any) => { if (m.isMesh && !idMats.has(m)) { saved.set(m, m.material); m.visible = false; } });
      const env = scene.environment; scene.environment = null;
      renderer.toneMapping = NoToneMapping; renderer.outputColorSpace = LinearSRGBColorSpace; renderer.shadowMap.enabled = false;
      renderer.render(scene, cam);
      const ids = renderer.domElement.toDataURL('image/png');
      for (const [m, mm] of saved) { if (idMats.has(m)) m.material = mm; else m.visible = true; }
      scene.environment = env; renderer.toneMapping = ACESFilmicToneMapping; renderer.outputColorSpace = SRGBColorSpace; renderer.shadowMap.enabled = true;
      out.angles[yaw] = { color, ids, pivots: piv };
    }
    scene.background = bg;
    return JSON.stringify(out);
  }
};
(window as any).qReady = true;
