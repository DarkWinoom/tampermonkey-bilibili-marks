// 数据持久化:GM.setValue 跨 origin 共享,localStorage 兜底(测试用)
import type { Category, Entry, EntryKey, StoreSchema } from './types';
import { EMPTY_STORE } from './types';

const STORE_KEY = 'bm-store';

export interface Store {
  load(): StoreSchema;
  save(schema: StoreSchema): void;
  reset(): void;

  upsertCategory(category: Category): void;
  deleteCategory(id: string): void;

  upsertEntry(entry: Entry): void;
  deleteEntry(id: string): void;
  findEntryByKey(key: EntryKey): Entry | undefined;

  moveEntriesToCategory(fromId: string, toId: string): number;
  moveEntryToTop(id: string): void;
  moveCategoryToTop(id: string): void;
  renameCategory(id: string, newName: string): void;

  import(data: StoreSchema, mode: 'replace' | 'merge'): void;
}

const _GM: { getValue?(k: string): unknown; setValue?(k: string, v: unknown): void; deleteValue?(k: string): void } | null =
  typeof unsafeWindow !== 'undefined' ? (unsafeWindow as unknown as { GM?: any }).GM ?? null : null;

function gmGet(key: string): string | undefined {
  if (_GM?.getValue) return _GM.getValue(key) as string | undefined;
  try { return localStorage.getItem(key) ?? undefined; } catch { return undefined; }
}

function gmSet(key: string, value: unknown): void {
  if (_GM?.setValue) { _GM.setValue(key, value); return; }
  try { localStorage.setItem(key, String(value)); } catch (err) { console.error('[bm] save failed:', err); }
}

function gmDel(key: string): void {
  if (_GM?.deleteValue) { _GM.deleteValue(key); return; }
  try { localStorage.removeItem(key); } catch (err) { console.error('[bm] reset failed:', err); }
}

/** 取 items 中最小的 order(新插入项 = min - 1 即可排到最末,order 降序语义) */
export function getMinOrder<T extends { order?: number }>(items: readonly T[]): number {
  let m = Infinity;
  for (const x of items) m = Math.min(m, x.order ?? 0);
  return Number.isFinite(m) ? m : 0;
}

function parseStored(raw: string | null | undefined): StoreSchema {
  if (typeof raw !== 'string' || !raw) return { ...EMPTY_STORE };
  try {
    const parsed = JSON.parse(raw) as Partial<StoreSchema>;
    if (parsed?.version === 1 && Array.isArray(parsed.categories) && Array.isArray(parsed.entries)) {
      return { version: 1, categories: parsed.categories as Category[], entries: parsed.entries as Entry[] };
    }
  } catch { /* parse failed → empty */ }
  return { ...EMPTY_STORE };
}

export function createStore(): Store {
  function load(): StoreSchema { return parseStored(gmGet(STORE_KEY) as string | null); }
  function save(schema: StoreSchema): void {
    try { gmSet(STORE_KEY, JSON.stringify(schema)); } catch (err) { console.error('[bm] save failed (quota?):', err); }
  }
  function reset(): void {
    try { gmDel(STORE_KEY); } catch (err) { console.error('[bm] reset failed:', err); }
  }

  function upsertCategory(category: Category): void {
    const data = load();
    const idx = data.categories.findIndex((c) => c.id === category.id);
    if (idx >= 0) data.categories[idx] = category; else data.categories.push(category);
    save(data);
  }

  function deleteCategory(id: string): void {
    const data = load();
    data.categories = data.categories.filter((c) => c.id !== id);
    save(data);
  }

  function moveEntriesToCategory(fromId: string, toId: string): number {
    const data = load();
    let count = 0;
    const now = Date.now();
    data.entries = data.entries.map((e) => {
      if (e.categoryId === fromId) { count += 1; return { ...e, categoryId: toId, updatedAt: now }; }
      return e;
    });
    save(data);
    return count;
  }

  function moveEntryToTop(id: string): void {
    const data = load();
    const target = data.entries.find((e) => e.id === id);
    if (!target) return;
    const maxOrder = data.entries
      .filter((e) => e.categoryId === target.categoryId)
      .reduce((m, e) => Math.max(m, e.order ?? 0), 0);
    data.entries = data.entries.map((e) => (e.id === id ? { ...e, order: maxOrder + 1 } : e));
    save(data);
  }

  function moveCategoryToTop(id: string): void {
    const data = load();
    const maxOrder = data.categories.reduce((m, c) => Math.max(m, c.order ?? 0), 0);
    data.categories = data.categories.map((c) => (c.id === id ? { ...c, order: maxOrder + 1 } : c));
    save(data);
  }

  function renameCategory(id: string, newName: string): void {
    const data = load();
    data.categories = data.categories.map((c) => (c.id === id ? { ...c, name: newName } : c));
    save(data);
  }

  function upsertEntry(entry: Entry): void {
    const data = load();
    const idx = data.entries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) data.entries[idx] = entry; else data.entries.push(entry);
    save(data);
  }

  function deleteEntry(id: string): void {
    const data = load();
    data.entries = data.entries.filter((e) => e.id !== id);
    save(data);
  }

  function findEntryByKey(key: EntryKey): Entry | undefined {
    return load().entries.find(
      (e) => e.bvid === key.bvid && e.p === key.p && Math.abs(e.time - key.time) < 0.5,
    );
  }

  function importData(data: StoreSchema, mode: 'replace' | 'merge'): void {
    if (mode === 'replace') { save(data); return; }
    const current = load();
    const catMap = new Map(current.categories.map((c) => [c.id, c]));
    for (const c of data.categories) catMap.set(c.id, c);
    const entryMap = new Map(current.entries.map((e) => [e.id, e]));
    for (const e of data.entries) {
      const existing = entryMap.get(e.id);
      if (!existing || (e.updatedAt ?? 0) > (existing.updatedAt ?? 0)) entryMap.set(e.id, e);
    }
    save({ version: 1, categories: Array.from(catMap.values()), entries: Array.from(entryMap.values()) });
  }

  return {
    load, save, reset,
    upsertCategory, deleteCategory,
    upsertEntry, deleteEntry, findEntryByKey,
    moveEntriesToCategory, moveEntryToTop, moveCategoryToTop, renameCategory,
    import: importData,
  };
}
