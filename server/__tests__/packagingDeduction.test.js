const { deductPackagingMaterials } = require('../services/batchProductionService');

describe('Packaging issue requires independently verified dispensing', () => {
  test('blocks completion when packaging quantity has not been independently dispensed', async () => {
    const batch = {
      _id: 'batch-1',
      packagingDeducted: false,
      bomSnapshot: {
        ingredients: [{ rawMaterialId: 'material-1', qtyRequired: 1, itemType: 'packaging' }]
      },
      ingredientsReserved: [{ rawMaterialId: 'material-1', qtyReserved: 2000 }],
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
        ingredients: [{ rawMaterialId: 'material-1', qtyRequired: 1, itemType: 'packaging' }]
      },
      ingredientsReserved: [],
      ingredientsConsumed: [{
        rawMaterialId: 'material-1', qtyConsumed: 2000, dispensingNo: 'DSP-000001', stageIndex: 6
      }]
    };

    await expect(deductPackagingMaterials(batch, 2000)).resolves.toBeUndefined();
    expect(batch.packagingDeducted).toBe(true);
    expect(batch.ingredientsConsumed[0].qtyConsumed).toBe(2000);
  });
});
