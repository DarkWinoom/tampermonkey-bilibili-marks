import { describe, it, expect } from 'vitest';
import { buildShareHtml } from '../../src/share/export';
import type { ExportPayload, Category, Entry } from '../../src/types';

const cat1: Category = {
  id: 'cat-1',
  name: '名场面',
  icon: '🎬',
  order: 0,
  createdAt: 1700000000000,
};

const cat2: Category = {
  id: 'cat-2',
  name: '教程',
  icon: '📚',
  order: 1,
  createdAt: 1700000000000,
};

const entry1: Entry = {
  id: 'e-1',
  categoryId: 'cat-1',
  bvid: 'BV1xx411c7mD',
  p: 1,
  time: 120,
  label: '经典一幕',
  title: '示例视频',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const entry2: Entry = {
  id: 'e-2',
  categoryId: 'cat-2',
  bvid: 'BV2yy',
  p: 3,
  time: 0,
  label: '零基础入门',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const basePayload: ExportPayload = {
  version: 1,
  exportedAt: 1700000000000,
  source: 'tampermonkey-bilibili-marks',
  data: {
    version: 1,
    categories: [cat1, cat2],
    entries: [entry1, entry2],
  },
};

describe('buildShareHtml', () => {
  it('produces a complete HTML document with DOCTYPE', () => {
    const html = buildShareHtml(basePayload);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('</html>');
  });

  it('replaces all placeholders', () => {
    const html = buildShareHtml(basePayload, '我的收藏');
    expect(html).not.toContain('{{TITLE}}');
    expect(html).not.toContain('{{TOTAL_ENTRIES}}');
    expect(html).not.toContain('{{EXPORTED_AT}}');
    expect(html).not.toContain('{{DATA}}');
    expect(html).toContain('我的收藏');
    expect(html).toContain('共 2 条收藏');
  });

  it('embeds data as JSON in <script id="bm-data">', () => {
    const html = buildShareHtml(basePayload);
    const match = html.match(/<script type="application\/json" id="bm-data">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]!) as ExportPayload;
    expect(parsed.data.categories).toHaveLength(2);
    expect(parsed.data.entries).toHaveLength(2);
  });

  it('handles empty categories', () => {
    const empty: ExportPayload = {
      version: 1,
      exportedAt: 0,
      source: 'test',
      data: { version: 1, categories: [], entries: [] },
    };
    const html = buildShareHtml(empty);
    expect(html).toContain('共 0 条收藏');
    expect(html).toContain('这份收藏夹是空的');
  });

  it('escapes HTML special chars in title', () => {
    const html = buildShareHtml(basePayload, '标题 <script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in data json (when labels contain < or &)', () => {
    const withSpecial: ExportPayload = {
      version: 1,
      exportedAt: 1700000000000,
      source: 'test',
      data: {
        version: 1,
        categories: [cat1],
        entries: [{ ...entry1, label: 'a < b & c' }],
      },
    };
    const html = buildShareHtml(withSpecial);
    // 在 data 注入区,< 和 & 已经被转义
    expect(html).toContain('a &lt; b &amp; c');
  });
});
