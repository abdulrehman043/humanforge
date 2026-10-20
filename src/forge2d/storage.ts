// Saving and restoring avatars. Works with localStorage, AsyncStorage-style adapters or in-memory.
import type { AvatarConfig } from './types';
import { normalizeConfig, ValidationIssue } from './validate';

export interface StorageAdapter { getItem(k: string): string | null | Promise<string | null>; setItem(k: string, v: string): void | Promise<void>; removeItem(k: string): void | Promise<void> }
const PREFIX = 'humanforge.forge2d.v1:';

export const memoryAdapter = (): StorageAdapter => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};
export function defaultAdapter(): StorageAdapter {
  try {
    const ls = (globalThis as any).localStorage as Storage | undefined;
    if (ls) { ls.setItem(PREFIX + 'probe', '1'); ls.removeItem(PREFIX + 'probe'); return ls; }
  } catch { /* blocked storage: fall through */ }
  return memoryAdapter();
}

export interface SavedAvatar { name: string; savedAt: number; config: AvatarConfig }

export class AvatarStore {
  constructor(private adapter: StorageAdapter = defaultAdapter()) {}
  async list(): Promise<string[]> { return JSON.parse((await this.adapter.getItem(PREFIX + 'index')) ?? '[]'); }
  async save(name: string, config: AvatarConfig): Promise<void> {
    const rec: SavedAvatar = { name, savedAt: Date.now(), config };
    await this.adapter.setItem(PREFIX + 'item:' + name, JSON.stringify(rec));
    const idx = new Set(await this.list()); idx.add(name);
    await this.adapter.setItem(PREFIX + 'index', JSON.stringify([...idx]));
  }
  /** Returns the repaired config plus any issues found while restoring (e.g. an asset that no longer exists). */
  async load(name: string): Promise<{ config: AvatarConfig; issues: ValidationIssue[] } | null> {
    const raw = await this.adapter.getItem(PREFIX + 'item:' + name);
    if (!raw) return null;
    try { return normalizeConfig((JSON.parse(raw) as SavedAvatar).config); } catch { return null; }
  }
  async remove(name: string): Promise<void> {
    await this.adapter.removeItem(PREFIX + 'item:' + name);
    await this.adapter.setItem(PREFIX + 'index', JSON.stringify((await this.list()).filter((n) => n !== name)));
  }
}
export const exportConfig = (c: AvatarConfig) => JSON.stringify(c, null, 2);
export const importConfig = (text: string) => normalizeConfig(JSON.parse(text));
