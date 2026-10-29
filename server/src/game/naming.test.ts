import { describe, expect, it } from 'vitest';
import { normalizeGenus, normalizeSpecies } from './naming';

describe('normalizeGenus', () => {
  it('capitalises and trims', () => {
    expect(normalizeGenus('toothosaurus')).toBe('Toothosaurus');
    expect(normalizeGenus('  TOOTHOSAURUS ')).toBe('Toothosaurus');
  });

  it('rejects anything that is not 3 to 30 plain letters', () => {
    expect(normalizeGenus('')).toBeNull();
    expect(normalizeGenus('ab')).toBeNull();
    expect(normalizeGenus('Two Words')).toBeNull();
    expect(normalizeGenus('Rex2')).toBeNull();
    expect(normalizeGenus('Tyrännosaurus')).toBeNull();
    expect(normalizeGenus('a'.repeat(31))).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(normalizeGenus(undefined)).toBeNull();
    expect(normalizeGenus(42)).toBeNull();
    expect(normalizeGenus(null)).toBeNull();
  });
});

describe('normalizeSpecies', () => {
  it('lowercases and trims', () => {
    expect(normalizeSpecies('REX')).toBe('rex');
    expect(normalizeSpecies(' Prorsus ')).toBe('prorsus');
  });

  it('rejects invalid epithets', () => {
    expect(normalizeSpecies('re')).toBeNull();
    expect(normalizeSpecies('rex rex')).toBeNull();
    expect(normalizeSpecies('rex-1')).toBeNull();
    expect(normalizeSpecies(undefined)).toBeNull();
  });
});