import { describe, expect, it } from 'vitest';
import { pickWeighted } from './weightedPick';

const items = [
  { name: 'a', weight: 1 },
  { name: 'b', weight: 3 },
];

describe('pickWeighted', () => {
  it('picks by cumulative weight', () => {
    expect(pickWeighted(items, () => 0).name).toBe('a');
    expect(pickWeighted(items, () => 0.24).name).toBe('a'); // roll 0.96, inside a's slice of 1
    expect(pickWeighted(items, () => 0.25).name).toBe('b'); // roll 1.0, first value past a
    expect(pickWeighted(items, () => 0.999).name).toBe('b');
  });

  it('never picks an item with zero weight', () => {
    const withZero = [
      { name: 'none', weight: 0 },
      { name: 'some', weight: 2 },
    ];
    expect(pickWeighted(withZero, () => 0).name).toBe('some');
  });

  it('throws when there is nothing to pick', () => {
    expect(() => pickWeighted([])).toThrow();
  });

  it('throws when the total weight is not positive', () => {
    expect(() => pickWeighted([{ name: 'x', weight: 0 }])).toThrow();
  });

  it('roughly follows the weights over many picks', () => {
    let bCount = 0;
    const runs = 20000;
    for (let i = 0; i < runs; i++) {
      if (pickWeighted(items).name === 'b') bCount++;
    }
    // Expected 75%; allow a wide margin so the test is never flaky.
    expect(bCount / runs).toBeGreaterThan(0.7);
    expect(bCount / runs).toBeLessThan(0.8);
  });
});