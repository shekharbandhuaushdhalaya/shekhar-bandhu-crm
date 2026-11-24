const express = require('express');
const request = require('supertest');

jest.mock('../models/BatchProduction');
jest.mock('../models/BillOfMaterials');
jest.mock('../models/ManufacturingUnit');
jest.mock('../models/Product');
jest.mock('../models/RawMaterial');
jest.mock('../models/RawMaterialEntry');
jest.mock('../models/RolePermission');
jest.mock('../models/TrainingRecord');
jest.mock('../models/LineClearance');
jest.mock('../utils/transactionHelper', () => ({
  runWithTransaction: jest.fn(work => work({}))
}));
jest.mock('../services/manufacturingWarehouseService', () => ({
  resolveManufacturingWarehouse: jest.fn().mockResolvedValue({
    _id: '507f1f77bcf86cd799439099',
    name: 'Manufacturing Store'
  })
}));

const BatchProduction = require('../models/BatchProduction');
const BillOfMaterials = require('../models/BillOfMaterials');
const ManufacturingUnit = require('../models/ManufacturingUnit');
const Product = require('../models/Product');
const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const RolePermission = require('../models/RolePermission');
const TrainingRecord = require('../models/TrainingRecord');
const LineClearance = require('../models/LineClearance');
const router = require('../routes/manufacturing/batchProductions');

describe('Batch production material reservation gate', () => {
  let app;
  const userId = '507f1f77bcf86cd799439011';
  const productId = '507f1f77bcf86cd799439012';
  const bomId = '507f1f77bcf86cd799439013';
  const unitId = '507f1f77bcf86cd799439014';
  const formulaMaterialId = '507f1f77bcf86cd799439015';
  const packagingMaterialId = '507f1f77bcf86cd799439016';
  const warehouseId = '507f1f77bcf86cd799439099';

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: userId, name: 'Manufacturing Operator', role: 'admin' };
      next();
    });
    app.use('/api/batch-productions', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    ManufacturingUnit.findById.mockReturnValue({ session: jest.fn().mockResolvedValue({ _id: unitId, name: 'Unit 1' }) });
    BatchProduction.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
    Product.findById.mockReturnValue({ session: jest.fn().mockResolvedValue({ _id: productId, name: 'Test Product' }) });
    BillOfMaterials.findById.mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: bomId, productId, isActive: true, recipeName: 'Pinned Formula',
        formulationBasis: 100, formulationBasisUnit: 'ml',
        stages: [
          { name: 'Mixing', targetDurationHours: 2 },
          { name: 'Packaging & Labeling', targetDurationHours: 2 }
        ],
        ingredients: [
          { rawMaterialId: formulaMaterialId, qtyRequired: 10, itemType: 'formulation' },
          { rawMaterialId: packagingMaterialId, qtyRequired: 1, itemType: 'packaging' }
        ]
      })
    });
    const materials = {
      [formulaMaterialId]: { _id: formulaMaterialId, name: 'Herbal Base', unit: 'kg', category: 'Herb' },
      [packagingMaterialId]: { _id: packagingMaterialId, name: 'Bottle', unit: 'pcs', category: 'Packaging' }
    };
    RawMaterial.findById.mockImplementation(id => ({
      session: jest.fn().mockResolvedValue(materials[String(id)])
    }));
    const entries = {
      [formulaMaterialId]: {
        _id: '507f1f77bcf86cd799439021', rawMaterialId: formulaMaterialId,
        batchNo: 'HERB-LOT-01', qty: 100, reservedQty: 0, issuedQty: 0,
        qcStatus: 'approved', warehouseId, purchaseRate: 2,
        expiryDate: new Date('2027-12-31T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z'),
        save: jest.fn().mockResolvedValue(true)
      },
      [packagingMaterialId]: {
        _id: '507f1f77bcf86cd799439022', rawMaterialId: packagingMaterialId,
        batchNo: 'BOTTLE-LOT-01', qty: 500, reservedQty: 0, issuedQty: 0,
        qcStatus: 'approved', warehouseId, purchaseRate: 1,
        expiryDate: new Date('2027-12-31T00:00:00.000Z'), createdAt: new Date('2026-01-02T00:00:00.000Z'),
        save: jest.fn().mockResolvedValue(true)
      }
    };
    RawMaterialEntry.find.mockImplementation(filter => ({
      session: jest.fn().mockResolvedValue([entries[String(filter.rawMaterialId)]])
    }));
    BatchProduction.create.mockImplementation(async docs => docs);
    app.entries = entries;
  });

  test('reserves untagged formulation and packaging lots without consuming or issuing stock', async () => {
    const res = await request(app).post('/api/batch-productions').send({
      batchNo: 'BATCH-RESERVE-01', productId, bomId, plannedQty: 100, manufacturingUnitId: unitId
    });
    expect(res.status).toBe(201);
    const created = BatchProduction.create.mock.calls[0][0][0];
    expect(created.status).toBe('draft');
    expect(created.stages[0].status).toBe('pending');
    expect(created.stages[0].startedAt).toBeNull();
    expect(created.ingredientsConsumed).toEqual([]);
    expect(created.rawMaterialCost).toBe(0);
    expect(created.ingredientsReserved).toHaveLength(2);
    expect(created.ingredientsReserved[0].stageName).toBe('Mixing');
    expect(created.ingredientsReserved[1].stageName).toBe('Packaging & Labeling');
    expect(created.bomSnapshot.formulationBasisUnit).toBe('ml');
    expect(created.bomSnapshot.ingredients.map(item => item.qtyRequiredForBatch)).toEqual([10, 100]);
    expect(created.bomSnapshot.ingredients.map(item => item.stageName)).toEqual(['Mixing', 'Packaging & Labeling']);
    expect(app.entries[formulaMaterialId].qty).toBe(100);
    expect(app.entries[formulaMaterialId].reservedQty).toBe(10);
    expect(app.entries[formulaMaterialId].issuedQty).toBe(0);
    expect(app.entries[packagingMaterialId].qty).toBe(500);
    expect(app.entries[packagingMaterialId].reservedQty).toBe(100);
    expect(app.entries[packagingMaterialId].issuedQty).toBe(0);
  });

  test('does not start production without signed line clearance and pre-execution BMR approval', async () => {
    const batch = {
      _id: '507f1f77bcf86cd799439041', status: 'draft',
      stages: [{ name: 'Mixing', status: 'pending' }],
      save: jest.fn().mockResolvedValue(true)
    };
    BatchProduction.findById.mockResolvedValue(batch);
    LineClearance.findOne.mockResolvedValue(null);
    const res = await request(app).patch('/api/batch-productions/' + batch._id + '/stage/0')
      .send({ status: 'in_progress' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('signed manufacturing line-clearance');
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('starts a draft batch only after complete line clearance and BMR approval', async () => {
    const batch = {
      _id: '507f1f77bcf86cd799439042', status: 'draft',
      bmrApprovedBy: userId, bmrApprovedByName: 'BMR Reviewer', bmrApprovedAt: new Date(),
      stages: [{ name: 'Mixing', status: 'pending' }],
      save: jest.fn().mockResolvedValue(true)
    };
    BatchProduction.findById.mockResolvedValue(batch);
    LineClearance.findOne.mockResolvedValue({
      cleared: true, submittedBy: '507f1f77bcf86cd799439044', submittedByName: 'Line Operator', submittedAt: new Date(),
      clearedBy: '507f1f77bcf86cd799439043', clearedAt: new Date(),
      verifiedBy: '507f1f77bcf86cd799439043', verifiedByName: 'Independent Reviewer', verifiedAt: new Date(),
      checklist: {
        equipmentCleaned: true, previousMaterialsRemoved: true,
        previousLabelsDocumentsRemoved: true, areaVisuallyInspected: true
      }
    });
    const res = await request(app).patch('/api/batch-productions/' + batch._id + '/stage/0')
      .send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(batch.status).toBe('in_progress');
    expect(batch.stages[0].status).toBe('in_progress');
    expect(batch.stages[0].startedAt).toBeInstanceOf(Date);
    expect(batch.save).toHaveBeenCalled();
  });

  test('legacy consumption without a stage index cannot satisfy the dispensing gate', async () => {
    const batch = {
      _id: '507f1f77bcf86cd799439031',
      status: 'in_progress',
      batchNo: 'BATCH-LEGACY-01',
      stages: [{ name: 'Mixing', status: 'in_progress' }],
      bomSnapshot: {
        formulationBasis: 100,
        ingredients: [{
          rawMaterialId: formulaMaterialId, itemType: 'formulation',
          qtyRequired: 10, qtyRequiredForBatch: 10, stageName: 'Mixing'
        }]
      },
      ingredientsConsumed: [{
        rawMaterialId: formulaMaterialId, qtyConsumed: 10, stageIndex: null
      }],
      ingredientsReserved: [],
      save: jest.fn().mockResolvedValue(true)
    };
    BatchProduction.findById.mockResolvedValue(batch);
    TrainingRecord.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'training-1', topic: 'Mixing' })
    });
    const res = await request(app).patch('/api/batch-productions/' + batch._id + '/stage/0').send({ status: 'completed' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MATERIAL_DISPENSING_REQUIRED');
    expect(res.body.verifiedDispensedQty).toBe(0);
    expect(batch.save).not.toHaveBeenCalled();
  });
});
