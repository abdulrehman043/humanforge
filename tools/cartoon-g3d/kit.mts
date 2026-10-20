// Renders the Grab3d CC0 characters (with our modest wear) into a layered 2D art kit for import-cartoon-art:
//   npm run g3d:fetch                     -> .local/g3d/{woman,man}-rigged.glb (CC0, grab3d.com)
//   npx tsx tools/cartoon-g3d/kit.mts render [look...]  -> .local/g3d-raw/<look>/<angle>.{color,ids}.png + pivots (headless Chrome)
//   npx tsx tools/cartoon-g3d/kit.mts compose           -> .local/kit-g3d/  (then: npm run import:cartoon -- .local/kit-g3d --out assets/cartoon-g3d)
// Needs Google Chrome (CHROME env to override its path).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const R = path.dirname(new URL(import.meta.url).pathname).replace(/%20/g, ' ');
const OA = path.resolve(R, '../..'), LOCAL = path.join(OA, '.local');
const RAW = path.join(LOCAL, 'g3d-raw'), KIT = path.join(LOCAL, 'kit-g3d');
const SS = 3, W = 800, H = 1280;
const ANGLES: Record<string, number> = { front: 0, three: 45, side: 90 };
const Wf = { gender: 0, age: 0.15, muscle: 0.6, weight: 0.45 }, Wm = { gender: 1, age: 0.2, muscle: 0.8, weight: 0.5 };
const LOOKS: Record<string, any> = {
  f_casual: { char: 'woman', longHair: true, mirrorFace: true, mh: { ...Wf } },
  f_abaya: { char: 'woman', longHair: true, mirrorFace: true, mh: { ...Wf, clothes: ['abaya01'] }, colors: { abaya01: '#1f1f24' } },
  f_hijab: { char: 'woman', longHair: true, mh: { ...Wf, clothes: ['abaya01', 'amira01'] }, colors: { abaya01: '#1f1f24', amira01: '#b9a3c9' } },
  m_casual: { char: 'man', mh: { ...Wm }, beard: true },
  m_jalabiya: { char: 'man', mh: { ...Wm, clothes: ['jalabiya01'] }, colors: { jalabiya01: '#f1efe8' }, beard: true },
};

// ids from g3d.ts exportKit
const BODY = 1, HEAD = 2, HEADX = 3, EYES = 4, BROWS = 5, LIPS = 6, BEARD = 7, HAIR = 8, TOP = 9, BOTTOM = 10, SHOES = 11, OUTFIT = 12, HEADWEAR = 13, NOSE = 14;
const HEADF = [HEAD, HEADX, EYES, BROWS, LIPS, BEARD, NOSE];

if (process.argv[2] === 'render') {
  const { default: puppeteer } = await import('puppeteer-core');
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: false, root: R, publicDir: path.join(OA, 'assets'), resolve: { alias: { three: path.join(OA, 'node_modules/three') } }, server: { port: 5197, fs: { strict: false } }, logLevel: 'error' });
  await server.listen();
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 0, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => m.text().startsWith('HEADFIT JEWEL') && console.log(m.text()));
  await page.evaluateOnNewDocument((r) => { (window as any).G3D = r; }, path.join(LOCAL, 'g3d'));
  await page.goto(server.resolvedUrls!.local[0] + 'index.html', { timeout: 120000 });
  await page.waitForFunction('window.qReady === true', { timeout: 300000 });
  const only = process.argv.slice(3);
  for (const [name, L] of Object.entries(LOOKS)) {
    if (only.length && !only.includes(name)) continue;
    const t0 = Date.now();
    const { beard, ...look } = L;
    const json: string = await page.evaluate((o) => (window as any).renderG3d(o), { ...look, yaw: 0, shot: 'full', size: 64, armSpread: 0.28, kit: { yaws: Object.values(ANGLES), ss: SS, beard: !!beard } });
    const res = JSON.parse(json);
    const dir = path.join(RAW, name); mkdirSync(dir, { recursive: true });
    const piv: any = {};
    for (const [src, yaw] of Object.entries(ANGLES)) {
      const a = res.angles[yaw];
      writeFileSync(path.join(dir, `${src}.color.png`), Buffer.from(a.color.split(',')[1], 'base64'));
      writeFileSync(path.join(dir, `${src}.ids.png`), Buffer.from(a.ids.split(',')[1], 'base64'));
      piv[src] = a.pivots;
    }
    writeFileSync(path.join(dir, 'pivots.json'), JSON.stringify(piv, null, 1));
    console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  await browser.close(); await server.close();
  process.exit(0);
}

// ---------------------------------------------------------------- compose
type Pass = { id: Uint8Array; rgba: Uint8Array };
const SW = W * SS, SH = H * SS;
async function loadPass(look: string, src: string): Promise<Pass> {
  const c = await sharp(path.join(RAW, look, `${src}.color.png`)).ensureAlpha().raw().toBuffer();
  const d = await sharp(path.join(RAW, look, `${src}.ids.png`)).ensureAlpha().raw().toBuffer();
  const id = new Uint8Array(SW * SH);
  const bad: number[] = [];
  for (let p = 0; p < SW * SH; p++) {
    if (d[p * 4 + 3] < 8) continue;
    const r = d[p * 4], g = d[p * 4 + 1];
    const k = Math.round(r / 16);
    if (k >= 1 && k <= 14 && Math.abs(r - k * 16) <= 3 && Math.abs(g - ((k * 53) % 256)) <= 3) id[p] = k; else bad.push(p);
  }
  // blended edge samples (MSAA between two meshes) take the most common valid neighbour
  for (let pass = 0; pass < 3 && bad.length; pass++) {
    const left: number[] = [];
    for (const p of bad) {
      const x = p % SW, y = (p / SW) | 0, cnt = new Map<number, number>();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = (y + dy) * SW + x + dx; if (q >= 0 && q < id.length && id[q]) cnt.set(id[q], (cnt.get(id[q]) ?? 0) + 1); }
      let best = 0, bc = 0; for (const [k, v] of cnt) if (v > bc) { bc = v; best = k; }
      if (best) id[p] = best; else left.push(p);
    }
    bad.splice(0, bad.length, ...left);
  }
  return { id, rgba: new Uint8Array(c) };
}

/** Merge looks for a family of ids: each sample comes from the first look whose id there is in the family. */
function merge(passes: Pass[], fam: number[]): Pass {
  const id = new Uint8Array(SW * SH), rgba = new Uint8Array(SW * SH * 4);
  for (let p = 0; p < SW * SH; p++) for (const P of passes) {
    if (fam.includes(P.id[p])) { id[p] = P.id[p]; rgba.set(P.rgba.subarray(p * 4, p * 4 + 4), p * 4); break; }
  }
  return { id, rgba };
}

/** Downsampled coverage + colour of the given ids (art pixels, unpremultiplied). */
function layer(P: Pass, ids: number[]) {
  const a = new Float32Array(W * H), col = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, r = 0, g = 0, b = 0;
    for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
      const p = (y * SS + dy) * SW + x * SS + dx;
      if (!ids.includes(P.id[p])) continue;
      const al = P.rgba[p * 4 + 3] / 255; s += al; r += P.rgba[p * 4] * al; g += P.rgba[p * 4 + 1] * al; b += P.rgba[p * 4 + 2] * al;
    }
    const o = y * W + x; a[o] = s / (SS * SS);
    if (s > 0) { col[o * 3] = r / s; col[o * 3 + 1] = g / s; col[o * 3 + 2] = b / s; }
  }
  return { a, col };
}
const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;
const chroma = (r: number, g: number, b: number) => { const t = r + g + b + 1; return [r / t, g / t]; };
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const hex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** Drops islands smaller than `min` pixels (stray strands floating on the skin). */
function despeckle(L: { a: Float32Array }, min: number, fromRow = 0) {
  const seen = new Uint8Array(W * H), st: number[] = [];
  for (let s0 = 0; s0 < W * H; s0++) {
    if (seen[s0] || L.a[s0] < 0.25) continue;
    const comp: number[] = []; st.push(s0); seen[s0] = 1;
    while (st.length) { const i = st.pop()!; comp.push(i); const x = i % W, y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && !seen[j] && L.a[j] >= 0.25) { seen[j] = 1; st.push(j); } }
    if (comp.length < min && comp.every((i) => i / W >= fromRow)) for (const i of comp) L.a[i] = 0;
  }
  for (let i = fromRow * W; i < W * H; i++) if (L.a[i] < 0.25 && L.a[i] > 0) { const x = i % W, y = (i / W) | 0; let near = false; for (let d = -2; d <= 2 && !near; d++) for (let e = -2; e <= 2; e++) { const j = (y + d) * W + x + e; if (j >= 0 && j < W * H && L.a[j] >= 0.25) { near = true; break; } } if (!near) L.a[i] = 0; }
  return L;
}
async function png(file: string, data: Uint8Array) {
  mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(file);
}

let lastRef = 0;
/** Writes <key>.0.tint / .0.detail (shading) / .1.detail (fixed colours) and returns the median tint colour. */
async function writePart(src: string, key: string, L: { a: Float32Array; col: Float32Array }, mode: 'tint' | 'fixed' | 'dominant', opts: { silhouette?: Float32Array; shadeMask?: Float32Array; hiCap?: number; lref?: number; pct?: number; blush?: boolean; darkOver?: number; smooth?: number } = {}) {
  const n = W * H, wt = new Float32Array(n);
  // tintable weight per pixel
  let dom: number[] | null = null;
  if (mode === 'dominant') {
    const cs: number[][] = [];
    for (let i = 0; i < n; i += 3) if (L.a[i] > 0.5) { const c = [L.col[i * 3], L.col[i * 3 + 1], L.col[i * 3 + 2]]; const mx = Math.max(...c), mn = Math.min(...c); if (mx && (mx - mn) / mx > 0.2) cs.push(chroma(c[0], c[1], c[2])); }
    if (cs.length > 50) { const r = cs.map((c) => c[0]).sort((p, q) => p - q), g = cs.map((c) => c[1]).sort((p, q) => p - q); dom = [r[r.length >> 1], g[g.length >> 1]]; }
  }
  for (let i = 0; i < n; i++) {
    if (!L.a[i]) continue;
    if (mode === 'tint') wt[i] = 1;
    else if (mode === 'dominant' && dom) {
      const r = L.col[i * 3], g = L.col[i * 3 + 1], bb = L.col[i * 3 + 2], c = chroma(r, g, bb), mx = Math.max(r, g, bb), mn = Math.min(r, g, bb), sat = mx ? (mx - mn) / mx : 0;
      const neutralBright = sat < 0.18 && lum(r, g, bb) > 150; // a white tee, a cream lining
      const l = lum(r, g, bb);
      wt[i] = neutralBright ? 0 : l < 70 ? 1 : 1 - smooth(0.14, 0.22, Math.hypot(c[0] - dom[0], c[1] - dom[1])); // deep shadows: hue is unreliable, keep them in the fabric
    }
    else if (mode === 'dominant') wt[i] = 1;
  }
  // reference: median luminance and colour of the tintable pixels
  const ls: number[] = [], cs: number[][] = [];
  for (let i = 0; i < n; i++) if (L.a[i] > 0.6 && wt[i] > 0.8 && (!opts.shadeMask || opts.shadeMask[i] > 0.5)) { ls.push(lum(L.col[i * 3], L.col[i * 3 + 1], L.col[i * 3 + 2])); cs.push([L.col[i * 3], L.col[i * 3 + 1], L.col[i * 3 + 2]]); }
  let median: number[] | null = null;
  const files: string[] = [];
  if (ls.length) {
    // reference near the bright end: shading is then (almost) only darkening, which keeps the hue of any tint
    const order = ls.map((l, i) => [l, i]).sort((p, q) => p[0] - q[0]);
    const at = order[Math.floor(order.length * (opts.pct ?? 0.85))];
    const Lref = opts.lref ?? at[0];
    { // default colour: mean of the pixels in a band round the reference brightness (one pixel can be a grey highlight)
      const p0 = opts.pct ?? 0.85, lo = Math.floor(order.length * (p0 - 0.06)), hi = Math.min(order.length, Math.ceil(order.length * (p0 + 0.06)));
      const m3 = [0, 0, 0]; for (let j = lo; j < hi; j++) { const c = cs[order[j][1]]; m3[0] += c[0]; m3[1] += c[1]; m3[2] += c[2]; }
      median = m3.map((v) => v / Math.max(1, hi - lo));
    }
    lastRef = Lref;
    const tint = new Uint8Array(n * 4), shade = new Uint8Array(n * 4);
    // skin: the painted texture is noisy; a mask-weighted blur keeps the form shading and drops the blotches
    let Ssm: Float32Array | null = null;
    if (opts.smooth) {
      const R = opts.smooth, A = new Float32Array(n), B = new Float32Array(n);
      for (let i = 0; i < n; i++) { const w = L.a[i] * wt[i] * (opts.shadeMask ? opts.shadeMask[i] : 1); A[i] = w * lum(L.col[i * 3], L.col[i * 3 + 1], L.col[i * 3 + 2]); B[i] = w; }
      const blur = (X: Float32Array) => { const T = new Float32Array(n);
        for (let y = 0; y < H; y++) { let acc = 0; for (let x = -R; x < W; x++) { if (x + R < W) acc += X[y * W + x + R]; if (x - R - 1 >= 0) acc -= X[y * W + x - R - 1]; if (x >= 0) T[y * W + x] = acc; } }
        for (let x = 0; x < W; x++) { let acc = 0; for (let y = -R; y < H; y++) { if (y + R < H) acc += T[(y + R) * W + x]; if (y - R - 1 >= 0) acc -= T[(y - R - 1) * W + x]; if (y >= 0) X[y * W + x] = acc; } } };
      blur(A); blur(B); blur(A); blur(B);
      Ssm = new Float32Array(n); for (let i = 0; i < n; i++) Ssm[i] = B[i] > 1e-6 ? A[i] / B[i] : 0;
    }
    const sil = opts.silhouette ?? L.a;
    // painted features (brows, stubble) fade into the skin: their opacity follows how much darker than the skin they are
    if (opts.darkOver) { const lo = order[Math.floor(order.length * 0.2)][0]; for (let i = 0; i < n; i++) if (L.a[i]) wt[i] *= smooth(0, 0.55, (opts.darkOver - lum(L.col[i * 3], L.col[i * 3 + 1], L.col[i * 3 + 2])) / Math.max(1, opts.darkOver - lo)); }
    for (let i = 0; i < n; i++) {
      const at = opts.silhouette ? sil[i] : L.a[i] * wt[i];
      if (at > 0.004) { tint[i * 4] = tint[i * 4 + 1] = tint[i * 4 + 2] = 255; tint[i * 4 + 3] = Math.round(Math.min(1, at) * 255); }
      const as = L.a[i] * wt[i] * (opts.shadeMask ? opts.shadeMask[i] : 1);
      if (as <= 0.004) continue;
      const S = (Ssm ? Ssm[i] : lum(L.col[i * 3], L.col[i * 3 + 1], L.col[i * 3 + 2])) / Math.max(1, Lref);
      if (S < 1) shade[i * 4 + 3] = Math.round(Math.min(1, (1 - S) * as) * 255);
      else { shade[i * 4] = shade[i * 4 + 1] = shade[i * 4 + 2] = 255; shade[i * 4 + 3] = Math.round(Math.min(opts.hiCap ?? 0.85, (Lref * (S - 1)) / Math.max(1, 255 - Lref)) * as * 255); }
    }
    await png(path.join(KIT, src, `${key}.0.tint.png`), tint); files.push('tint');
    await png(path.join(KIT, src, `${key}.0.detail.png`), shade);
    if (opts.blush && median) { // where the original is redder than the base colour (cheeks, knuckles, ears): a soft rose overlay
      const blush = new Uint8Array(n * 4); const r0 = chroma(median[0], median[1], median[2])[0]; let any2 = false;
      for (let i = 0; i < n; i++) {
        const as = L.a[i] * wt[i] * (opts.shadeMask ? opts.shadeMask[i] : 1); if (as <= 0.004) continue;
        const dev = chroma(L.col[i * 3], L.col[i * 3 + 1], L.col[i * 3 + 2])[0] - r0; if (dev <= 0.004) continue;
        const Sx = lum(L.col[i * 3], L.col[i * 3 + 1], L.col[i * 3 + 2]) / Math.max(1, lastRef); const near = smooth(0.62, 0.85, Sx); // stubble and shadows stay brown, not rosy
        if (near <= 0) continue;
        blush[i * 4] = 214; blush[i * 4 + 1] = 96; blush[i * 4 + 2] = 92; blush[i * 4 + 3] = Math.round(Math.min(0.32, dev * 7) * near * as * 255); any2 = true;
      }
      if (any2) await png(path.join(KIT, src, `${key}.2.detail.png`), blush);
    }
  }
  // fixed colours: whatever isn't tinted
  const fixed = new Uint8Array(n * 4); let any = false;
  for (let i = 0; i < n; i++) {
    const af = L.a[i] * (1 - wt[i]); if (af <= 0.004) continue;
    fixed[i * 4] = L.col[i * 3]; fixed[i * 4 + 1] = L.col[i * 3 + 1]; fixed[i * 4 + 2] = L.col[i * 3 + 2]; fixed[i * 4 + 3] = Math.round(Math.min(1, af) * 255); any = true;
  }
  if (any) await png(path.join(KIT, src, `${key}.1.detail.png`), fixed);
  return median ? hex(median) : null;
}

rmSync(KIT, { recursive: true, force: true });
const colors: Record<string, string> = {};
const pivots: any = { units: 'px' };
for (const src of Object.keys(ANGLES)) {
  const P: Record<string, Pass> = {};
  for (const look of Object.keys(LOOKS)) P[look] = await loadPass(look, src);
  const piv0 = JSON.parse(readFileSync(path.join(RAW, 'f_casual', 'pivots.json'), 'utf8'))[src];
  const neckRow = piv0.neck[1] * SS, neckX = piv0.neck[0] * SS;
  const mpv = JSON.parse(readFileSync(path.join(RAW, 'm_casual', 'pivots.json'), 'utf8'))[src], mNeckRow = mpv.neck[1] * SS, mNeckX = mpv.neck[0] * SS;
  const build = async (b: 'female' | 'male', p: { head: string[]; body: string[]; hair: string[]; wear: string[]; outfit: string[]; headwear?: string[] }, names: { hair: string; top: string; bottom: string; outfit: string; headwear?: string; sfx: string }) => {
    let fam = merge(p.head.map((l) => P[l]), HEADF);
    let clipped: Pass | null = null;
    if (p.headwear) { // pixels from the uncovered looks may not stick out past the hijab (ears, stray hair)
      const C = P[p.headwear[0]];
      const keep = (q: number) => HEADF.includes(C.id[q]) || C.id[q] === HEADWEAR;
      // allow a little slack round the face and below the chin (neck), where the hood isn't
      clipped = { id: new Uint8Array(SW * SH), rgba: fam.rgba };
      for (let q = 0; q < SW * SH; q++) if (fam.id[q] && !keep(q) && (q / SW) < neckRow) { clipped.id[q] = fam.id[q]; fam.id[q] = 0; }
    }
    const all = layer(fam, HEADF), skinL = layer(fam, [HEAD]), headx = layer(fam, [HEADX]);
    // head: one skin silhouette under every face feature, shaded from the skin only; other face colours as fixed detail
    const headL = { a: all.a, col: all.col };
    const shadeMask = new Float32Array(W * H); for (let i = 0; i < W * H; i++) shadeMask[i] = all.a[i] ? skinL.a[i] / all.a[i] : 0;
    colors[`skin.${b}`] = (await writePart(src, `head.${b}`, headL, 'tint', { shadeMask, blush: true, smooth: 3, hiCap: 0.12 }))!;
    const lastHeadRef = lastRef;
    for (let i = 0; i < W * H; i++) { // warm, mid-light 'other' face pixels (inner ear, eyelid creases) are skin: they must follow the skin colour
      if (!headx.a[i]) continue; const r = headx.col[i * 3], g = headx.col[i * 3 + 1], bb = headx.col[i * 3 + 2], l = lum(r, g, bb);
      const gold = g > 0.6 * r && bb < 0.55 * g && (r - bb) / Math.max(1, r) > 0.45;
      if (!gold && r >= g && g >= bb * 0.9 && l > 0.4 * lastHeadRef && (r - bb) / Math.max(1, r) > 0.12) headx.a[i] = 0;
    }
    if (headx.a.some((v) => v > 0.004)) await writePart(src, `head.${b}.x`, headx, 'fixed'); // placeholder name, folded below
    await writePart(src, `eyes.${names.sfx}`, layer(fam, [EYES]), 'fixed');
    await writePart(src, `brows.${names.sfx}`, layer(fam, [BROWS]), 'tint', { darkOver: lastHeadRef * 0.92 });
    await writePart(src, `mouth.${names.sfx}`, layer(fam, [LIPS]), 'tint');
    const skinRef = lastHeadRef;
    await writePart(src, `nose.${names.sfx}`, layer(fam, [NOSE]), 'tint', { lref: skinRef, blush: true, smooth: 3, hiCap: 0.12 });
    if (b === 'male') await writePart(src, `facial_hair.beard`, layer(fam, [BEARD]), 'tint', { darkOver: lastHeadRef * 0.92 });
    const bodyP = merge(p.body.map((l) => P[l]), [BODY]);
    { // the neck belongs to the head: body skin above it is stray (shows outside a hood)
      const nr = Math.floor(b === 'male' ? mNeckRow : neckRow), nx = (b === 'male' ? mNeckX : neckX), half = 55 * SS;
      for (let y = 0; y < nr; y++) for (let x = 0; x < SW; x++) if (Math.abs(x - nx) > half) bodyP.id[y * SW + x] = 0;
    }
    const bodyL = layer(bodyP, [BODY]);
    { // neck plug: skin from under the chin to below any collar, as wide as the neck, so collar gaps show neck, not holes
      const pv = b === 'male' ? mpv : piv0, ny = Math.round(pv.neck[1]), nx = pv.neck[0];
      const row = (y: number) => { let x0 = -1, x1 = -1; for (let x = 0; x < W; x++) if (all.a[y * W + x] > 0.5 && Math.abs(x - nx) < 60) { if (x0 < 0) x0 = x; x1 = x; } return [x0, x1]; };
      let ref = [-1, -1], refY = ny - 30; for (let y = ny - 50; y < ny + 5; y++) { const r = row(y); if (r[0] >= 0 && r[1] - r[0] > 20) { ref = r; refY = y; } }
      if (ref[0] >= 0) {
        let sr = 0, sg = 0, sb = 0, k = 0; for (let x = ref[0] + 4; x <= ref[1] - 4; x++) { const i = refY * W + x; sr += all.col[i * 3]; sg += all.col[i * 3 + 1]; sb += all.col[i * 3 + 2]; k++; }
        const c = [sr / k, sg / k, sb / k].map((v) => v * 0.9); // a touch of collar shadow
        // per row: from the outermost clothing/head pixel to the other (any look of this build), near the neck
        const looks = (b === 'male' ? ['m_casual', 'm_jalabiya'] : ['f_casual', 'f_abaya', 'f_hijab']).map((l) => P[l]);
        const span = (y: number): [number, number] => { let x0 = W, x1 = -1;
          for (const Q of looks) for (let x = Math.max(0, Math.floor(nx - 95)); x < Math.min(W, nx + 95); x++) { const q = (y * SS + 1) * SW + x * SS + 1; if (Q.id[q] && Q.id[q] !== HAIR) { if (x < x0) x0 = x; if (x > x1) x1 = x; } }
          return [x0, x1]; };
        for (let y = refY - 6; y < ny + (src === 'side' ? 30 : 80); y++) { const grow = src === 'side' ? 0 : Math.max(0, y - ny + 12) * 0.7; const sp = 0;
          void sp; const xa = Math.floor(ref[0] - grow), xb = Math.ceil(ref[1] + grow);
          for (let x = xa; x <= xb; x++) { const i = y * W + x; if (bodyL.a[i] >= 1) continue; const add = 1 - bodyL.a[i]; bodyL.col[i * 3] = (bodyL.col[i * 3] * bodyL.a[i] + c[0] * add); bodyL.col[i * 3 + 1] = (bodyL.col[i * 3 + 1] * bodyL.a[i] + c[1] * add); bodyL.col[i * 3 + 2] = (bodyL.col[i * 3 + 2] * bodyL.a[i] + c[2] * add); bodyL.a[i] = 1; } }
      }
    }
    await writePart(src, `body.${b}.mid`, bodyL, 'tint', { lref: skinRef, blush: true, smooth: 3, hiCap: 0.12 });
    colors[`hair.${names.hair}`] = (await writePart(src, `hair.${names.hair}.front`, despeckle(layer(merge(p.hair.map((l) => P[l]), [HAIR]), [HAIR]), 120, Math.floor((b === 'male' ? mpv : piv0).neck[1] - 30)), 'tint', { hiCap: 0.16 }))!;
    // what the hood clipped off the head (earrings, ear tips) goes with the hair: shown without a hijab, hidden with one
    if (clipped) {
      // ear skin the hood hides: an ears part (skin tint, hidden under headwear); jewellery and the rest ride with the hair
      const ear = layer(clipped, [HEAD, NOSE]); if (ear.a.some((v) => v > 0.004)) await writePart(src, `ears.${b}.front`, ear, 'tint', { lref: skinRef, smooth: 3 });
      const j = layer(clipped, [HEADX, EYES, BROWS, LIPS]); if (j.a.some((v) => v > 0.004)) await writePart(src, `hair.${names.hair}.front.x`, j, 'fixed');
    }
    const wear = p.wear.map((l) => P[l]);
    colors[`top.${names.top}`] = (await writePart(src, `top.${names.top}.${b}.mid`, layer(merge(wear, [TOP]), [TOP]), 'dominant'))!;
    colors[`bottom.${names.bottom}`] = (await writePart(src, `bottom.${names.bottom}.${b}.mid`, layer(merge(wear, [BOTTOM]), [BOTTOM]), 'dominant'))!;
    await writePart(src, `shoes.sneakers.${b}.mid`, layer(merge(wear, [SHOES]), [SHOES]), 'fixed');
    colors[`outfit.${names.outfit}`] = (await writePart(src, `outfit.${names.outfit}.${b}.mid`, layer(merge(p.outfit.map((l) => P[l]), [OUTFIT]), [OUTFIT]), 'tint'))!;
    if (p.headwear && names.headwear) colors[`headwear.${names.headwear}`] = (await writePart(src, `headwear.${names.headwear}.${b}`, layer(merge(p.headwear.map((l) => P[l]), [HEADWEAR]), [HEADWEAR]), 'tint'))!;
  };
  await build('female', { head: ['f_casual', 'f_hijab'], body: ['f_casual', 'f_abaya'], hair: ['f_casual', 'f_abaya'], wear: ['f_casual'], outfit: ['f_abaya', 'f_hijab'], headwear: ['f_hijab'] },
    { hair: 'wavy', top: 'blazer', bottom: 'wide_trousers', outfit: 'abaya', headwear: 'hijab', sfx: 'g3d_f' });
  await build('male', { head: ['m_casual', 'm_jalabiya'], body: ['m_casual', 'm_jalabiya'], hair: ['m_casual', 'm_jalabiya'], wear: ['m_casual'], outfit: ['m_jalabiya'] },
    { hair: 'textured', top: 'shirt', bottom: 'chinos', outfit: 'jalabiya', sfx: 'g3d_m' });
  // pivots from the female (registration for the sliders); art pixels
  const fp = JSON.parse(readFileSync(path.join(RAW, 'f_casual', 'pivots.json'), 'utf8'))[src];
  pivots[src] = { neck: fp.neck, head: fp.head, eyes: fp.eyes, nose: fp.nose, mouth: fp.mouth };
  const mp = JSON.parse(readFileSync(path.join(RAW, 'm_casual', 'pivots.json'), 'utf8'))[src];
  ((pivots.builds ??= {}).male ??= {})[src] = { neck: mp.neck, head: mp.head, eyes: mp.eyes, nose: mp.nose, mouth: mp.mouth };
  console.log(`${src}: composed`);
}
// the head's fixed face colours (eye shadow, freckles) belong to the head part as its sub-layer 1
const { readdirSync, renameSync } = await import('node:fs');
for (const src of Object.keys(ANGLES)) for (const f of readdirSync(path.join(KIT, src))) {
  const hx = f.match(/^(hair\.[a-z0-9_]+\.front)\.x\.1\.detail\.png$/);
  if (hx) { renameSync(path.join(KIT, src, f), path.join(KIT, src, `${hx[1]}.1.detail.png`)); continue; }
  const m = f.match(/^head\.(female|male)\.x\.1\.detail\.png$/);
  if (m) renameSync(path.join(KIT, src, f), path.join(KIT, src, `head.${m[1]}.1.detail.png`));
  else if (/^head\.(female|male)\.x\./.test(f)) rmSync(path.join(KIT, src, f));
}
writeFileSync(path.join(KIT, 'pivots.json'), JSON.stringify(pivots, null, 1));
const items = {
  hair: { wavy: { fit: 'female', coversEars: true }, textured: { fit: 'male' } },
  eyes: { g3d_f: { fit: 'female' }, g3d_m: { fit: 'male' } }, brows: { g3d_f: { fit: 'female' }, g3d_m: { fit: 'male' } },
  nose: { g3d_f: { fit: 'female' }, g3d_m: { fit: 'male' } }, mouth: { g3d_f: { fit: 'female' }, g3d_m: { fit: 'male' } },
  facialHair: { beard: { fit: 'male' } },
  headwear: { hijab: { fit: 'female', modest: true, hidesHair: true, coversEars: true, color: colors['headwear.hijab'] ?? '#b9a3c9' } },
  top: { blazer: { fit: 'female', color: colors['top.blazer'] }, shirt: { fit: 'male', modest: true, color: colors['top.shirt'] } },
  bottom: { wide_trousers: { fit: 'female', modest: true, color: colors['bottom.wide_trousers'] }, chinos: { fit: 'male', modest: true, color: colors['bottom.chinos'] } },
  outfit: { abaya: { fit: 'female', modest: true, color: colors['outfit.abaya'] }, jalabiya: { fit: 'male', modest: true, color: colors['outfit.jalabiya'] } },
  shoes: { sneakers: { fit: 'unisex', color: '#f4f4f4' } },
};
writeFileSync(path.join(KIT, 'items.json'), JSON.stringify(items, null, 1));
writeFileSync(path.join(KIT, 'colors.json'), JSON.stringify(colors, null, 1));
console.log('kit written to', KIT, colors);
