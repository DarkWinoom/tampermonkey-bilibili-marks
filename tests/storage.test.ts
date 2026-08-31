import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, getMinOrder } from '../src/storage';
import { EMPTY_STORE } from '../src/types';
import type { Category, Entry } from '../src/types';

const sampleCategory: Category = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '名场面',
  icon: '🎬',
  order: 0,
  createdAt: 1700000000000,
};

const sampleEntry: Entry = {
  id: '22222222-2222-4222-8222-222222222222',
  categoryId: sampleCategory.id,
  bvid: 'BV1xx411c7mD',
  p: 1,
  time: 120,
  label: '经典一幕',
  title: '示例视频',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

describe('createStore (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns EMPTY_STORE on first read', () => {
    const store = createStore();
    expect(store.load()).toEqual(EMPTY_STORE);
  });

  it('persists categories and entries', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.upsertEntry(sampleEntry);

    // 重新构造一个新 store 实例(模拟刷新),数据应持久
    const store2 = createStore();
    const data = store2.load();
    expect(data.categories).toEqual([sampleCategory]);
    expect(data.entries).toEqual([sampleEntry]);
  });

  it('upsertCategory updates existing by id, appends new', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.upsertCategory({ ...sampleCategory, name: '更新名' });
    expect(store.load().categories[0]?.name).toBe('更新名');
    expect(store.load().categories.length).toBe(1);

    const another: Category = { ...sampleCategory, id: 'new-id', name: '新分类' };
    store.upsertCategory(another);
    expect(store.load().categories.length).toBe(2);
  });

  it('upsertEntry updates existing by id, appends new', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.upsertEntry(sampleEntry);
    store.upsertEntry({ ...sampleEntry, label: '更新标注' });
    expect(store.load().entries[0]?.label).toBe('更新标注');
    expect(store.load().entries.length).toBe(1);

    const another: Entry = { ...sampleEntry, id: 'new-entry-id', bvid: 'BV2' };
    store.upsertEntry(another);
    expect(store.load().entries.length).toBe(2);
  });

  it('deleteCategory removes the category only (caller decides entry fate)', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.upsertEntry(sampleEntry);
    store.deleteCategory(sampleCategory.id);
    const data = store.load();
    expect(data.categories.length).toBe(0);
    // entry 仍然存在(默认行为,调用方负责迁移)
    expect(data.entries.length).toBe(1);
  });

  it('moveEntriesToCategory moves all entries from one category to another', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.upsertCategory({ ...sampleCategory, id: 'cat-2', name: '目标' });
    store.upsertEntry(sampleEntry);
    store.upsertEntry({ ...sampleEntry, id: 'entry-2' });
    const moved = store.moveEntriesToCategory(sampleCategory.id, 'cat-2');
    expect(moved).toBe(2);
    const data = store.load();
    expect(data.entries.every((e) => e.categoryId === 'cat-2')).toBe(true);
  });

  it('moveEntriesToCategory returns 0 when source has no entries', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.upsertCategory({ ...sampleCategory, id: 'cat-2' });
    const moved = store.moveEntriesToCategory(sampleCategory.id, 'cat-2');
    expect(moved).toBe(0);
  });

  it('moveEntryToTop sets order to max+1 in same category, preserves updatedAt', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.upsertEntry({ ...sampleEntry, order: 0 });
    store.upsertEntry({ ...sampleEntry, id: 'e2', order: 0 });
    const beforeUpdated = store.load().entries.find((e) => e.id === sampleEntry.id)!.updatedAt;
    store.moveEntryToTop(sampleEntry.id);
    const data = store.load();
    const top = data.entries.find((e) => e.id === sampleEntry.id)!;
    expect(top.order).toBe(1);
    expect(top.updatedAt).toBe(beforeUpdated); // 不改 updatedAt
  });

  it('moveCategoryToTop sets order to max+1', () => {
    const store = createStore();
    store.upsertCategory({ ...sampleCategory, order: 0 });
    store.upsertCategory({ ...sampleCategory, id: 'cat-2', order: 1 });
    store.moveCategoryToTop('cat-2');
    const data = store.load();
    expect(data.categories.find((c) => c.id === 'cat-2')!.order).toBe(2);
  });

  it('renameCategory updates name', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.renameCategory(sampleCategory.id, '新名字');
    expect(store.load().categories[0]!.name).toBe('新名字');
  });

  it('deleteEntry removes single entry by id', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.upsertEntry(sampleEntry);
    store.upsertEntry({ ...sampleEntry, id: 'other-entry' });
    store.deleteEntry(sampleEntry.id);
    const data = store.load();
    expect(data.entries.length).toBe(1);
    expect(data.entries[0]?.id).toBe('other-entry');
  });

  it('findEntryByKey locates by (bvid, p, time)', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.upsertEntry(sampleEntry);
    const found = store.findEntryByKey({ bvid: 'BV1xx411c7mD', p: 1, time: 120 });
    expect(found?.id).toBe(sampleEntry.id);
  });

  it('findEntryByKey returns undefined for non-existent', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.upsertEntry(sampleEntry);
    expect(store.findEntryByKey({ bvid: 'BVx', p: 1, time: 0 })).toBeUndefined();
  });

  it('import replaces the whole store (replace mode)', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.import(
      {
        version: 1,
        categories: [
          { id: 'c2', name: '新', order: 0, createdAt: 1 },
        ],
        entries: [],
      },
      'replace',
    );
    const data = store.load();
    expect(data.categories.length).toBe(1);
    expect(data.categories[0]?.id).toBe('c2');
  });

  it('import merges by id (merge mode)', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.import(
      {
        version: 1,
        categories: [
          { ...sampleCategory, name: '合并改名' },
          { id: 'c2', name: '新增', order: 0, createdAt: 1 },
        ],
        entries: [],
      },
      'merge',
    );
    const data = store.load();
    expect(data.categories.length).toBe(2);
    expect(data.categories.find((c) => c.id === sampleCategory.id)?.name).toBe('合并改名');
  });

  it('reset clears everything', () => {
    const store = createStore();
    store.upsertCategory(sampleCategory);
    store.upsertEntry(sampleEntry);
    store.reset();
    expect(store.load()).toEqual(EMPTY_STORE);
  });

  it('survives corrupted localStorage value', () => {
    localStorage.setItem('bm-store', '{not valid json');
    const store = createStore();
    expect(store.load()).toEqual(EMPTY_STORE);
  });

  it('survives schema-mismatched localStorage value', () => {
    localStorage.setItem('bm-store', JSON.stringify({ version: 999, foo: 'bar' }));
    const store = createStore();
    expect(store.load()).toEqual(EMPTY_STORE);
  });
});

describe('getMinOrder', () => {
  it('returns 0 for empty list', () => {
    expect(getMinOrder([])).toBe(0);
  });

  it('ignores items with undefined order', () => {
    expect(getMinOrder([{}, {}])).toBe(0);
  });

  it('returns the minimum order across items', () => {
    expect(getMinOrder([{ order: 5 }, { order: 2 }, { order: 7 }])).toBe(2);
    expect(getMinOrder([{ order: -1 }, { order: 0 }])).toBe(-1);
  });
});
