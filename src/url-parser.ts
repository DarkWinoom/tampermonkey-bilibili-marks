// B 站 URL 解析与拼装
// 范围:普通视频 /video/BVxxx?p=N&t=N + 番剧 /bangumi/play/(ep|ss)<id>
// bvid 字段约定:视频 = "BVxxx";番剧 = "ep<id>" 或 "ss<id>"(保留原前缀)
import type { ParsedBiliUrl } from './types';

const VIDEO_PATTERN = /\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10})/i;
const BANGUMI_PATTERN = /\/bangumi\/play\/(ep|ss)(\d+)/i;

export function parseBiliUrl(url: string): ParsedBiliUrl | null {
  if (typeof url !== 'string' || !url) return null;

  const video = url.match(VIDEO_PATTERN);
  const bangumi = url.match(BANGUMI_PATTERN);
  const bvid = video ? video[1]! : bangumi ? bangumi[1]! + bangumi[2]! : null;
  if (!bvid) return null;

  let search: URLSearchParams;
  try {
    const base = url.startsWith('http') ? undefined : 'https://www.bilibili.com';
    search = new URL(url, base).searchParams;
  } catch { return null; }

  const pRaw = search.get('p');
  let p = 1;
  if (pRaw !== null) {
    const n = Number(pRaw);
    if (Number.isFinite(n) && n >= 1) p = Math.max(1, Math.floor(n));
  }

  const tRaw = search.get('t');
  let time = 0;
  if (tRaw !== null && tRaw !== '') {
    const numMatch = tRaw.match(/^(\d+(?:\.\d+)?)$/);
    if (numMatch) {
      const n = Number(numMatch[1]);
      if (Number.isFinite(n) && n >= 0) time = Math.floor(n);
    } else {
      // 1m30s / 1h2m3s 形式
      const m = tRaw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
      if (m && (m[1] || m[2] || m[3])) {
        time = (m[1] ? Number(m[1]) : 0) * 3600
             + (m[2] ? Number(m[2]) : 0) * 60
             + (m[3] ? Number(m[3]) : 0);
      }
    }
  }
  return { bvid, p, time };
}

/** 拼装 B 站 URL。p=1 且 time=0 时给出最简形式。
 * 番剧 (ep<id> / ss<id>) 走 /bangumi/play/,其他走 /video/。 */
export function buildBiliUrl(key: ParsedBiliUrl): string {
  const { bvid, p, time } = key;
  const safeP = Math.max(1, Math.round(p));
  const safeTime = Math.max(0, Math.floor(time));
  const params: string[] = [];
  if (safeP > 1) params.push(`p=${safeP}`);
  if (safeTime > 0) params.push(`t=${safeTime}`);
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  const path = /^(ep|ss)/.test(bvid) ? `/bangumi/play/${bvid}` : `/video/${bvid}`;
  return `https://www.bilibili.com${path}${query}`;
}
