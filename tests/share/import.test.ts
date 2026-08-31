import { describe, it, expect } from 'vitest';
import { parseImportPayload } from '../../src/share/import';

const validExport = JSON.stringify({
  version: 1,
  exportedAt: 1700000000000,
  source: 'tampermonkey-bilibili-marks',
  data: {
    version: 1,
    categories: [
      { id: 'c1', name: 'A', order: 0, createdAt: 1 },
    ],
    entries: [
      { id: 'e1', categoryId: 'c1', bvid: 'BV1xx411c7mD', p: 1, time: 0, label: 'L', createdAt: 1, updatedAt: 1 },
    ],
  },
});

const validStore = JSON.stringify({
  version: 1,
  categories: [
    { id: 'c1', name: 'A', order: 0, createdAt: 1 },
  ],
  entries: [
    { id: 'e1', categoryId: 'c1', bvid: 'BV1xx411c7mD', p: 1, time: 0, label: 'L', createdAt: 1, updatedAt: 1 },
  ],
});

describe('parseImportPayload', () => {
  it('parses ExportPayload shape', () => {
    const r = parseImportPayload(validExport);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.categories).toHaveLength(1);
      expect(r.data.entries).toHaveLength(1);
    }
  });

  it('parses raw StoreSchema shape', () => {
    const r = parseImportPayload(validStore);
    expect(r.ok).toBe(true);
  });

  it('rejects empty / whitespace', () => {
    expect(parseImportPayload('').ok).toBe(false);
    expect(parseImportPayload('   ').ok).toBe(false);
  });

  it('rejects invalid JSON', () => {
    const r = parseImportPayload('{not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('JSON 解析失败');
  });

  it('rejects non-object root', () => {
    expect(parseImportPayload('"string"').ok).toBe(false);
    expect(parseImportPayload('null').ok).toBe(false);
    expect(parseImportPayload('42').ok).toBe(false);
  });

  it('rejects mismatched schema', () => {
    expect(parseImportPayload(JSON.stringify({ version: 2 })).ok).toBe(false);
    expect(parseImportPayload(JSON.stringify({ version: 1, categories: 'not-array' })).ok).toBe(false);
  });

  it('rejects category with missing field', () => {
    const bad = JSON.stringify({
      version: 1,
      categories: [{ id: 'c1', name: 'A' }], // 缺 order, createdAt
      entries: [],
    });
    const r = parseImportPayload(bad);
    expect(r.ok).toBe(false);
  });

  it('rejects entry referencing unknown category', () => {
    const bad = JSON.stringify({
      version: 1,
      categories: [],
      entries: [{ id: 'e1', categoryId: 'missing', bvid: 'BVxxx', p: 1, time: 0, label: 'L', createdAt: 1, updatedAt: 1 }],
    });
    const r = parseImportPayload(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('不存在的分类');
  });

  it('rejects entry with bad bvid', () => {
    const bad = JSON.stringify({
      version: 1,
      categories: [{ id: 'c1', name: 'A', order: 0, createdAt: 1 }],
      entries: [{ id: 'e1', categoryId: 'c1', bvid: 'XX1xx', p: 1, time: 0, label: 'L', createdAt: 1, updatedAt: 1 }],
    });
    const r = parseImportPayload(bad);
    expect(r.ok).toBe(false);
  });

  it('accepts bangumi bvid (ep<id> format)', () => {
    const ok = JSON.stringify({
      version: 1,
      categories: [{ id: 'c1', name: 'A', order: 0, createdAt: 1 }],
      entries: [{ id: 'e1', categoryId: 'c1', bvid: 'ep12345', p: 1, time: 0, label: 'L', createdAt: 1, updatedAt: 1 }],
    });
    expect(parseImportPayload(ok).ok).toBe(true);
  });

  it('accepts bangumi bvid (ss<id> format)', () => {
    const ok = JSON.stringify({
      version: 1,
      categories: [{ id: 'c1', name: 'A', order: 0, createdAt: 1 }],
      entries: [{ id: 'e1', categoryId: 'c1', bvid: 'ss67890', p: 1, time: 0, label: 'L', createdAt: 1, updatedAt: 1 }],
    });
    expect(parseImportPayload(ok).ok).toBe(true);
  });

  it('rejects duplicate ids', () => {
    const bad = JSON.stringify({
      version: 1,
      categories: [
        { id: 'c1', name: 'A', order: 0, createdAt: 1 },
        { id: 'c1', name: 'B', order: 1, createdAt: 2 },
      ],
      entries: [],
    });
    const r = parseImportPayload(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('重复');
  });
});
