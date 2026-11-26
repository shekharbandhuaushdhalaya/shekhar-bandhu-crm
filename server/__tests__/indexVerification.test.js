const { compareIndexes, stableStringify } = require('../utils/indexVerification');

describe('database index verification', () => {
  test('accepts matching key patterns and index options regardless of object key order', () => {
    const expected = [[
      { firmId: 1, key: 1 },
      { unique: true, partialFilterExpression: { active: true, type: 'payment' } }
    ]];
    const actual = [{
      name: 'tenant_key',
      key: { key: 1, firmId: 1 },
      unique: true,
      partialFilterExpression: { type: 'payment', active: true }
    }];

    expect(compareIndexes(expected, actual)).toEqual({ missing: [], mismatched: [] });
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  test('detects a matching key pattern with an incorrect unique constraint', () => {
    const result = compareIndexes(
      [[{ email: 1 }, { unique: true }]],
      [{ key: { email: 1 }, name: 'email_1' }]
    );

    expect(result.missing).toHaveLength(0);
    expect(result.mismatched[0].differences).toContainEqual({
      option: 'unique', expected: true, actual: [false]
    });
  });

  test('detects TTL, sparse, partial-filter and collation mismatches', () => {
    const result = compareIndexes(
      [[{ expiresAt: 1 }, { expireAfterSeconds: 3600, sparse: true, collation: { locale: 'en', strength: 2 } }],
       [{ state: 1 }, { partialFilterExpression: { archived: false } }]],
      [{ key: { expiresAt: 1 }, expireAfterSeconds: 60, collation: { locale: 'en', strength: 1 } },
       { key: { state: 1 }, partialFilterExpression: { archived: true } }]
    );

    expect(result.mismatched).toHaveLength(2);
    expect(result.mismatched[0].differences.map(item => item.option)).toEqual(
      expect.arrayContaining(['expireAfterSeconds', 'sparse', 'collation'])
    );
    expect(result.mismatched[1].differences.map(item => item.option)).toContain('partialFilterExpression');
  });

  test('reports missing indexes and checks explicitly named indexes', () => {
    const result = compareIndexes(
      [[{ tenantId: 1 }, { name: 'tenant_lookup' }], [{ missing: 1 }, {}]],
      [{ key: { tenantId: 1 }, name: 'tenantId_1' }]
    );

    expect(result.missing).toEqual([{ keys: { missing: 1 }, options: {} }]);
    expect(result.mismatched[0].differences).toContainEqual({
      option: 'name', expected: 'tenant_lookup', actual: ['tenantId_1']
    });
  });

  test('does not treat default false flags as mismatches', () => {
    expect(compareIndexes(
      [[{ code: 1 }, {}]],
      [{ key: { code: 1 }, unique: false, sparse: false }]
    )).toEqual({ missing: [], mismatched: [] });
  });
});
