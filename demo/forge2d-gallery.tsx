// Visual review gallery for the 2D avatar creator:  npm run demo:forge2d  ->  /forge2d-gallery.html
// Shows representative combinations grouped by what they are meant to prove, plus combination statistics.
// Automated pixel checks live in tools/forge2d/qa.mts; this page is for human eyes.
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderAvatarSvg } from '../src/forge2d/render';
import { DEFAULT_CONFIG } from '../src/forge2d/defaults';
import { randomConfig } from '../src/forge2d/random';
import { buildManifest } from '../src/forge2d/manifest';
import { computeStats, formatBig } from '../src/forge2d/stats';
import { SKIN_TONES } from '../src/forge2d/palette';
import type { AvatarConfig } from '../src/forge2d/types';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const mk = (f: (c: any) => void): AvatarConfig => { const c = clone(DEFAULT_CONFIG) as any; f(c); return c; };
const ids = (cat: string) => buildManifest().filter((e) => e.category === cat).map((e) => e.optionId);

interface Item { label: string; cfg: AvatarConfig; crop?: [number, number, number, number] }
const UP: [number, number, number, number] = [30, 6, 340, 440];
const LOW: [number, number, number, number] = [28, 322, 344, 366];

const SECTIONS: { title: string; note: string; items: Item[]; cols?: number }[] = [
  { title: 'Skin tones', note: '12 tones, same face, hair and outfit.', cols: 6, items: SKIN_TONES.map((s) => ({ label: s.name, cfg: mk((c) => { c.face.skin = s.id; }), crop: UP })) },
  { title: 'Face shapes × expressions', note: 'Features stay aligned for every shape and mood.', cols: 7,
    items: ['oval', 'round', 'heart', 'square', 'long', 'diamond'].flatMap((shape) => ['neutral', 'happy', 'excited', 'thoughtful', 'confident', 'sad', 'surprised'].map((e) => ({ label: `${shape} · ${e}`, cfg: mk((c) => { c.face.shape = shape; c.expression = e; c.hair.style = 'none'; c.outfit.outer = 'none'; }), crop: [120, 50, 160, 160] as [number, number, number, number] }))) },
  { title: 'Hairstyles', note: 'Short, medium and long; straight, wavy, curly and coily; updos and braids.', cols: 7, items: ids('hair').map((h, i) => ({ label: h, cfg: mk((c) => { c.hair.style = h; c.face.skin = SKIN_TONES[[3, 5, 7, 2, 9, 4, 8][i % 7]].id; c.outfit.outer = 'none'; }), crop: UP })) },
  { title: 'Head coverings', note: 'Hijabs (8 wraps, 4 fabrics), turbans and hats. Hair is fully hidden under coverings.', cols: 8,
    items: ids('headwear').map((h, i) => ({ label: h, cfg: mk((c) => { c.headwear.style = h; c.headwear.fabric = ['jersey', 'chiffon', 'satin', 'matte'][i % 4]; c.headwear.color = ['#c4b6e6', '#243255', '#f3f0ea', '#2f5b4a', '#202126', '#d98aa1', '#9db69b', '#762235'][i % 8]; c.outfit.outer = 'none'; c.face.shape = ['oval', 'round', 'heart', 'square', 'long', 'diamond'][i % 6]; }), crop: UP })) },
  { title: 'Tops', note: 'Fitted, loose, knitted, hooded and collared.', cols: 8, items: ids('top').map((t, i) => ({ label: t, cfg: mk((c) => { c.outfit.top = t; c.outfit.outer = 'none'; c.outfit.topColor = ['#9cc4ea', '#f0c4c8', '#2f5b4a', '#e8dcc4', '#202126', '#d3a232', '#c4b6e6', '#ea7a68'][i % 8]; c.hair.style = 'medium-straight'; }), crop: UP })) },
  { title: 'Jackets & coats', note: 'Layered over a tee; the outer layer is never narrower than the top beneath.', cols: 8, items: ids('outer').map((t, i) => ({ label: t, cfg: mk((c) => { c.outfit.outer = t; c.outfit.outerColor = ['#e8dcc4', '#e8dcc4', '#7396c0', '#762235', '#f3f0ea', '#2f5b4a', '#6f7440', '#b98c5c'][i % 8]; c.hair.style = 'wavy-medium'; }), crop: [10, 6, 380, 640] as [number, number, number, number] })) },
  { title: 'Bottoms', note: 'Jeans, trousers, shorts and skirts.', cols: 8, items: ids('bottom').map((b, i) => ({ label: b, cfg: mk((c) => { c.outfit.bottom = b; c.outfit.outer = 'none'; c.outfit.bottomColor = ['#a9c3de', '#7396c0', '#36507a', '#9a9da3', '#202126', '#762235', '#2f5b4a', '#b98c5c'][i % 8]; }), crop: LOW })) },
  { title: 'Dresses, modest & traditional wear', note: 'Abaya, jalabiya, kaftan, shalwar kameez and everyday dresses.', cols: 6, items: ids('dress').map((d, i) => ({ label: d, cfg: mk((c) => { c.outfit.dress = d; c.outfit.outer = 'none'; c.outfit.dressColor = ['#2f5b4a', '#c4b6e6', '#762235', '#3b62c6', '#e8dcc4', '#202126', '#2f8a8c', '#d98aa1', '#9db69b', '#693565'][i % 10]; c.hair.style = 'long-curtain'; }) })) },
  { title: 'Shoes', note: 'Sneakers, boots, flats, pumps and sandals.', cols: 9, items: ids('shoes').map((s) => ({ label: s, cfg: mk((c) => { c.outfit.shoes = s; c.outfit.bottom = 'straight-jeans'; c.outfit.outer = 'none'; }), crop: [64, 552, 272, 142] as [number, number, number, number] })) },
  { title: 'Glasses, earrings, necklaces, scarves, bags', note: 'Accessories on the same base look.', cols: 8,
    items: [
      ...ids('glasses').map((g) => ({ label: `glasses · ${g}`, cfg: mk((c) => { c.accessories.glasses = g; }), crop: UP })),
      ...ids('earrings').map((g) => ({ label: `earrings · ${g}`, cfg: mk((c) => { c.accessories.earrings = g; c.hair.style = 'pony-high'; }), crop: UP })),
      ...ids('necklace').map((g) => ({ label: `necklace · ${g}`, cfg: mk((c) => { c.accessories.necklace = g; c.outfit.top = 'tee'; c.outfit.outer = 'none'; c.hair.style = 'pony-high'; }), crop: UP })),
      ...ids('scarf').map((g) => ({ label: `scarf · ${g}`, cfg: mk((c) => { c.accessories.scarf = g; c.outfit.outer = 'none'; c.outfit.top = 'tee'; }), crop: UP })),
      ...ids('bag').map((g) => ({ label: `bag · ${g}`, cfg: mk((c) => { c.accessories.bag = g; c.outfit.outer = 'none'; }), crop: [20, 240, 360, 300] as [number, number, number, number] })),
      ...ids('hairAccessory').map((g) => ({ label: `hair · ${g}`, cfg: mk((c) => { c.accessories.hairAccessory = g; c.hair.style = 'long-center'; }), crop: UP })),
    ] },
  { title: 'Poses', note: 'Sleeves, hands and layers follow one shared skeleton.', cols: 7, items: ['relaxed', 'crossed', 'shy', 'shrug', 'wave', 'hip', 'chin'].map((p) => ({ label: p, cfg: mk((c) => { c.pose = p; c.outfit.outer = p === 'shy' ? 'denim-jacket' : 'puffer-crop'; }), crop: UP })) },
  { title: 'Randomised avatars', note: 'Seeded, validated and coordinated: 48 random looks.', cols: 8, items: Array.from({ length: 48 }, (_, i) => ({ label: `seed ${i + 1}`, cfg: randomConfig(i + 1) })) },
];

function Cell({ item }: { item: Item }) {
  const { svg, ms } = useMemo(() => {
    const t0 = performance.now();
    const s = renderAvatarSvg(item.cfg, { viewBox: item.crop, width: 260, fast: false, uid: 'g' + Math.random().toString(36).slice(2, 8) });
    return { svg: s, ms: performance.now() - t0 };
  }, [item]);
  return <figure style={{ margin: 0, background: '#fff', border: '1px solid #e3e0ee', borderRadius: 14, padding: 6, textAlign: 'center' }}>
    <div style={{ lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
    <figcaption style={{ font: '12px system-ui', color: '#5b5775', padding: '4px 0 2px' }}>{item.label} <span style={{ opacity: .5 }}>· {ms.toFixed(1)} ms</span></figcaption>
  </figure>;
}

function Stats({ review }: { review: any }) {
  const s = useMemo(() => computeStats(review ?? undefined), [review]);
  const m = useMemo(() => buildManifest(), []);
  const by = (st: string) => m.filter((e) => (review?.approved?.includes(e.id) ? 'approved' : review?.tested?.includes(e.id) ? 'tested' : 'draft') === st).length;
  const rows: [string, string, string][] = [
    ['Theoretical combinations (shapes only)', formatBig(s.theoretical), 'every option independent'],
    ['Permitted by the rules', formatBig(s.permitted), 'no error rule violated (e.g. hats vs updos)'],
    ['Visually distinct', formatBig(s.visuallyDistinct), 'after hidden elements are collapsed (hijab hides hair, dress replaces top and bottom...)'],
    ['… with every colour choice', formatBig(s.withColours.visuallyDistinct), 'upper bound, not a promise that each one looks good'],
    ['Combinations actually tested', s.tested.toLocaleString('en-US'), review ? `automated pixel checks, ${review.generatedAt}` : 'no review file — run npm run qa:forge2d'],
    ['Approved for release', s.approved.toLocaleString('en-US'), 'human sign-off only'],
    ['Assets (draft / tested / approved)', `${m.length} (${by('draft')} / ${by('tested')} / ${by('approved')})`, 'from the manifest + review file'],
  ];
  return <table style={{ borderCollapse: 'collapse', font: '14px system-ui', width: '100%', maxWidth: 900 }}>
    <tbody>{rows.map(([a, b, c]) => <tr key={a} style={{ borderBottom: '1px solid #e3e0ee' }}><td style={{ padding: '8px 12px 8px 0', fontWeight: 600 }}>{a}</td><td style={{ padding: 8, fontVariantNumeric: 'tabular-nums' }}>{b}</td><td style={{ padding: 8, color: '#7a7592' }}>{c}</td></tr>)}</tbody>
  </table>;
}

function App() {
  const [review, setReview] = useState<any>(null);
  const [perf, setPerf] = useState('');
  useEffect(() => { fetch('/forge2d/review.json').then((r) => (r.ok ? r.json() : null)).then(setReview).catch(() => {}); }, []);
  useEffect(() => {
    const t: number[] = [];
    for (let i = 0; i < 60; i++) { const a = performance.now(); renderAvatarSvg(randomConfig(i + 500), { uid: 'p' }); t.push(performance.now() - a); }
    t.sort((a, b) => a - b);
    setPerf(`SVG generation in this browser: median ${t[30].toFixed(1)} ms, p95 ${t[57].toFixed(1)} ms (60 random avatars, full quality)`);
  }, []);
  return (
    <div style={{ font: '14px system-ui', color: '#241f3a', background: '#f5f3fb', padding: '20px 24px 60px', minHeight: '100vh' }}>
      <h1 style={{ margin: '0 0 4px' }}>HumanForge 2D — visual review gallery</h1>
      <p style={{ margin: '0 0 16px', color: '#7a7592', maxWidth: 780 }}>Every picture below is rendered live from the manifest by the same engine as the editor. Automated checks cannot judge artistic quality: please look at these with your own eyes. {perf}</p>
      <Stats review={review} />
      {SECTIONS.map((s) => (
        <section key={s.title} style={{ marginTop: 32 }}>
          <h2 style={{ margin: '0 0 2px', fontSize: 18 }}>{s.title}</h2>
          <p style={{ margin: '0 0 10px', color: '#7a7592' }}>{s.note}</p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${Math.round(1500 / (s.cols ?? 6))}px,1fr))`, gap: 10 }}>{s.items.map((it, i) => <Cell key={i} item={it} />)}</div>
        </section>
      ))}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
