// HumanForge 2D avatar editor (web, React). Mobile-first: preview on top, options below; side by side on desktop.
import React, { Component, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderAvatarLayers, renderAvatarSvg } from './render';
import { DEFAULT_CONFIG } from './defaults';
import { buildManifest, Category } from './manifest';
import { errorsIfSet, resolveConfig } from './compat';
import { randomConfig } from './random';
import { AvatarStore, exportConfig, importConfig } from './storage';
import { normalizeConfig, ValidationIssue } from './validate';
import {
  CLOTH_COLORS, DENIM_COLORS, EYE_COLORS, FRAME_COLORS, HAIR_COLORS, HIGHLIGHT_COLORS, LIP_COLORS, METAL_COLORS, SHADOW_COLORS, SHOE_COLORS, SKIN_TONES, Swatch,
} from './palette';
import { BOTTOM_BY_ID } from './bottoms';
import type { AvatarConfig } from './types';
import { CROP, TINT_PATH, clone, getPath, previewBase, relevantKey, setPath, thumbKey, thumbTint } from './editorModel';

// ---------------------------------------------------------------- helpers
const CSS = `
.hf{--bg:#f5f3fb;--card:#fff;--ink:#241f3a;--mute:#7a7592;--line:#e6e2f2;--accent:#6c4cf0;--accent-soft:#eee9ff;--bad:#c2394b;
  font-family:ui-rounded,"SF Pro Rounded",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);box-sizing:border-box;
  display:grid;grid-template-columns:minmax(300px,440px) 1fr;gap:16px;padding:16px;height:100%;min-height:0}
.hf *{box-sizing:border-box}
.hf button{font:inherit;color:inherit;cursor:pointer}
.hf-stage{display:flex;flex-direction:column;gap:10px;min-height:0}
.hf-preview{position:relative;flex:1;min-height:0;background:radial-gradient(120% 80% at 50% 0%,#fff 0%,#ece8fa 70%);border-radius:24px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;overflow:hidden}
.hf-preview svg{height:100%;width:100%;display:block}
.hf-chip{position:absolute;top:10px;right:10px;border:1px solid var(--line);background:#fffc;backdrop-filter:blur(6px);border-radius:999px;padding:6px 12px;font-size:13px}
.hf-busy{position:absolute;left:12px;top:12px;font-size:12px;color:var(--mute);background:#fffc;border:1px solid var(--line);border-radius:999px;padding:4px 10px}
.hf-note{position:absolute;left:10px;right:10px;bottom:10px;background:#241f3ae6;color:#fff;border-radius:12px;padding:8px 12px;font-size:12.5px;line-height:1.35}
.hf-actions{display:flex;gap:8px;flex-wrap:wrap}
.hf-btn{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:9px 14px;font-weight:600;font-size:14px}
.hf-btn:hover{border-color:var(--accent)}
.hf-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.hf-panel{display:flex;flex-direction:column;min-height:0;background:var(--card);border-radius:24px;border:1px solid var(--line);overflow:hidden}
.hf-tabs{display:flex;gap:6px;overflow-x:auto;padding:10px 12px;border-bottom:1px solid var(--line);scrollbar-width:none;flex:none}
.hf-tabs::-webkit-scrollbar{display:none}
.hf-tab{flex:none;border:0;background:transparent;border-radius:999px;padding:8px 14px;font-weight:600;font-size:14px;color:var(--mute)}
.hf-tab[aria-selected=true]{background:var(--accent-soft);color:var(--accent)}
.hf-body{flex:1;min-height:0;overflow-y:auto;padding:14px 16px 24px}
.hf-sec{margin-bottom:22px}
.hf-sec h3{margin:0 0 10px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--mute);font-weight:700}
.hf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.hf-opt{position:relative;border:2px solid var(--line);background:#faf9fe;border-radius:16px;padding:4px 4px 6px;display:flex;flex-direction:column;align-items:center;gap:4px;content-visibility:auto;contain-intrinsic-size:92px 112px}
.hf-opt[aria-pressed=true]{border-color:var(--accent);background:var(--accent-soft)}
.hf-opt[disabled]{opacity:.38;cursor:not-allowed}
.hf-thumb{width:100%;aspect-ratio:1;border-radius:12px;background:linear-gradient(#fff,#efecf9);display:flex;align-items:center;justify-content:center;overflow:hidden}
.hf-thumb svg{width:100%;height:100%;display:block}
.hf-none{font-size:26px;color:var(--mute)}
.hf-opt span.l{font-size:11.5px;line-height:1.15;text-align:center;color:var(--ink)}
.hf-check{position:absolute;top:6px;right:6px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center}
.hf-sw{display:flex;flex-wrap:wrap;gap:8px}
.hf-sw button{width:34px;height:34px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1.5px var(--line);padding:0}
.hf-sw button[aria-pressed=true]{box-shadow:0 0 0 3px var(--accent)}
.hf-sw label{width:34px;height:34px;border-radius:50%;border:2px dashed var(--line);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--mute);cursor:pointer;position:relative;overflow:hidden}
.hf-sw label input{position:absolute;inset:-8px;opacity:0;cursor:pointer}
.hf-seg{display:inline-flex;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.hf-seg button{border:0;background:#fff;padding:8px 14px;font-size:13.5px;font-weight:600;color:var(--mute);border-right:1px solid var(--line)}
.hf-seg button:last-child{border-right:0}
.hf-seg button[aria-pressed=true]{background:var(--accent-soft);color:var(--accent)}
.hf-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:8px 0}
.hf-row b{font-size:13px;color:var(--mute);min-width:84px;font-weight:600}
.hf-saved{display:flex;flex-direction:column;gap:6px}
.hf-saved div{display:flex;gap:6px;align-items:center}
.hf-saved input,.hf-ta{font:inherit;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:#fff}
.hf-ta{width:100%;min-height:90px;font-family:ui-monospace,monospace;font-size:12px}
.hf-issues{background:#fff4e8;border:1px solid #f3d3a6;color:#6a4310;border-radius:12px;padding:10px 12px;font-size:13px;margin-bottom:12px}
.hf-skel{display:grid;place-items:center;height:100%;color:var(--mute)}
.hf-skel i{width:36px;height:36px;border-radius:50%;border:4px solid var(--line);border-top-color:var(--accent);animation:hfspin 1s linear infinite}
@keyframes hfspin{to{transform:rotate(1turn)}}
.hf-err{padding:24px;color:var(--bad)}
@media (max-width:820px){
  .hf{grid-template-columns:1fr;grid-template-rows:minmax(0,46%) minmax(0,1fr);padding:10px;gap:10px}
  .hf-grid{grid-template-columns:repeat(auto-fill,minmax(78px,1fr))}
  .hf-actions .hf-btn{padding:8px 11px;font-size:13px}
}
`;

// ---------------------------------------------------------------- UI atoms
function Swatches({ list, value, onPick, allowCustom = true, noneValue }: { list: Swatch[]; value: string | null; onPick: (hex: string | null) => void; allowCustom?: boolean; noneValue?: boolean }) {
  const known = value && list.some((s) => s.hex.toLowerCase() === value.toLowerCase());
  return (
    <div className="hf-sw" role="group">
      {noneValue && <button aria-label="None" aria-pressed={value === null} title="None" style={{ background: 'repeating-linear-gradient(45deg,#fff,#fff 4px,#eee 4px,#eee 8px)' }} onClick={() => onPick(null)} />}
      {list.map((s) => (
        <button key={s.id} aria-label={s.name} title={s.name} aria-pressed={!!value && s.hex.toLowerCase() === value.toLowerCase()} style={{ background: s.hex.endsWith('00') && s.hex.length === 9 ? 'repeating-linear-gradient(45deg,#fff,#fff 4px,#eee 4px,#eee 8px)' : s.hex }} onClick={() => onPick(s.hex)} />
      ))}
      {allowCustom && (
        <label title="Custom colour" style={!known && value ? { background: value, borderStyle: 'solid', color: '#fff' } : undefined}>
          +<input type="color" value={value && value.length === 7 ? value : '#888888'} onChange={(e) => onPick(e.target.value)} />
        </label>
      )}
    </div>
  );
}

function Seg<T extends string | number | boolean>({ value, options, onPick }: { value: T; options: { v: T; label: string }[]; onPick: (v: T) => void }) {
  return <div className="hf-seg">{options.map((o) => <button key={String(o.v)} aria-pressed={o.v === value} onClick={() => onPick(o.v)}>{o.label}</button>)}</div>;
}

interface Opt { id: string; name: string }
// Thumbnails are rasterised once as cached SVG images (blob URLs), keyed by only the parts of the look they show.
const urlCache = new Map<string, string>();
function thumbUrl(key: string, make: () => string): string {
  let u = urlCache.get(key);
  if (!u) {
    u = URL.createObjectURL(new Blob([make()], { type: 'image/svg+xml' }));
    urlCache.set(key, u);
    if (urlCache.size > 900) { const k = urlCache.keys().next().value as string; URL.revokeObjectURL(urlCache.get(k)!); urlCache.delete(k); }
  }
  return u;
}
function OptionGrid({ cat, path, cfg, options, optional, onPick }: { cat: Category; path: string; cfg: AvatarConfig; options: Opt[]; optional?: boolean; onPick: (id: string) => void }) {
  const current = getPath(cfg, path) as string;
  const base = useMemo(() => previewBase(cat, cfg), [cat, JSON.stringify(cfg)]);
  const baseKey = useMemo(() => relevantKey(cat, base), [cat, base]);
  const list: Opt[] = optional ? [{ id: 'none', name: 'None' }, ...options] : options;
  return (
    <div className="hf-grid">
      {list.map((o) => {
        const errs = o.id === 'none' ? [] : errorsIfSet(cfg, path, o.id);
        const tint = thumbTint(cat, o.id, list.indexOf(o));
        return <Thumb key={o.id} cat={cat} path={path} base={base} baseKey={baseKey} tint={tint} opt={o} selected={current === o.id} disabled={errs.length > 0} reason={errs[0]?.message} onPick={onPick} />;
      })}
    </div>
  );
}

const Thumb = React.memo(function Thumb({ cat, path, base, baseKey, tint, opt, selected, disabled, reason, onPick }: { cat: Category; path: string; base: AvatarConfig; baseKey: string; tint?: string; opt: Opt; selected: boolean; disabled: boolean; reason?: string; onPick: (id: string) => void }) {
  const url = useMemo(() => {
    if (opt.id === 'none') return '';
    try { return thumbUrl(thumbKey(cat, path, opt.id, tint, baseKey), () => renderAvatarSvg(tint ? setPath(setPath(base, path, opt.id), TINT_PATH[cat], tint) : setPath(base, path, opt.id), { viewBox: CROP[cat], width: 160, fast: true, uid: 't' })); } catch { return ''; }
  }, [baseKey, path, opt.id, cat, tint]);
  return (
    <button className="hf-opt" aria-pressed={selected} disabled={disabled} title={disabled ? reason : opt.name} onClick={() => onPick(opt.id)}>
      <div className="hf-thumb">{opt.id === 'none' ? <span className="hf-none">∅</span> : url ? <img src={url} alt={opt.name} draggable={false} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : null}</div>
      <span className="l">{opt.name}</span>
      {selected && <i className="hf-check">✓</i>}
    </button>
  );
});

// ---------------------------------------------------------------- layer-cached preview
const decoded = new Map<string, Promise<void>>();
const decodeUrl = (url: string) => {
  let p = decoded.get(url);
  if (!p) { const im = new Image(); im.src = url; p = im.decode().catch(() => undefined); decoded.set(url, p); if (decoded.size > 600) decoded.delete(decoded.keys().next().value as string); }
  return p;
};

/** The avatar as stacked layer images. A layer whose markup did not change keeps its URL (and its decoded bitmap),
 *  so choosing a hairstyle never repaints the shoes; new layers are swapped in only once decoded (no flicker). */
function LayerStack({ cfg, zoom, onBusy }: { cfg: AvatarConfig; zoom: boolean; onBusy: (b: boolean) => void }) {
  const wanted = useMemo(() => renderAvatarLayers(cfg, { viewBox: zoom ? [50, 12, 300, 340] : undefined, width: 400, uid: 'm' }).map((l) => ({ id: l.id, url: thumbUrl(`L|${l.svg}`, () => l.svg) })), [cfg, zoom]);
  const [shown, setShown] = useState(wanted);
  useEffect(() => {
    let live = true;
    if (wanted.every((w, i) => shown[i]?.url === w.url) && wanted.length === shown.length) return;
    onBusy(true);
    Promise.all(wanted.map((w) => decodeUrl(w.url))).then(() => { if (live) { setShown(wanted); onBusy(false); } });
    return () => { live = false; };
  }, [wanted]);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }} role="img" aria-label="Your avatar">
      {shown.map((l) => <img key={l.id} src={l.url} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />)}
    </div>
  );
}

class Boundary extends Component<{ children: ReactNode; onReset: () => void }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="hf-err"><b>The preview could not be drawn.</b><p>{this.state.err.message}</p><button className="hf-btn" onClick={() => { this.setState({ err: null }); this.props.onReset(); }}>Reset avatar</button></div>;
  }
}

// ---------------------------------------------------------------- editor
const TABS = [
  ['face', 'Face'], ['skin', 'Skin'], ['hair', 'Hair'], ['head', 'Head covering'], ['tops', 'Tops'], ['outer', 'Jackets'], ['bottoms', 'Bottoms'], ['dresses', 'Dresses'], ['shoes', 'Shoes'], ['acc', 'Accessories'], ['mood', 'Mood & pose'], ['saved', 'Save'],
] as const;
type TabId = (typeof TABS)[number][0];

export interface ForgeEditorProps {
  defaultValue?: AvatarConfig;
  onChange?: (c: AvatarConfig) => void;
  onSave?: (c: AvatarConfig, svg: string) => void;
  store?: AvatarStore;
  style?: React.CSSProperties;
}

export function ForgeEditor({ defaultValue, onChange, onSave, store: storeProp, style }: ForgeEditorProps) {
  const store = useMemo(() => storeProp ?? new AvatarStore(), [storeProp]);
  const initial = useMemo(() => normalizeConfig(defaultValue ?? DEFAULT_CONFIG), [defaultValue]);
  const [cfg, setCfg] = useState<AvatarConfig>(initial.config);
  const [issues, setIssues] = useState<ValidationIssue[]>(initial.issues.filter((i) => i.severity !== 'info'));
  const [tab, setTab] = useState<TabId>('face');
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [name, setName] = useState('My avatar');
  const [json, setJson] = useState('');
  const [seed, setSeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const manifest = useMemo(() => buildManifest(), []);
  const opts = useCallback((cat: Category): Opt[] => manifest.filter((e) => e.category === cat).map((e) => ({ id: e.optionId, name: e.name })), [manifest]);

  useEffect(() => { const t = setTimeout(() => setReady(true), 30); store.list().then(setSaved).catch(() => {}); return () => clearTimeout(t); }, [store]);
  useEffect(() => { onChange?.(cfg); }, [cfg]);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [tab]);

  const set = (path: string, v: unknown) => { setCfg((c) => setPath(c, path, v)); setIssues([]); };
  const resolved = useMemo(() => resolveConfig(cfg), [cfg]);
  const randomize = () => { const next = randomConfig(seed * 7919 + Date.now() % 9973, { keep: { skin: false } }); setSeed((s) => s + 1); setCfg(next); setIssues([]); };
  const reset = () => { setCfg(clone(DEFAULT_CONFIG)); setIssues([]); };
  const doSave = async () => { await store.save(name.trim() || 'My avatar', cfg); setSaved(await store.list()); onSave?.(cfg, renderAvatarSvg(cfg, { width: 800, uid: 'save' })); };
  const download = (name: string, blob: Blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const exportSvg = () => download('avatar.svg', new Blob([renderAvatarSvg(cfg, { width: 800, uid: 'exp' })], { type: 'image/svg+xml' }));
  const exportPng = () => {
    const im = new Image();
    im.onload = () => { const cv = document.createElement('canvas'); cv.width = 800; cv.height = Math.round((800 * im.naturalHeight) / im.naturalWidth); cv.getContext('2d')!.drawImage(im, 0, 0, cv.width, cv.height); cv.toBlob((b) => b && download('avatar.png', b)); };
    im.src = URL.createObjectURL(new Blob([renderAvatarSvg(cfg, { width: 800, uid: 'exp' })], { type: 'image/svg+xml' }));
  };
  const doLoad = async (n: string) => { const r = await store.load(n); if (!r) return; setCfg(r.config); setIssues(r.issues.filter((i) => i.severity !== 'info')); setName(n); };
  const doRemove = async (n: string) => { await store.remove(n); setSaved(await store.list()); };
  const doImport = () => { try { const r = importConfig(json); setCfg(r.config); setIssues(r.issues.filter((i) => i.severity !== 'info')); } catch (e) { setIssues([{ path: '', code: 'schema', severity: 'error', message: `Could not read that JSON: ${(e as Error).message}` }]); } };

  const Sec = ({ title, children }: { title: string; children: ReactNode }) => <section className="hf-sec"><h3>{title}</h3>{children}</section>;
  const garmentColors = BOTTOM_BY_ID[cfg.outfit.bottom]?.denim ? DENIM_COLORS : CLOTH_COLORS;

  const body = (() => {
    switch (tab) {
      case 'face': return (<>
        <Sec title="Face shape"><OptionGrid cat="faceShape" path="face.shape" cfg={cfg} options={opts('faceShape')} onPick={(v) => set('face.shape', v)} /></Sec>
        <Sec title="Eyes"><OptionGrid cat="eyes" path="face.eyes" cfg={cfg} options={opts('eyes')} onPick={(v) => set('face.eyes', v)} />
          <div className="hf-row"><b>Eye colour</b><Swatches list={EYE_COLORS} value={cfg.face.eyeColor} onPick={(h) => h && set('face.eyeColor', h)} /></div></Sec>
        <Sec title="Eyebrows"><OptionGrid cat="brows" path="face.brows" cfg={cfg} options={opts('brows')} onPick={(v) => set('face.brows', v)} /></Sec>
        <Sec title="Nose"><OptionGrid cat="nose" path="face.nose" cfg={cfg} options={opts('nose')} onPick={(v) => set('face.nose', v)} /></Sec>
        <Sec title="Lips"><OptionGrid cat="mouth" path="face.mouth" cfg={cfg} options={opts('mouth')} onPick={(v) => set('face.mouth', v)} />
          <div className="hf-row"><b>Lip colour</b><Swatches list={LIP_COLORS} value={cfg.face.lipColor} onPick={(h) => h && set('face.lipColor', h)} /></div></Sec>
        <Sec title="Makeup & details">
          <div className="hf-row"><b>Eyeshadow</b><Swatches list={SHADOW_COLORS} value={cfg.face.eyeshadow} allowCustom={false} onPick={(h) => h && set('face.eyeshadow', h)} /></div>
          <div className="hf-row"><b>Blush</b><Seg value={cfg.face.cheeks} options={[{ v: 0, label: 'None' }, { v: 1, label: 'Light' }, { v: 2, label: 'Medium' }, { v: 3, label: 'Rosy' }]} onPick={(v) => set('face.cheeks', v)} /></div>
          <div className="hf-row"><b>Lashes</b><Seg value={cfg.face.lashes} options={[{ v: false, label: 'Off' }, { v: true, label: 'On' }]} onPick={(v) => set('face.lashes', v)} /></div>
          <div className="hf-row"><b>Freckles</b><Seg value={cfg.face.freckles} options={[{ v: 0, label: 'None' }, { v: 1, label: 'Few' }, { v: 2, label: 'Many' }]} onPick={(v) => set('face.freckles', v)} /></div>
          <div className="hf-row"><b>Beauty mark</b><Seg value={cfg.face.mole} options={[{ v: 'none', label: 'None' }, { v: 'cheek', label: 'Cheek' }, { v: 'lip', label: 'Lip' }, { v: 'chin', label: 'Chin' }]} onPick={(v) => set('face.mole', v)} /></div>
        </Sec></>);
      case 'skin': return <Sec title="Skin tone"><Swatches list={SKIN_TONES} value={SKIN_TONES.find((s) => s.id === cfg.face.skin)?.hex ?? null} allowCustom={false} onPick={(h) => set('face.skin', SKIN_TONES.find((s) => s.hex === h)?.id ?? 'golden')} /></Sec>;
      case 'hair': return (<>
        <Sec title="Hairstyle"><OptionGrid cat="hair" path="hair.style" cfg={cfg} options={opts('hair')} optional onPick={(v) => set('hair.style', v)} /></Sec>
        <Sec title="Colour">
          <Swatches list={HAIR_COLORS} value={cfg.hair.color} onPick={(h) => h && set('hair.color', h)} />
          <div className="hf-row"><b>Highlights</b><Swatches list={HIGHLIGHT_COLORS} value={cfg.hair.highlight} noneValue onPick={(h) => set('hair.highlight', h)} /></div>
          {cfg.hair.highlight && <div className="hf-row"><b>Style</b><Seg value={cfg.hair.highlightStyle} options={[{ v: 'balayage', label: 'Balayage' }, { v: 'tips', label: 'Tips' }, { v: 'streaks', label: 'Streaks' }]} onPick={(v) => set('hair.highlightStyle', v)} /></div>}
        </Sec>
        <Sec title="Hair accessory"><OptionGrid cat="hairAccessory" path="accessories.hairAccessory" cfg={cfg} options={opts('hairAccessory')} optional onPick={(v) => set('accessories.hairAccessory', v)} />
          {cfg.accessories.hairAccessory !== 'none' && <div className="hf-row"><b>Colour</b><Swatches list={CLOTH_COLORS} value={cfg.accessories.hairAccessoryColor} onPick={(h) => h && set('accessories.hairAccessoryColor', h)} /></div>}</Sec></>);
      case 'head': return (<>
        <Sec title="Hijabs, turbans & hats"><OptionGrid cat="headwear" path="headwear.style" cfg={cfg} options={opts('headwear')} optional onPick={(v) => set('headwear.style', v)} /></Sec>
        {cfg.headwear.style !== 'none' && <Sec title="Colour & fabric">
          <Swatches list={CLOTH_COLORS} value={cfg.headwear.color} onPick={(h) => h && set('headwear.color', h)} />
          {(cfg.headwear.style.startsWith('hijab') || cfg.headwear.style === 'headwrap') && <>
            <div className="hf-row"><b>Fabric</b><Seg value={cfg.headwear.fabric} options={[{ v: 'jersey', label: 'Jersey' }, { v: 'chiffon', label: 'Chiffon' }, { v: 'satin', label: 'Satin' }, { v: 'matte', label: 'Cotton' }]} onPick={(v) => set('headwear.fabric', v)} /></div>
            <div className="hf-row"><b>Undercap</b><Seg value={cfg.headwear.undercap} options={[{ v: false, label: 'Off' }, { v: true, label: 'On' }]} onPick={(v) => set('headwear.undercap', v)} /></div></>}
        </Sec>}</>);
      case 'tops': return (<>
        <Sec title="Tops"><OptionGrid cat="top" path="outfit.top" cfg={cfg} options={opts('top')} onPick={(v) => { set('outfit.top', v); if (cfg.outfit.dress !== 'none') set('outfit.dress', 'none'); }} /></Sec>
        <Sec title="Colour"><Swatches list={CLOTH_COLORS} value={cfg.outfit.topColor} onPick={(h) => h && set('outfit.topColor', h)} /></Sec></>);
      case 'outer': return (<>
        <Sec title="Jackets & coats"><OptionGrid cat="outer" path="outfit.outer" cfg={cfg} options={opts('outer')} optional onPick={(v) => set('outfit.outer', v)} /></Sec>
        {cfg.outfit.outer !== 'none' && <Sec title="Colour"><Swatches list={CLOTH_COLORS} value={cfg.outfit.outerColor} onPick={(h) => h && set('outfit.outerColor', h)} /></Sec>}</>);
      case 'bottoms': return (<>
        <Sec title="Bottoms"><OptionGrid cat="bottom" path="outfit.bottom" cfg={cfg} options={opts('bottom')} onPick={(v) => { set('outfit.bottom', v); if (cfg.outfit.dress !== 'none') set('outfit.dress', 'none'); }} /></Sec>
        <Sec title="Colour"><Swatches list={garmentColors} value={cfg.outfit.bottomColor} onPick={(h) => h && set('outfit.bottomColor', h)} /></Sec></>);
      case 'dresses': return (<>
        <Sec title="Dresses, modest & traditional wear"><OptionGrid cat="dress" path="outfit.dress" cfg={cfg} options={opts('dress')} optional onPick={(v) => set('outfit.dress', v)} /></Sec>
        {cfg.outfit.dress !== 'none' && <Sec title="Colour"><Swatches list={CLOTH_COLORS} value={cfg.outfit.dressColor} onPick={(h) => h && set('outfit.dressColor', h)} /></Sec>}</>);
      case 'shoes': return (<>
        <Sec title="Shoes"><OptionGrid cat="shoes" path="outfit.shoes" cfg={cfg} options={opts('shoes')} onPick={(v) => set('outfit.shoes', v)} /></Sec>
        <Sec title="Colour"><Swatches list={SHOE_COLORS} value={cfg.outfit.shoesColor} onPick={(h) => h && set('outfit.shoesColor', h)} /></Sec></>);
      case 'acc': return (<>
        <Sec title="Glasses"><OptionGrid cat="glasses" path="accessories.glasses" cfg={cfg} options={opts('glasses')} optional onPick={(v) => set('accessories.glasses', v)} />
          {cfg.accessories.glasses !== 'none' && <div className="hf-row"><b>Frame</b><Swatches list={FRAME_COLORS} value={cfg.accessories.glassesColor} onPick={(h) => h && set('accessories.glassesColor', h)} /></div>}</Sec>
        <Sec title="Earrings"><OptionGrid cat="earrings" path="accessories.earrings" cfg={cfg} options={opts('earrings')} optional onPick={(v) => set('accessories.earrings', v)} /></Sec>
        <Sec title="Necklaces"><OptionGrid cat="necklace" path="accessories.necklace" cfg={cfg} options={opts('necklace')} optional onPick={(v) => set('accessories.necklace', v)} />
          <div className="hf-row"><b>Metal</b><Swatches list={METAL_COLORS} value={cfg.accessories.metal} allowCustom={false} onPick={(h) => h && set('accessories.metal', h)} /></div></Sec>
        <Sec title="Scarves"><OptionGrid cat="scarf" path="accessories.scarf" cfg={cfg} options={opts('scarf')} optional onPick={(v) => set('accessories.scarf', v)} />
          {cfg.accessories.scarf !== 'none' && <div className="hf-row"><b>Colour</b><Swatches list={CLOTH_COLORS} value={cfg.accessories.scarfColor} onPick={(h) => h && set('accessories.scarfColor', h)} /></div>}</Sec>
        <Sec title="Bags"><OptionGrid cat="bag" path="accessories.bag" cfg={cfg} options={opts('bag')} optional onPick={(v) => set('accessories.bag', v)} />
          {cfg.accessories.bag !== 'none' && <div className="hf-row"><b>Colour</b><Swatches list={CLOTH_COLORS} value={cfg.accessories.bagColor} onPick={(h) => h && set('accessories.bagColor', h)} /></div>}</Sec></>);
      case 'mood': return (<>
        <Sec title="Expression"><OptionGrid cat="expression" path="expression" cfg={cfg} options={opts('expression')} onPick={(v) => set('expression', v)} /></Sec>
        <Sec title="Pose"><OptionGrid cat="pose" path="pose" cfg={cfg} options={opts('pose')} onPick={(v) => set('pose', v)} /></Sec></>);
      case 'saved': return (<>
        <Sec title="Save this look">
          <div className="hf-saved"><div><input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" /><button className="hf-btn primary" onClick={doSave}>Save</button></div></div>
        </Sec>
        <Sec title="Saved looks">
          {saved.length === 0 ? <p style={{ color: 'var(--mute)', fontSize: 14 }}>Nothing saved yet.</p> : <div className="hf-saved">{saved.map((n) => <div key={n}><button className="hf-btn" onClick={() => doLoad(n)}>Restore “{n}”</button><button className="hf-btn" onClick={() => doRemove(n)} aria-label={`Delete ${n}`}>✕</button></div>)}</div>}
        </Sec>
        <Sec title="Export picture"><div className="hf-actions"><button className="hf-btn" onClick={exportPng}>Download PNG</button><button className="hf-btn" onClick={exportSvg}>Download SVG</button></div></Sec>
        <Sec title="Share as JSON">
          <textarea className="hf-ta" value={json} placeholder="Paste a configuration here, or press Export" onChange={(e) => setJson(e.target.value)} />
          <div className="hf-actions" style={{ marginTop: 8 }}><button className="hf-btn" onClick={() => setJson(exportConfig(cfg))}>Export</button><button className="hf-btn" onClick={doImport}>Import</button></div>
        </Sec></>);
    }
  })();

  return (
    <div className="hf" style={style}>
      <style>{CSS}</style>
      <div className="hf-stage">
        <div className="hf-preview">
          <Boundary onReset={reset}>
            {ready ? <LayerStack cfg={cfg} zoom={zoom} onBusy={setBusy} /> : <div className="hf-skel"><i /></div>}
            {busy && <span className="hf-busy" aria-live="polite">Updating…</span>}
          </Boundary>
          <button className="hf-chip" onClick={() => setZoom((z) => !z)}>{zoom ? 'Full body' : 'Close up'}</button>
          {resolved.notes.length > 0 && <div className="hf-note" role="status">{resolved.notes.join(' ')}</div>}
        </div>
        <div className="hf-actions">
          <button className="hf-btn primary" onClick={randomize}>🎲 Randomise</button>
          <button className="hf-btn" onClick={reset}>Reset</button>
          <button className="hf-btn" onClick={doSave}>Save</button>
          <button className="hf-btn" disabled={saved.length === 0} onClick={() => doLoad(saved[saved.length - 1])}>Restore last</button>
        </div>
      </div>
      <div className="hf-panel">
        <div className="hf-tabs" role="tablist">{TABS.map(([id, label]) => <button key={id} role="tab" className="hf-tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
        <div className="hf-body" ref={bodyRef}>
          {issues.length > 0 && <div className="hf-issues" role="alert"><b>Some options were adjusted:</b><ul style={{ margin: '6px 0 0 18px', padding: 0 }}>{issues.slice(0, 6).map((i, k) => <li key={k}>{i.message}</li>)}</ul></div>}
          {ready ? body : <div className="hf-skel"><i /></div>}
        </div>
      </div>
    </div>
  );
}
