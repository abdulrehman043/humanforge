// Web helper: selfie image -> HumanConfig, using MediaPipe Face Landmarker (Apache-2.0) in the
// browser and the platform-neutral solver in ./fit. Web only (MediaPipe tasks-vision uses WASM);
// on React Native, run a landmark model yourself and call fitSelfie() from ./fit directly.
//
//   npm i @mediapipe/tasks-vision
//   const fitter = await createSelfieFitter();
//   const { config } = await fitter.fit(pkg, imgElement);
//   await avatar.setConfig(config);
import type { HumanPackage } from './runtime';
import { FitSelfieOptions, Landmark, SelfieFit, fitSelfie } from './fit';

export interface SelfieFitterOptions {
  /** Folder with MediaPipe's vision_wasm_* files. Default: jsDelivr for the installed version. */
  wasmPath?: string;
  /** face_landmarker.task model. Default: Google's hosted float16 model. */
  modelPath?: string;
  delegate?: 'GPU' | 'CPU';
  /** Longest side of the images analyzed (the whole photo, then a crop around the face). Default 1024. */
  maxSize?: number;
}

export interface SelfieFitterResult extends SelfieFit {
  landmarks: Landmark[];
  /** The face crop that was analyzed (landmarks are normalized to it), handy for previews. */
  canvas: HTMLCanvasElement;
}

export const DEFAULT_FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
export const DEFAULT_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';

export async function createSelfieFitter(opts: SelfieFitterOptions = {}) {
  const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(opts.wasmPath ?? DEFAULT_WASM_PATH);
  const create = (delegate: 'GPU' | 'CPU') => FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: opts.modelPath ?? DEFAULT_FACE_MODEL, delegate },
    runningMode: 'IMAGE', numFaces: 1, minFaceDetectionConfidence: 0.5,
  });
  const landmarker = await create(opts.delegate ?? 'GPU').catch(() => create('CPU'));
  const maxSize = opts.maxSize ?? 1024;
  const draw = (img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d', { willReadFrequently: true })!.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return c;
  };

  return {
    /** Detect the face in `image` and fit a config. Throws if no face is found. */
    async fit(pkg: HumanPackage, image: CanvasImageSource & { width: number; height: number } | Blob, fitOpts: FitSelfieOptions = {}): Promise<SelfieFitterResult> {
      const src = image instanceof Blob ? await createImageBitmap(image, { imageOrientation: 'from-image' }) : image;
      const w0 = (src as any).naturalWidth || src.width, h0 = (src as any).naturalHeight || src.height;
      // 1. find the face on a downscaled copy
      const k = Math.min(1, maxSize / Math.max(w0, h0));
      let canvas = draw(src, 0, 0, w0, h0, Math.round(w0 * k), Math.round(h0 * k));
      let lms = landmarker.detect(canvas).faceLandmarks[0];
      if (!lms) throw new Error('No face found in the image');
      // 2. re-detect on a face crop at full resolution: sharper landmarks, and the iris/sclera
      //    get enough pixels for color sampling even in waist-up portraits
      const xs = lms.map((p) => p.x * w0), ys = lms.map((p) => p.y * h0);
      const fx = Math.min(...xs), fy = Math.min(...ys), fw = Math.max(...xs) - fx, fh = Math.max(...ys) - fy;
      const side = Math.max(fw, fh) * 1.8;
      const cx = Math.max(0, fx + fw / 2 - side / 2), cy = Math.max(0, fy + fh / 2 - side / 2);
      const cw = Math.min(w0 - cx, side), chh = Math.min(h0 - cy, side);
      if (side * 1.2 < Math.max(w0, h0)) {
        const kc = Math.min(1, maxSize / Math.max(cw, chh));
        const crop = draw(src, cx, cy, cw, chh, Math.round(cw * kc), Math.round(chh * kc));
        const again = landmarker.detect(crop).faceLandmarks[0];
        if (again) { canvas = crop; lms = again; }
      }
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      const fit = fitSelfie(pkg, lms, { width: canvas.width, height: canvas.height }, pixels, fitOpts);
      return { ...fit, landmarks: lms, canvas };
    },
    close() { landmarker.close(); },
  };
}
