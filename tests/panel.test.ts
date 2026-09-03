import { describe, it, expect } from 'vitest';
import { matchesQuery, filterEntries, filterCategoriesBySearch, highlightInto, UNCATEGORIZED_ID } from '../src/ui/panel';
import { getDoc } from '../src/ui/dom';
import type { Category, Entry } from '../src/types';

const E = (overrides: Partial<Entry>): Entry => ({
  id: 'e', categoryId: 'c', bvid: 'BV1xx411c7mD', p: 1, time: 0, label: 'L',
  createdAt: 0, updatedAt: 0, ...overrides,
});

describe('matchesQuery', () => {
  it('empty query matches anything', () => {
    expect(matchesQuery('hello', '')).toBe(true);
    expect(matchesQuery(undefined, '')).toBe(true);
  });
  it('case-insensitive contains', () => {
    expect(matchesQuery('Hello World', 'world')).toBe(true);
    expect(matchesQuery('BV1xx411c7mD', 'BV1')).toBe(true);
  });
  it('returns false for undefined / empty text with non-empty query', () => {
    expect(matchesQuery(undefined, 'x')).toBe(false);
    expect(matchesQuery('', 'x')).toBe(false);
  });
});

describe('filterEntries', () => {
  const sample: Entry[] = [
    E({ id: '1', label: '周杰伦演唱会', bvid: 'BV111', title: 'Jay Chou Live' }),
    E({ id: '2', label: '周星驰电影', bvid: 'BV222', title: 'Stephen Chow Movie' }),
    E({ id: '3', label: '教学视频', bvid: 'BV333', title: 'JavaScript 入门' }),
    E({ id: '4', label: '无标题', bvid: 'BV1xx', title: undefined }),
  ];

  it('empty query returns all', () => {
    expect(filterEntries(sample, '').map((e) => e.id)).toEqual(['1', '2', '3', '4']);
  });

  it('matches by label', () => {
    // '周杰' 是连续子串,只在 label '周杰伦演唱会' 中出现
    expect(filterEntries(sample, '周杰').map((e) => e.id)).toEqual(['1']);
    // '周' 单字匹配 label 含"周"的两条
    expect(filterEntries(sample, '周').map((e) => e.id)).toEqual(['1', '2']);
  });

  it('matches by bvid (case-insensitive)', () => {
    expect(filterEntries(sample, 'bv222').map((e) => e.id)).toEqual(['2']);
  });

  it('matches by title', () => {
    expect(filterEntries(sample, 'JavaScript').map((e) => e.id)).toEqual(['3']);
  });

  it('whitespace-only query returns all', () => {
    expect(filterEntries(sample, '   ').length).toBe(4);
  });

  it('trims surrounding whitespace in query', () => {
    expect(filterEntries(sample, '  周杰  ').map((e) => e.id)).toEqual(['1']);
  });

  it('returns empty when nothing matches', () => {
    expect(filterEntries(sample, 'nonexistent')).toEqual([]);
  });
});

describe('highlightInto', () => {
  const doc = getDoc();

  it('empty query appends text (does not clear prior children)', () => {
    const el = doc.createElement('span');
    // 关键:之前用 parent.textContent = text 会清掉前面 append 的 children
    // 现在用 appendChild 保留前序内容
    el.appendChild(doc.createTextNode('prefix · '));
    highlightInto(el, 'hello', '');
    expect(el.textContent).toBe('prefix · hello');
    expect(el.querySelector('mark')).toBeNull();
  });

  it('wraps matched substrings in <mark class="bm-hl">', () => {
    const el = doc.createElement('span');
    highlightInto(el, 'Hello World Hello', 'hello');
    const marks = el.querySelectorAll('mark.bm-hl');
    expect(marks.length).toBe(2);
    expect(marks[0]?.textContent).toBe('Hello');
    expect(marks[1]?.textContent).toBe('Hello');
    expect(el.textContent).toBe('Hello World Hello');
  });

  it('preserves original casing in mark text', () => {
    const el = doc.createElement('span');
    highlightInto(el, 'BV1xx411c7mD', 'bv1');
    expect(el.querySelector('mark')?.textContent).toBe('BV1');
  });

  it('no match leaves plain text', () => {
    const el = doc.createElement('span');
    highlightInto(el, 'plain text', 'xyz');
    expect(el.querySelector('mark')).toBeNull();
    expect(el.textContent).toBe('plain text');
  });

  it('XSS-safe: HTML in text is not interpreted', () => {
    const el = doc.createElement('span');
    highlightInto(el, '<img src=x onerror=alert(1)>', 'img');
    // innerHTML 应该包含转义后的字符或 textContent 安全
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

const cat = (id: string, name: string): Category => ({ id, name, order: 0, createdAt: 0 });

describe('filterCategoriesBySearch', () => {
  const categories: Category[] = [
    cat(UNCATEGORIZED_ID, '未分类'),
    cat('c1', '音乐'),
    cat('c2', '电影'),
    cat('c3', '教学'),
  ];
  const entries: Entry[] = [
    E({ id: '1', categoryId: 'c1', label: '周杰伦演唱会' }),
    E({ id: '2', categoryId: 'c2', label: '周星驰电影' }),
    E({ id: '3', categoryId: 'c3', label: 'JavaScript 入门' }),
    E({ id: '4', categoryId: UNCATEGORIZED_ID, label: '未分类笔记' }),
  ];

  it('empty query returns all categories with total counts', () => {
    const r = filterCategoriesBySearch(categories, entries, '');
    expect(r.map((x) => x.category.id)).toEqual([UNCATEGORIZED_ID, 'c1', 'c2', 'c3']);
    expect(r.map((x) => x.count)).toEqual([1, 1, 1, 1]);
  });

  it('hides categories with zero matches', () => {
    // 搜 "JavaScript" — 只 c3 命中
    const r = filterCategoriesBySearch(categories, entries, 'JavaScript');
    const ids = r.map((x) => x.category.id);
    expect(ids).toContain('c3');
    expect(ids).not.toContain('c1');
    expect(ids).not.toContain('c2');
  });

  it('always keeps UNCATEGORIZED even with zero matches', () => {
    // 搜 "不存在的关键词"
    const r = filterCategoriesBySearch(categories, entries, 'nonexistent-xyz');
    const ids = r.map((x) => x.category.id);
    expect(ids).toEqual([UNCATEGORIZED_ID]); // 只剩未分类,即使它也没命中
  });

  it('count reflects match count, not total', () => {
    // 在 c1 加第二条 label 不含 "周杰" 的 entry
    const extra = E({ id: '5', categoryId: 'c1', label: '英文歌' });
    // 搜 "周杰" — c1 命中 1 条
    const r = filterCategoriesBySearch(categories, [...entries, extra], '周杰');
    const c1 = r.find((x) => x.category.id === 'c1');
    expect(c1?.count).toBe(1);
  });

  it('whitespace-only query returns all with total counts', () => {
    const r = filterCategoriesBySearch(categories, entries, '   ');
    expect(r.length).toBe(4);
    expect(r.every((x) => x.count > 0)).toBe(true);
  });
});
