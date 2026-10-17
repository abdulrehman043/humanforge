// Calibration for the selfie fit: the mean MediaPipe landmark layout over many real portraits.
// MediaPipe's canonical face is not the mean of its own predictions on real people, so fitting
// against it biases every avatar the same way (e.g. wider mouths). See tools/build-facemap.mts.
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { DEFAULT_FACE_MODEL, DEFAULT_WASM_PATH } from '../src/human/selfie';
import { landmarksToPoints, similarityAlign } from '../src/human/fit';
import { FACE_MAP } from '../src/human/faceMap';
import list from '../tools/calibration-portraits.json';

const status = document.getElementById('status')!;
const out = document.getElementById('out')!;
const lm = await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(DEFAULT_WASM_PATH), {
  baseOptions: { modelAssetPath: DEFAULT_FACE_MODEL, delegate: 'GPU' }, runningMode: 'IMAGE', numFaces: 1,
});
const ref = Float64Array.from(FACE_MAP.reference);
const w = Float64Array.from(FACE_MAP.weight);
const faces: { title: string; p: Float64Array; rms: number }[] = [];
const limit = Number(new URLSearchParams(location.search).get('limit') || 1e9);
let i = 0;
for (const { title, url } of list.portraits.slice(0, limit)) {
  status.textContent = `${++i}/${Math.min(limit, list.portraits.length)} ${title}`;
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const res = lm.detect(bmp);
    const l = res.faceLandmarks[0];
    if (!l || res.faceLandmarks.length !== 1) continue;
    const faceW = Math.abs(l[454].x - l[234].x) * bmp.width;
    if (faceW < 120) continue; // too small to be precise
    const pts = landmarksToPoints(l, bmp.width, bmp.height);
    const T = similarityAlign(pts, ref, w);
    // frontal faces only: the rotation must be close to identity
    if (T.R[0] < 0.95 || T.R[4] < 0.95 || T.R[8] < 0.95) continue;
    const p = T.apply(pts);
    let e = 0; for (let k = 0; k < p.length; k++) e += (p[k] - ref[k]) ** 2;
    faces.push({ title, p, rms: Math.sqrt(e / p.length) });
  } catch { /* skip unreadable images */ }
}
// drop the 10% least typical faces (odd expressions, bad detections), then average
faces.sort((a, b) => a.rms - b.rms);
const kept = faces.slice(0, Math.max(1, Math.floor(faces.length * 0.9)));
const mean = new Float64Array(ref.length);
for (const f of kept) for (let k = 0; k < mean.length; k++) mean[k] += f.p[k] / kept.length;
const result = { count: kept.length, faces: kept.map((f) => f.title), mean: Array.from(mean, (v) => Math.round(v * 1e6) / 1e6) };
status.textContent = `Done: ${kept.length} faces averaged (${faces.length} usable of ${i}).`;
out.textContent = JSON.stringify(result);
(window as any).__calibration = result;
