// 静态分享页生成 + 下载
import { SHARE_TEMPLATE } from './template';
import { formatDate } from '../format';
import { getDoc } from '../ui/dom';
import type { ExportPayload } from '../types';

const ESCAPE_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = (v: string) => v.replace(/[&<>]/g, (ch) => ESCAPE_MAP[ch] ?? ch);

/** 生成 self-contained HTML(数据以 JSON 嵌入 <script>) */
export function buildShareHtml(payload: ExportPayload, title = 'B 站收藏夹分享'): string {
  return SHARE_TEMPLATE
    .replaceAll('{{TITLE}}', esc(title))
    .replaceAll('{{TOTAL_ENTRIES}}', String(payload.data.entries.length))
    .replaceAll('{{EXPORTED_AT}}', esc(formatDate(payload.exportedAt)))
    .replaceAll('{{DATA}}', esc(JSON.stringify(payload)));
}

/** 触发浏览器下载(走 unsafeWindow.document 兼容沙箱) */
export function downloadShareHtml(payload: ExportPayload, title = 'B 站收藏夹分享'): void {
  const doc = getDoc();
  const a = doc.createElement('a');
  a.href = URL.createObjectURL(new Blob([buildShareHtml(payload, title)], { type: 'text/html;charset=utf-8' }));
  a.download = `bilibili-marks-${payload.exportedAt}.html`;
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
