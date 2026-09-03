const RawMaterial = require('../models/RawMaterial');

describe('RawMaterial duplicate prevention helpers', () => {
  it('normalizes names by trimming, collapsing spaces, and lowercasing', () => {
    expect(RawMaterial.normalizeName('  Turmeric   Powder  ')).toBe('turmeric powder');
    expect(RawMaterial.normalizeName('ASHWAGANDHA')).toBe('ashwagandha');
    expect(RawMaterial.normalizeName('')).toBe('');
  });
});
