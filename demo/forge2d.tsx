// 2D avatar creator demo:  npm run demo  ->  /forge2d.html
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ForgeEditor } from '../src/forge2d/ForgeEditor';

createRoot(document.getElementById('root')!).render(<ForgeEditor onChange={(c) => ((window as any).__config = c)} />);
