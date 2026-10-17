// HumanForge web demo: the drop-in <HumanEditor> plus a bar of developer options, to show how an
// app decides what its users may edit (e.g. a women-only app with no body sliders).
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HumanEditor, HumanEditorOptions, SectionId, ALL_SECTIONS, useHumanPackage } from '../src/web';
import type { HumanConfig } from '../src/human/runtime';

const qp = new URLSearchParams(location.search);

function App() {
  const { pkg, error } = useHumanPackage('/human');
  const [gender, setGender] = useState<HumanEditorOptions['gender']>((qp.get('gender') as any) || 'female');
  const [sections, setSections] = useState<SectionId[]>(ALL_SECTIONS);
  const [natural, setNatural] = useState(true);
  const [saved, setSaved] = useState<{ config: HumanConfig; image: string | null } | null>(null);
  const [devOpen, setDevOpen] = useState(!qp.has('bare'));
  const options = useMemo<HumanEditorOptions>(() => ({ gender, sections, detailRange: natural ? 0.7 : 1 }), [gender, sections, natural]);

  if (error) return <p style={{ padding: 24 }}>Couldn't load the avatar assets: {error.message}</p>;
  if (!pkg) return <p style={{ padding: 24, color: '#666' }}>Loading avatar…</p>;
  const toggle = (id: SectionId) => setSections((s) => (s.includes(id) ? s.filter((x) => x !== id) : ALL_SECTIONS.filter((x) => x === id || s.includes(x))));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {devOpen && (
        <div style={bar}>
          <b>Developer options</b>
          <label>Gender{' '}
            <select value={gender} onChange={(e) => setGender(e.target.value as any)}>
              <option value="female">female only</option><option value="male">male only</option><option value="any">any</option>
            </select>
          </label>
          <label><input type="checkbox" checked={natural} onChange={(e) => setNatural(e.target.checked)} /> natural slider range</label>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ALL_SECTIONS.map((id) => (
              <label key={id} style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={sections.includes(id)} onChange={() => toggle(id)} /> {id}</label>
            ))}
          </span>
          <code style={{ color: '#666' }}>{`<HumanEditor options={${JSON.stringify(options)}} />`}</code>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, padding: devOpen ? '0 12px 12px' : 0 }}>
        <HumanEditor key={gender} pkg={pkg} options={options} selfie onSave={(config, image) => setSaved({ config, image })} saveLabel="Save avatar" />
      </div>
      <button onClick={() => setDevOpen((v) => !v)} style={devToggle}>{devOpen ? 'Hide' : 'Show'} developer options</button>
      {saved && (
        <div style={modal} onClick={() => setSaved(null)}>
          <div style={card} onClick={(e) => e.stopPropagation()}>
            <b>Saved: store this JSON in your backend</b>
            {saved.image && <img src={saved.image} style={{ width: 160, borderRadius: 12, alignSelf: 'center' }} />}
            <pre style={{ maxHeight: 260, overflow: 'auto', background: '#f4f5f7', padding: 8, fontSize: 11 }}>{JSON.stringify(saved.config, null, 1)}</pre>
            <button onClick={() => setSaved(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

const bar: React.CSSProperties = { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', fontSize: 12 };
const devToggle: React.CSSProperties = { position: 'fixed', right: 12, bottom: 12, border: '1px solid #d5d8dd', background: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 11, cursor: 'pointer', opacity: 0.8 };
const modal: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'grid', placeItems: 'center', padding: 16 };
const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 16, width: 'min(420px, 100%)', display: 'flex', flexDirection: 'column', gap: 10 };

createRoot(document.getElementById('root')!).render(<App />);
