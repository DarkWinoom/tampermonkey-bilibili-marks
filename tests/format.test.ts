import { describe, it, expect } from 'vitest';
import { formatTime, formatDate } from '../src/format';

describe('formatTime', () => {
  it('formats whole seconds under 1 minute as "0:SS"', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(59)).toBe('0:59');
  });

  it('formats minutes as "M:SS" without zero pad for minutes', () => {
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(125)).toBe('2:05');
    expect(formatTime(599)).toBe('9:59');
  });

  it('formats long videos as "H:MM:SS"', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(7325)).toBe('2:02:05');
  });

  it('rounds down fractional seconds to avoid "1:00" for 59.9s', () => {
    // B 站 currentTime 是浮点;59.9s 应该显示 "0:59" 而非 "1:00"
    expect(formatTime(59.9)).toBe('0:59');
  });

  it('handles negative or NaN as "0:00"', () => {
    expect(formatTime(-5)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
});

describe('formatDate', () => {
  it('formats timestamp as YYYY-MM-DD HH:mm', () => {
    const ts = new Date(2024, 0, 15, 10, 30, 0).getTime();
    expect(formatDate(ts)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('returns "—" for invalid timestamps', () => {
    expect(formatDate(Number.NaN)).toBe('—');
    expect(formatDate(0)).toBe('—');
  });
});
