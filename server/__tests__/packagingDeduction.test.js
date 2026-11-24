const { deductPackagingMaterials, consumeFromReservation } = require('../services/batchProductionService');

describe('Packaging issue requires independently verified dispensing', () => {
  test('blocks completion when packaging quantity has not been independently dispensed', async () => {
    const batch = {
      _id: 'batch-1',
      packagingDeducted: false,
      bomSnapshot: {
        ingredients: [{ rawMaterialId: 'material-1', qtyRequired: 1, itemType: 'packaging', stageName: 'Packaging & Labeling' }]
      },
      ingredientsReserved: [{ rawMaterialId: 'material-1', qtyReserved: 2000 }],
      stages: [{ name: 'Packaging & Labeling' }],
      ingredientsConsumed: []
    };

    await expect(deductPackagingMaterials(batch, 2000))
      .rejects.toThrow('PACKAGING_DISPENSING_REQUIRED');
    expect(batch.packagingDeducted).toBe(false);
    expect(batch.ingredientsReserved[0].qtyReserved).toBe(2000);
    expect(batch.ingredientsConsumed).toHaveLength(0);
  });

  test('reconciles packaging only after verified dispensing covers actual yield', async () => {
    const batch = {
      _id: 'batch-2',
      packagingDeducted: false,
      bomSnapshot: {
        ingredients: [{ rawMaterialId: 'material-1', qtyRequired: 1, itemType: 'packaging', stageName: 'Packaging & Labeling' }]
      },
      ingredientsReserved: [],
      stages: [{ name: 'Packaging & Labeling' }],
      ingredientsConsumed: [{
        rawMaterialId: 'material-1', qtyConsumed: 2000, dispensingNo: 'DSP-000001', stageIndex: 0
      }]
    };

    await expect(deductPackagingMaterials(batch, 2000)).resolves.toBeUndefined();
    expect(batch.packagingDeducted).toBe(true);
    expect(batch.ingredientsConsumed[0].qtyConsumed).toBe(2000);
  });
  test('does not let consumption from a different stage satisfy packaging requirements', async () => {
    const batch = {
      packagingDeducted: false,
      stages: [{ name: 'Mixing' }, { name: 'Packaging & Labeling' }],
      bomSnapshot: { ingredients: [{
        rawMaterialId: 'material-1', qtyRequired: 1, itemType: 'packaging',
        stageName: 'Packaging & Labeling'
      }] },
      ingredientsConsumed: [{
        rawMaterialId: 'material-1', qtyConsumed: 2000, dispensingNo: 'DSP-MIX-01', stageIndex: 0
      }]
    };
    await expect(deductPackagingMaterials(batch, 2000))
      .rejects.toThrow('PACKAGING_DISPENSING_REQUIRED');
    expect(batch.packagingDeducted).toBe(false);
  });

  test('does not allow legacy unverified consumption without a dispensing reference', async () => {
    const batch = {
      packagingDeducted: false,
      stages: [{ name: 'Packaging & Labeling' }],
      bomSnapshot: { ingredients: [{
        rawMaterialId: 'material-1', qtyRequired: 1, itemType: 'packaging',
        stageName: 'Packaging & Labeling'
      }] },
      ingredientsConsumed: [{
        rawMaterialId: 'material-1', qtyConsumed: 2000, stageIndex: 0
      }]
    };
    await expect(deductPackagingMaterials(batch, 2000))
      .rejects.toThrow('PACKAGING_DISPENSING_REQUIRED');
    expect(batch.packagingDeducted).toBe(false);
  });

  test('blocks legacy direct stock consumption helper and requires verified dispensing', async () => {
    await expect(consumeFromReservation({}, 'material-1', 5))
      .rejects.toMatchObject({ code: 'MATERIAL_DISPENSING_REQUIRED' });
  });

});
