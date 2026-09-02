import { describe, it, expect } from 'vitest';
import { createIcon } from '../src/ui/icon';

describe('createIcon', () => {
  it('returns a #bm-icon container', () => {
    expect(createIcon().id).toBe('bm-icon');
  });

  it('renders 4 letters M / A / R / K in order', () => {
    const letters = createIcon().querySelectorAll('.bm-icon-letter');
    expect(letters.length).toBe(4);
    expect(Array.from(letters).map((el) => el.textContent)).toEqual(['M', 'A', 'R', 'K']);
  });

  it('includes the svg icon circle', () => {
    expect(createIcon().querySelector('.bm-icon-circle svg')).toBeTruthy();
  });
});
