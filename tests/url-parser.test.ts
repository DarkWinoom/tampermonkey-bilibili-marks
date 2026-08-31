// B 站 URL 解析与拼装:覆盖常见参数和边界
import { describe, it, expect } from 'vitest';
import { parseBiliUrl, buildBiliUrl } from '../src/url-parser';

// 测试用真实格式的 BV 号(BV + 10 字符 base58)
const BV = 'BV1xx411c7mD';

describe('parseBiliUrl', () => {
  it('parses bare /video/BVxxxx', () => {
    expect(parseBiliUrl(`https://www.bilibili.com/video/${BV}`)).toEqual({
      bvid: BV,
      p: 1,
      time: 0,
    });
  });

  it('parses ?p=N (分P)', () => {
    expect(parseBiliUrl(`https://www.bilibili.com/video/${BV}?p=3`)).toEqual({
      bvid: BV,
      p: 3,
      time: 0,
    });
  });

  it('parses ?t=N (秒)', () => {
    expect(parseBiliUrl(`https://www.bilibili.com/video/${BV}?t=120`)).toEqual({
      bvid: BV,
      p: 1,
      time: 120,
    });
  });

  it('parses combined ?p=N&t=N', () => {
    expect(parseBiliUrl(`https://www.bilibili.com/video/${BV}?p=3&t=120`)).toEqual({
      bvid: BV,
      p: 3,
      time: 120,
    });
  });

  it('ignores tracking params (vd_source / spm / etc)', () => {
    const url = `https://www.bilibili.com/video/${BV}?p=2&t=90&vd_source=abc&spm_id_from=xyz`;
    expect(parseBiliUrl(url)).toEqual({ bvid: BV, p: 2, time: 90 });
  });

  it('clamps p to >= 1 and rounds', () => {
    expect(parseBiliUrl(`https://www.bilibili.com/video/${BV}?p=0`)!.p).toBe(1);
    expect(parseBiliUrl(`https://www.bilibili.com/video/${BV}?p=2.7`)!.p).toBe(2);
  });

  it('clamps time to >= 0 and rounds down', () => {
    expect(parseBiliUrl(`https://www.bilibili.com/video/${BV}?t=-5`)!.time).toBe(0);
    expect(parseBiliUrl(`https://www.bilibili.com/video/${BV}?t=120.9`)!.time).toBe(120);
  });

  it('parses ?t=1m30s form (B 站分享卡常用)', () => {
    expect(parseBiliUrl(`https://www.bilibili.com/video/${BV}?t=1m30s`)).toEqual({
      bvid: BV,
      p: 1,
      time: 90,
    });
  });

  it('returns null for non-video URLs', () => {
    expect(parseBiliUrl('https://www.bilibili.com/')).toBeNull();
    expect(parseBiliUrl('https://example.com/video/BV1xx')).toBeNull();
    expect(parseBiliUrl('not-a-url')).toBeNull();
  });

  it('accepts relative paths', () => {
    expect(parseBiliUrl(`/video/${BV}?p=2&t=30`)).toEqual({ bvid: BV, p: 2, time: 30 });
  });

  it('parses bangumi ep<id> URLs', () => {
    expect(parseBiliUrl('https://www.bilibili.com/bangumi/play/ep12345')).toEqual({
      bvid: 'ep12345', p: 1, time: 0,
    });
  });

  it('parses bangumi ss<id> URLs (preserves ss prefix)', () => {
    expect(parseBiliUrl('https://www.bilibili.com/bangumi/play/ss67890')).toEqual({
      bvid: 'ss67890', p: 1, time: 0,
    });
  });

  it('parses bangumi URL with t= query', () => {
    expect(parseBiliUrl('https://www.bilibili.com/bangumi/play/ep12345?t=120')).toEqual({
      bvid: 'ep12345', p: 1, time: 120,
    });
  });
});

describe('buildBiliUrl', () => {
  it('builds minimal URL when p=1 and time=0', () => {
    expect(buildBiliUrl({ bvid: BV, p: 1, time: 0 })).toBe(
      `https://www.bilibili.com/video/${BV}`,
    );
  });

  it('includes ?p= when p > 1', () => {
    expect(buildBiliUrl({ bvid: BV, p: 3, time: 0 })).toBe(
      `https://www.bilibili.com/video/${BV}?p=3`,
    );
  });

  it('includes &t= when time > 0', () => {
    expect(buildBiliUrl({ bvid: BV, p: 1, time: 120 })).toBe(
      `https://www.bilibili.com/video/${BV}?t=120`,
    );
  });

  it('combines p and t', () => {
    expect(buildBiliUrl({ bvid: BV, p: 3, time: 120 })).toBe(
      `https://www.bilibili.com/video/${BV}?p=3&t=120`,
    );
  });

  it('rounds time to integer seconds', () => {
    expect(buildBiliUrl({ bvid: BV, p: 1, time: 120.9 })).toBe(
      `https://www.bilibili.com/video/${BV}?t=120`,
    );
  });

  it('round-trips through parseBiliUrl', () => {
    const cases = [
      { bvid: BV, p: 1, time: 0 },
      { bvid: BV, p: 5, time: 0 },
      { bvid: BV, p: 1, time: 3661 },
      { bvid: BV, p: 12, time: 999 },
      { bvid: 'ep12345', p: 1, time: 0 },
      { bvid: 'ss67890', p: 1, time: 0 },
      { bvid: 'ep12345', p: 1, time: 120 },
    ];
    for (const k of cases) {
      expect(parseBiliUrl(buildBiliUrl(k))).toEqual(k);
    }
  });

  it('builds bangumi ep<id> URL (not /video/)', () => {
    expect(buildBiliUrl({ bvid: 'ep12345', p: 1, time: 0 })).toBe(
      'https://www.bilibili.com/bangumi/play/ep12345',
    );
  });

  it('builds bangumi ss<id> URL (preserves ss prefix)', () => {
    expect(buildBiliUrl({ bvid: 'ss67890', p: 1, time: 0 })).toBe(
      'https://www.bilibili.com/bangumi/play/ss67890',
    );
  });

  it('builds bangumi URL with t= query', () => {
    expect(buildBiliUrl({ bvid: 'ep12345', p: 1, time: 120 })).toBe(
      'https://www.bilibili.com/bangumi/play/ep12345?t=120',
    );
  });
});
