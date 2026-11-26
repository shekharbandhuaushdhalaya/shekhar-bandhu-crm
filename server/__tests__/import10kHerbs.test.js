const { validateRecords } = require('../scripts/import10kHerbs');

describe('medicinal plant import validation', () => {
  test('accepts a valid dataset with botanical and Ayurvedic names', () => {
    const records = [{ ayurvedicName: 'Amla', botanicalName: 'Phyllanthus emblica' }];
    expect(validateRecords(records)).toBe(records);
  });

  test('rejects empty or non-array datasets', () => {
    expect(() => validateRecords([])).toThrow('non-empty JSON array');
    expect(() => validateRecords({ ayurvedicName: 'Amla' })).toThrow('non-empty JSON array');
  });

  test('rejects records without required identifying names', () => {
    expect(() => validateRecords([{ ayurvedicName: 'Amla' }]))
      .toThrow('requires ayurvedicName');
    expect(() => validateRecords([null])).toThrow('must be an object');
  });

  test('accepts commonName and scientificName aliases', () => {
    expect(validateRecords([{ commonName: 'Amla', scientificName: 'Phyllanthus emblica' }]))
      .toHaveLength(1);
  });
});
