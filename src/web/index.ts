// React (web) components. Import from 'humanforge/web'.
import { useEffect, useState } from 'react';
import { HumanPackage, LoadOptions, loadHumanPackage } from '../human/runtime';

export { HumanCanvas } from './HumanCanvas';
export type { HumanCanvasHandle, HumanCanvasProps } from './HumanCanvas';
export { HumanEditor } from './HumanEditor';
export type { HumanEditorProps } from './HumanEditor';
export * from '../human/editor';
export * from '../human/catalog';

const packages = new Map<string, Promise<HumanPackage>>();
/** Load the human asset package once per URL (shared by every component on the page). */
export function useHumanPackage(baseUrl: string, opts?: LoadOptions) {
  const [pkg, setPkg] = useState<HumanPackage | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let p = packages.get(baseUrl);
    if (!p) {
      p = loadHumanPackage(baseUrl, opts);
      packages.set(baseUrl, p);
      p.catch(() => packages.delete(baseUrl));
    }
    let live = true;
    p.then((v) => live && setPkg(v), (e) => live && setError(e));
    return () => { live = false; };
  }, [baseUrl]);
  return { pkg, error };
}
