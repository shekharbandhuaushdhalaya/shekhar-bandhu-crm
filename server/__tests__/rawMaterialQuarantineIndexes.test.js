const RawMaterialQuarantine = require('../models/RawMaterialQuarantine');

describe('Raw material quarantine stock-entry uniqueness', () => {
  test('enforces one quarantine record per linked stock entry within each tenant', () => {
    const uniqueIndex = RawMaterialQuarantine.schema.indexes().find(([fields, options]) =>
      fields.firmId === 1 && fields.rawMaterialEntryId === 1 && options.unique === true
    );

    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex[1].partialFilterExpression).toEqual({
      $and: [
        { rawMaterialEntryId: { $type: 'objectId' } },
        { firmId: { $type: 'objectId' } }
      ]
    });
  });
});
