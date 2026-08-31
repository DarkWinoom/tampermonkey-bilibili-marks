import { describe, it, expect } from 'vitest';
import { uuid } from '../src/id';

describe('uuid', () => {
  it('generates a valid v4 UUID string', () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates unique ids across many calls', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i += 1) set.add(uuid());
    expect(set.size).toBe(1000);
  });
});
