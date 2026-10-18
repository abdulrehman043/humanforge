// <HumanEditor>: drop-in avatar customization UI for React (web). The developer decides what
// users may edit through `options` (see HumanEditorOptions in ../human/editor).
//
//   <HumanEditor pkg={pkg} options={{ gender: 'female', exclude: ['ears'] }} onSave={(config) => api.save(config)} />
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { HumanConfig, HumanPackage } from '../human/runtime';
import { EditorControl, HumanEditorModel as EditorModel, HumanEditorOptions, createHumanEditor } from '../human/editor';
import { HumanCanvas, HumanCanvasHandle } from './HumanCanvas';

export interface HumanEditorProps {
  pkg: HumanPackage;
  /** What users may edit. Ignored if `editor` is given. */
  options?: HumanEditorOptions;
  /** A prebuilt editor model (createHumanEditor), to share it with your own code. */
  editor?: EditorModel;
  /** Controlled value. */
  value?: Partial<HumanConfig>;
  /** Uncontrolled starting value (e.g. the user's saved avatar). */
  defaultValue?: Partial<HumanConfig>;
  onChange?: (config: HumanConfig) => void;
  /** Shows a Save button. Gets the config (store it as JSON) and a PNG snapshot. */
  onSave?: (config: HumanConfig, snapshot: string | null) => void;
  saveLabel?: string;
  /** Show a "From selfie" button (needs @mediapipe/tasks-vision). */
  selfie?: boolean;
  /** Show a randomize button. Default true. */
  randomize?: boolean;
  accentColor?: string;
  background?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function HumanEditor({
  pkg, options, editor: given, value, defaultValue, onChange, onSave, saveLabel = 'Save', selfie = false, randomize = true,
  accentColor = '#1d1d1f', background = '#e9ecf1', className, style,
}: HumanEditorProps) {
  const editor = useMemo(() => given ?? createHumanEditor(pkg, options), [given, pkg, JSON.stringify(options)]);
  const [inner, setInner] = useState<HumanConfig>(() => editor.normalize(defaultValue ?? null));
  const config = value ? editor.normalize(value) : inner;
  const [tab, setTab] = useState(0);
  const [framing, setFraming] = useState<'face' | 'body' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canvas = useRef<HumanCanvasHandle>(null);
  const file = useRef<HTMLInputElement>(null);
  const section = editor.sections[Math.min(tab, editor.sections.length - 1)];

  useEffect(() => { if (!value) setInner((c) => editor.normalize(c)); }, [editor]);
  useStyles();

  const update = (next: HumanConfig) => {
    const n = editor.normalize(next);
    if (!value) setInner(n);
    onChange?.(n);
  };

  const fromSelfie = async (f: File) => {
    setBusy('Reading your photo…');
    try {
      const { createSelfieFitter } = await import('../human/selfie');
      const fitter = await (fitterCache ??= createSelfieFitter());
      const g = editor.options.gender;
      const res = await fitter.fit(pkg, f, {
        base: { ...config, detail: {} },
        hints: g === 'female' ? { gender: 0 } : g === 'male' ? { gender: 1 } : { gender: config.gender },
      });
      const c = res.config;
      update({ ...config, african: c.african, asian: c.asian, caucasian: c.caucasian, skin: c.skin, skinTint: c.skinTint, eyes: c.eyes, detail: { ...config.detail, ...c.detail } });
      setBusy(null);
    } catch (e) {
      setBusy(`Couldn't read a face: ${(e as Error).message}`);
      setTimeout(() => setBusy(null), 3000);
    }
  };

  if (!section) return <div className="hf-editor">No editable sections.</div>;
  const view = framing ?? section.framing;

  return (
    <div className={`hf-root ${className ?? ''}`} style={{ ['--hf-accent' as any]: accentColor, ...style }}>
    <div className="hf-editor">
      <div className="hf-stage">
        <HumanCanvas ref={canvas} pkg={pkg} config={config} framing={view} background={background} style={{ position: 'absolute', inset: 0 }} />
        <div className="hf-toolbar">
          <div className="hf-seg">
            <button className={view === 'face' ? 'on' : ''} onClick={() => setFraming('face')}>Face</button>
            <button className={view === 'body' ? 'on' : ''} onClick={() => setFraming('body')}>Body</button>
          </div>
          {randomize && <button className="hf-btn" title="Random look" onClick={() => update(editor.randomize())}>🎲</button>}
          {selfie && <button className="hf-btn" onClick={() => file.current?.click()}>📷 Selfie</button>}
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) fromSelfie(f); e.target.value = ''; }} />
        </div>
        {busy && <div className="hf-toast">{busy}</div>}
      </div>
      <div className="hf-panel">
        <div className="hf-tabs" role="tablist">
          {editor.sections.map((s, i) => (
            <button key={s.id} role="tab" aria-selected={s === section} className={s === section ? 'on' : ''} onClick={() => { setTab(i); setFraming(null); }}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="hf-controls">
          {section.controls.map((ctl) => <Control key={`${section.id}.${ctl.id}`} ctl={ctl} config={config} onChange={update} />)}
        </div>
        {onSave && <button className="hf-save" onClick={() => onSave(config, canvas.current?.snapshot() ?? null)}>{saveLabel}</button>}
      </div>
    </div>
    </div>
  );
}
let fitterCache: Promise<any> | undefined;

function Control({ ctl, config, onChange }: { ctl: EditorControl; config: HumanConfig; onChange: (c: HumanConfig) => void }) {
  if (ctl.kind === 'slider') {
    const v = ctl.value(config);
    return (
      <label className="hf-row">
        <span className="hf-label">{ctl.label}</span>
        <input type="range" min={ctl.min} max={ctl.max} step={ctl.step} value={v} onChange={(e) => onChange(ctl.apply(config, Number(e.target.value)))}
          onDoubleClick={() => onChange(ctl.apply(config, ctl.min < 0 ? 0 : (ctl.min + ctl.max) / 2))} />
      </label>
    );
  }
  if (ctl.kind === 'color') {
    const v = ctl.value(config).toLowerCase();
    return (
      <div className="hf-block">
        <span className="hf-label">{ctl.label}</span>
        <div className="hf-swatches">
          {ctl.colors.map((c) => (
            <button key={c} aria-label={c} className={`hf-swatch ${c.toLowerCase() === v ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange(ctl.apply(config, c))} />
          ))}
        </div>
      </div>
    );
  }
  const v = ctl.value(config);
  if (ctl.display === 'swatch') {
    return (
      <div className="hf-block">
        <span className="hf-label">{ctl.label}</span>
        <div className="hf-swatches">
          {ctl.options.map((o) => (
            <button key={o.id ?? 'none'} aria-label={o.label} title={o.label} className={`hf-swatch ${o.id === v ? 'on' : ''}`}
              style={{ background: o.preview ? `center/cover url("${o.preview}") ${o.swatch ?? ''}` : o.swatch ?? '#eee' }}
              onClick={() => onChange(ctl.apply(config, o.id))} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="hf-block">
      <span className="hf-label">{ctl.label}</span>
      <div className="hf-tiles">
        {ctl.options.map((o) => (
          <button key={o.id ?? 'none'} aria-label={o.label} title={o.label} className={`hf-tile ${o.id === v ? 'on' : ''}`} onClick={() => onChange(ctl.apply(config, o.id))}>
            {o.id === null ? <NoneIcon /> : o.preview ? <img src={o.preview} alt="" loading="lazy" draggable={false} /> : <span>{o.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function NoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="#9aa0a8" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" /><path d="M5.6 18.4 18.4 5.6" />
    </svg>
  );
}

const CSS = `
.hf-root{--hf-accent:#1d1d1f;container-type:inline-size;height:100%;min-height:480px}
.hf-editor{display:grid;grid-template-columns:minmax(0,1fr) 360px;height:100%;min-height:480px;font:13px/1.4 system-ui,-apple-system,sans-serif;color:#1d1d1f;background:#fff;border-radius:16px;overflow:hidden}
.hf-stage{position:relative;min-height:260px;min-width:0}
.hf-toolbar{position:absolute;top:12px;left:12px;right:12px;display:flex;gap:8px;flex-wrap:wrap;pointer-events:none}
.hf-toolbar>*{pointer-events:auto}
.hf-seg{display:flex;background:rgba(255,255,255,.9);border-radius:999px;padding:3px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.hf-seg button,.hf-btn{border:0;background:transparent;border-radius:999px;padding:6px 12px;font:inherit;cursor:pointer;color:inherit}
.hf-seg button.on{background:var(--hf-accent);color:#fff}
.hf-btn{background:rgba(255,255,255,.9);box-shadow:0 1px 4px rgba(0,0,0,.08)}
.hf-btn:hover{background:#fff}
.hf-toast{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);background:rgba(29,29,31,.85);color:#fff;padding:8px 14px;border-radius:999px}
.hf-panel{display:flex;flex-direction:column;border-left:1px solid #eceef1;min-height:0;min-width:0}
.hf-tabs{display:flex;gap:4px;overflow-x:auto;padding:12px 12px 8px;border-bottom:1px solid #eceef1;scrollbar-width:none}
.hf-tabs::-webkit-scrollbar{display:none}
.hf-tabs button{flex:none;border:0;background:#f2f3f5;border-radius:999px;padding:7px 13px;font:inherit;font-weight:500;cursor:pointer;color:#444}
.hf-tabs button.on{background:var(--hf-accent);color:#fff}
.hf-controls{flex:1;overflow-y:auto;padding:8px 16px 16px}
.hf-row{display:grid;grid-template-columns:118px 1fr;align-items:center;gap:10px;margin:9px 0}
.hf-row input{width:100%;accent-color:var(--hf-accent)}
.hf-label{font-size:12px;color:#666}
.hf-block{margin:12px 0}
.hf-block>.hf-label{display:block;margin-bottom:8px;font-weight:600;color:#333}
.hf-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px}
.hf-tile{aspect-ratio:1;display:grid;place-items:center;border:1px solid #e1e3e7;background:#f4f5f7;border-radius:12px;padding:4px;cursor:pointer;overflow:hidden;font:inherit;font-size:11px;color:#555}
.hf-tile:hover{border-color:#c5c8ce}
.hf-tile.on{border-color:var(--hf-accent);box-shadow:inset 0 0 0 2px var(--hf-accent);background:#fff}
.hf-tile img{width:100%;height:100%;object-fit:contain;pointer-events:none}
.hf-swatches{display:flex;flex-wrap:wrap;gap:10px}
.hf-swatch{width:34px;height:34px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #d5d8dd;cursor:pointer;padding:0}
.hf-swatch.on{box-shadow:0 0 0 2px var(--hf-accent)}
.hf-save{margin:12px 16px 16px;border:0;border-radius:12px;padding:12px;background:var(--hf-accent);color:#fff;font:inherit;font-weight:600;cursor:pointer}
@container (max-width:720px){.hf-editor{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(260px,52%) minmax(0,1fr)}.hf-panel{border-left:0;border-top:1px solid #eceef1}}
`;
let injected = false;
function useStyles() {
  useEffect(() => {
    if (injected || typeof document === 'undefined') return;
    injected = true;
    const el = document.createElement('style');
    el.dataset.humanforge = '';
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}
