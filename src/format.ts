// 时间格式化
// 规则:秒 → "0:00" / "M:SS" / "H:MM:SS" 切换点为 60s / 1h

const PAD2 = (n: number) => n.toString().padStart(2, '0');

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${PAD2(m)}:${PAD2(s)}`;
  return `${m}:${PAD2(s)}`;
}

export function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '—';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${PAD2(d.getMonth() + 1)}-${PAD2(d.getDate())} ${PAD2(d.getHours())}:${PAD2(d.getMinutes())}`;
}
