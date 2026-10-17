# HumanForge

An open-source 3D avatar SDK for React and React Native, built as an open alternative to hosted
avatar builders such as MetaPerson Creator. It has two modes:

| | **Realistic human** (`humanforge/human`) | **Stylized low-poly** (`humanforge/core`) |
| --- | --- | --- |
| Look | Photoreal skin, eyes, hair cards, clothes | Flat-colored, procedural |
| Base | MakeHuman / MPFB2 human (CC0), 26.7k-triangle body | three.js primitives, 7–11k triangles |
| Customization | 11 macro + 57 detail morph sliders, 20 skins, 9 eye colors, 12 brows, 4 lashes, 10 hairstyles, 18 outfits and shoes | 30+ options |
| Rig | 52-bone **Mixamo** skeleton with skin weights (clothes and hair follow) | none |
| Face animation | 34 FACS blendshapes with **ARKit names** (`jawOpen`, `mouthSmile`, `eyeBlinkLeft`, …) | none |
| Download | ~1.4 MB one-time core + ~0.3–0.8 MB per look (gzipped, cached on device) | 0 (code only) |
| Export | Compressed GLB (~3 MB with textures, sparse blendshapes) | GLB ~160 KB |

## Realistic human

### 1. Build the asset package (once)

The human is built from CC0 data: the MakeHuman base mesh, targets, skins, hair and clothes, plus
MPFB2's Mixamo rig and expression units.

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/makehumancommunity/mpfb2.git
cd mpfb2 && git sparse-checkout set src/mpfb/data && cd ..
curl -LO https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
unzip makehuman_system_assets_cc0.zip -d mh_assets
npm run build:human -- mpfb2/src/mpfb/data mh_assets      # -> assets/human (~14 MB, all options)
```

Host `assets/human/` on any static host or CDN (S3, Cloudflare R2, GitHub Pages…). No server
compression is needed: binaries are pre-gzipped and decoded in JS by `fflate`.

### 2. React Native (Expo)

```bash
npx expo install expo-gl expo-file-system three fflate
```

```tsx
import { HumanView, useHumanPackage } from 'humanforge';

const { pkg } = useHumanPackage('https://cdn.example.com/human');
if (!pkg) return <Loading />;

<HumanView
  pkg={pkg}
  framing="face"                     // or "body"
  textureSize="1k"                   // "2k" for the editor screen
  config={{ gender: 0.1, age: 0.2, african: 1, asian: 0, caucasian: 0,
            skin: 'young_african_female', hair: 'afro01', hairColor: '#1a120c',
            detail: { noseWidth: 0.3, eyeSize: 0.2 },
            clothes: ['female_casualsuit01', 'shoes01'] }}
  expressions={{ mouthSmile: 0.6 }}
  style={{ width: 240, height: 240, borderRadius: 120 }}
/>
```

Files are cached in the app's cache directory, so later launches work offline. A ref gives you
`avatar` (bones, `setExpression`), `render()` and `snapshot()` (PNG file URI).

### 3. React / web

```ts
import { HumanAvatar, loadHumanPackage } from 'humanforge/human';
import { exportHumanGLB } from 'humanforge/human/export';   // optional, web only

const pkg = await loadHumanPackage('/human');
const avatar = new HumanAvatar(pkg);
scene.add(avatar.group);
await avatar.setConfig({ gender: 0.9, muscle: 0.7, hair: 'short02', eyes: 'green' });
avatar.setExpression('jawOpen', 0.4);
avatar.bones.find((b) => b.name.endsWith('LeftArm'))!.rotateZ(-0.8);
const glb = await exportHumanGLB(avatar);   // Mixamo-rigged, ARKit blendshapes
```

`demo/human.html` is a complete web editor (`npm run demo`, then open `/human.html`).

### 4. Selfie to avatar

`fitSelfie` turns a front-facing photo into a `HumanConfig` patch. It sets the ethnicity mix, about
45 face detail sliders, the skin texture and `skinTint`, and the eye color. It runs on-device and
has two parts:

1. **Landmarks:** [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
   (Apache-2.0) gives 478 3D landmarks, including the irises.
2. **Fit** (`humanforge/human`, plain TypeScript, no WASM): each landmark is tied to a MakeHuman
   vertex. The fit removes pose and scale (similarity Procrustes), then solves a box-constrained
   ridge least-squares problem over the detail morphs. Macros are linearized with finite
   differences. Expression morphs are fitted too and then thrown away, so a smile doesn't turn
   into a wide mouth. Skin is matched from cheek and forehead pixels, and eye color from iris
   pixels. The web helper detects the face, then re-detects on a full-resolution face crop, so the
   irises and eye whites get enough pixels. Detection plus fit takes about 1 s in Chrome on a
   1920px photo.

**Web**

```bash
npm i @mediapipe/tasks-vision
```

```ts
import { createSelfieFitter } from 'humanforge/human/selfie';

const fitter = await createSelfieFitter();             // loads the WASM + model from public CDNs
const { config, error } = await fitter.fit(pkg, file, { hints: { gender: 1 } });
await avatar.setConfig(config);
```

`demo/human.html` has a **📷 From selfie** button. You can also open
`/human.html?gender=0&selfie=<image url>`. Self-host the WASM and model by passing
`createSelfieFitter({ wasmPath, modelPath })`.

**React Native.** There's no WASM on Hermes, so the landmark model has to run some other way. The
fit itself is plain JS and runs unchanged. Pick one of these:

- **On device:** run MediaPipe's `face_landmarker.task` (a zip of TFLite models; use the
  detector and the landmark model with attention/iris refinement) through
  [`react-native-fast-tflite`](https://github.com/mrousavy/react-native-fast-tflite). Decode the
  outputs to 478 normalized landmarks, then call
  `fitSelfie(pkg, landmarks, { width, height }, { width, height, data: rgba })`. You can get RGBA
  pixels with `expo-image-manipulator` or a Skia snapshot. Without pixels, the fit still sets the
  shape but not the colors.
- **Native SDKs:** MediaPipe Tasks for iOS and Android expose the same Face Landmarker. Wrap it in a
  small Expo module and pass the landmarks to `fitSelfie`.
- **Server-side:** upload the photo, run MediaPipe (Python or Node + tasks-vision) next to
  `fitSelfie` on the server, and return the `HumanConfig` JSON. The app stays light, but the photo
  leaves the device.

**Limits.** Landmarks capture face proportions well. They don't capture fine features (lip shape
detail, nose profile, wrinkles), so expect "the same kind of face", not a likeness. Gender isn't
estimated by default: in tests on real portraits the landmarks got it right only about half the
time. Ask the user and pass `hints: { gender }`, or opt in with
`macros: ['gender', ...DEFAULT_FIT_MACROS]`. Age isn't estimated either, so pass `hints: { age }`
if you know it. Skin choice depends on the photo's lighting: dark or flash-lit photos can land on a
neighbouring tone. The result is a starting point that users can adjust with the sliders. Hair,
hair color and beards aren't fitted yet.

**Rebuilding the landmark map.** `src/human/faceMap.ts` is generated from MediaPipe's canonical face
mesh (Apache-2.0) and the MakeHuman base mesh:

```bash
curl -LO https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
npm run build:facemap -- canonical_face_model.obj --refine
# optional: open /calibrate.html in the demo, save its JSON as mean.json, then
npm run build:facemap -- canonical_face_model.obj --refine --calibration mean.json
```

The calibration averages MediaPipe's output over the public-domain NASA portraits listed in
`tools/calibration-portraits.json`. The images are fetched at calibration time and aren't stored
in the repo. This average replaces the canonical face as the fitting reference, because the
canonical face isn't the average of MediaPipe's predictions on real faces. Without it, every
avatar picks up the same bias, such as a wider mouth.

### Config

`HumanConfig` is plain JSON (store it as-is):

- **Macro (0..1):** `gender`, `age` (18–90), `muscle`, `weight`, `height`, `proportions`, `cupSize`,
  `firmness`, and an ethnicity mix `african` / `asian` / `caucasian`.
- **Detail:** `detail: { [id]: -1..1 }`, with the ids listed in `DETAIL_SLIDERS` (head shape, jaw,
  chin, cheeks, eyes, brows, nose ×9, mouth ×8, ears, neck, shoulders, chest, waist, hips…).
- **Style:** `skin`, `skinTint`, `eyes`, `eyebrows`, `eyebrowColor`, `eyelashes`, `hair`,
  `hairColor`, and `clothes: string[]`. The available ids are listed in `pkg.manifest`.

### How it works

- **Shape:** the MakeHuman macro model (gender × age × muscle × weight × height × proportions ×
  breast × ethnicity) is baked into 32 gender-split basis morphs. Together with the detail targets,
  it is evaluated on the CPU only when the config changes (a few ms). Expressions stay on the GPU
  as morph targets, so animation is cheap.
- **Fitting:** hair, clothes, eyes, brows and teeth use MakeHuman's proxy fitting (barycentric refs
  + scaled offsets), so they follow every slider. Clothes hide the body faces underneath them, so
  nothing pokes through.
- **Rig:** bone heads and tails are re-derived from MakeHuman's joint helpers after each reshape,
  so the skeleton always matches the body. Mixamo animations retarget directly.
- **Size:** shape data is delta-coded and byte-planed before gzip, with 8-bit values where the
  error stays ≤ 0.4 mm. Geometry uses `KHR_mesh_quantization` (no decoder needed), and textures
  are WebP. There's no WASM, so it works on Hermes.

## Stylized low-poly mode

This mode has zero asset files: every part is generated from three.js primitives. An avatar
serializes to a ~60-character code.

```tsx
import { AvatarCreator, AvatarView, decodeAvatar } from 'humanforge';

<AvatarCreator onSave={(config, code, view) => api.saveAvatar(code)} />
<AvatarView config={decodeAvatar(code)} framing="bust" style={{ width: 96, height: 96 }} />
```

The core works without React (`buildAvatar`, `avatarToGLB` from `humanforge/core`). The editor
UI is generated from `EDITOR_SCHEMA`. When adding config fields, only append new ones so stored
codes stay valid.

## Dev

```bash
npm install
npm run build:human -- <mpfb data> <system assets>   # see above
npm test          # both modes: every option builds, codec round-trips, human package decodes, selfie solver
npm run typecheck
npm run demo      # http://localhost:5173 (stylized) and /human.html (realistic)
```

## Status and limits

- **Verified:** the asset build, the decoder and smoke tests, and the web runtime (shape sliders,
  skins, hair, clothes, rig posing, expressions, GLB export), visually in Chrome.
- **Not yet run on a device:** the React Native components (`HumanView`, `AvatarView`,
  `AvatarCreator`). They typecheck against RN 0.81, expo-gl 16 and expo-file-system 19, and use
  the standard expo-gl texture path (`{ localUri }`). Test on one iOS and one Android device before
  shipping.
- **Selfie fit:** verified in Chrome with public-domain portraits (web path). The React Native
  landmark path is documented but not implemented. See "Selfie to avatar" for its limits.
- **Wardrobe:** hairstyles and clothes are limited to the CC0 MakeHuman system packs. More CC0
  packs, or your own `.mhclo` assets, can be added through `tools/build-human.ts`. There's no hijab
  or kufi in the realistic set yet.
- **Hair quality:** hair uses alpha-tested cards, so the edges are crisper with MSAA (`antialias: true`).

## Licenses

- Code: MIT.
- Human assets (base mesh, targets, skins, hair, clothes, rig, weights, expression units): CC0 1.0,
  from the [MakeHuman](http://www.makehumancommunity.org) project and
  [MPFB2](https://github.com/makehumancommunity/mpfb2). Credit is appreciated but not required.
- Selfie fitting: MediaPipe Face Landmarker and its canonical face mesh are Apache-2.0 (Google).
  `src/human/faceMap.ts` contains vertex indices and averaged landmark positions derived from them.
  The model and WASM are downloaded at runtime and aren't bundled.
- No code, meshes or textures from Avatar SDK / MetaPerson or any other proprietary product.
