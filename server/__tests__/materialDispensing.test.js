const express = require('express');
const request = require('supertest');

jest.mock('../models/BatchProduction');
jest.mock('../models/RawMaterial');
jest.mock('../models/RawMaterialEntry');
jest.mock('../models/RawMaterialLedger');
jest.mock('../models/MaterialDispensing');
jest.mock('../models/RolePermission');
jest.mock('../utils/withTransaction', () => ({ withTransaction: async work => work({}) }));
jest.mock('../utils/documentCounter', () => ({ generateAtomicDocumentNumber: jest.fn().mockResolvedValue('DSP-000001') }));

const BatchProduction = require('../models/BatchProduction');
const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const RawMaterialLedger = require('../models/RawMaterialLedger');
const MaterialDispensing = require('../models/MaterialDispensing');
const RolePermission = require('../models/RolePermission');
const { generateAtomicDocumentNumber } = require('../utils/documentCounter');
const router = require('../routes/manufacturing/materialDispensing');

describe('Production material dispensing', () => {
  let app, batch, entry, record;
  const operatorId = '507f1f77bcf86cd799439011';
  const reviewerId = '507f1f77bcf86cd799439022';
  const materialId = '507f1f77bcf86cd799439033';
  const entryId = '507f1f77bcf86cd799439044';
  const batchId = '507f1f77bcf86cd799439055';

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: req.headers['x-user-id'] || operatorId, name: req.headers['x-user-name'] || 'Dispensing Operator', role: 'admin' };
      next();
    });
    app.use('/api/batch-productions', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    batch = {
      _id: batchId, batchNo: 'BATCH-001', status: 'in_progress',
      stages: [{ name: 'Raw Material Verification & Weighing', status: 'in_progress', inputQty: 0, lossQty: 0, lossPercent: 0, lossItems: [] }],
      ingredientsReserved: [{ rawMaterialId: materialId, rawMaterialEntryId: entryId, qtyReserved: 10, batchNo: 'LOT-001' }],
      ingredientsConsumed: [], rawMaterialCost: 0, save: jest.fn().mockResolvedValue(true)
    };
    entry = {
      _id: entryId, rawMaterialId: materialId, batchNo: 'LOT-001', qcStatus: 'approved',
      qty: 100, reservedQty: 10, issuedQty: 0, purchaseRate: 2,
      warehouseId: '507f1f77bcf86cd799439066', warehouseName: 'Mfg Store', save: jest.fn().mockResolvedValue(true)
    };
    record = {
      _id: '507f1f77bcf86cd799439077', dispensingNo: 'DSP-000001', batchId, batchNo: 'BATCH-001',
      stageIndex: 0, stageName: 'Raw Material Verification & Weighing',
      items: [{ rawMaterialId: materialId, rawMaterialEntryId: entryId, qtyDispensed: 4, qtyWasted: 1, wastageReason: 'Spillage', lotNo: 'LOT-001' }],
      status: 'pending_verification', dispensedBy: operatorId, save: jest.fn().mockResolvedValue(true)
    };
    BatchProduction.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(batch) });
    MaterialDispensing.find.mockReturnValue({ session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
    RawMaterialEntry.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(entry) });
    RawMaterial.findById.mockReturnValue({ session: jest.fn().mockResolvedValue({ name: 'Ashwagandha', unit: 'kg' }) });
  });

  test('creates a pending dispensing record without consuming stock', async () => {
    MaterialDispensing.create.mockResolvedValue([record]);
    const res = await request(app).post('/api/batch-productions/' + batchId + '/dispensings')
      .send({ stageIndex: 0, items: [{ rawMaterialId: materialId, rawMaterialEntryId: entryId, qtyDispensed: 4 }] });
    expect(res.status).toBe(201);
    expect(generateAtomicDocumentNumber).toHaveBeenCalledWith('dispensingNo', 'DSP-', 6, expect.any(Object));
    expect(record.status).toBe('pending_verification');
    expect(entry.qty).toBe(100);
    expect(entry.reservedQty).toBe(10);
  });

  test('requires a reason when dispensing includes process wastage', async () => {
    const res = await request(app).post('/api/batch-productions/' + batchId + '/dispensings')
      .send({ stageIndex: 0, items: [{
        rawMaterialId: materialId, rawMaterialEntryId: entryId, qtyDispensed: 4, qtyWasted: 1
      }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('reason for any recorded wastage');
    expect(MaterialDispensing.create).not.toHaveBeenCalled();
  });

  test('lists batch dispensing records for independent review', async () => {
    BatchProduction.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(batch) });
    MaterialDispensing.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([record]) })
    });
    const res = await request(app).get('/api/batch-productions/' + batchId + '/dispensings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].dispensingNo).toBe('DSP-000001');
  });

  test('rejects dispensing quantities above the batch reservation', async () => {
    const res = await request(app).post('/api/batch-productions/' + batchId + '/dispensings')
      .send({ stageIndex: 0, items: [{ rawMaterialId: materialId, rawMaterialEntryId: entryId, qtyDispensed: 11 }] });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('exceeds the remaining batch reservation');
    expect(MaterialDispensing.create).not.toHaveBeenCalled();
  });

  test('keeps separate genealogy lines when the same reserved lot is dispensed more than once', async () => {
    MaterialDispensing.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(record) });
    RawMaterialLedger.create.mockResolvedValue([{}]);

    const first = await request(app)
      .patch('/api/batch-productions/' + batchId + '/dispensings/' + record._id + '/verify')
      .set('x-user-id', reviewerId).set('x-user-name', 'QA Verifier').send({});
    expect(first.status).toBe(200);
    expect(batch.ingredientsConsumed).toHaveLength(1);
    expect(batch.ingredientsConsumed[0].dispensingNo).toBe('DSP-000001');

    const secondRecord = {
      ...record,
      _id: '507f1f77bcf86cd799439088',
      dispensingNo: 'DSP-000002',
      status: 'pending_verification',
      items: [{
        rawMaterialId: materialId,
        rawMaterialEntryId: entryId,
        qtyDispensed: 2,
        qtyWasted: 0,
        wastageReason: '',
        lotNo: 'LOT-001'
      }],
      save: jest.fn().mockResolvedValue(true)
    };
    entry.qty = 96;
    entry.reservedQty = 6;
    entry.issuedQty = 4;
    batch.ingredientsReserved[0].qtyReserved = 6;
    MaterialDispensing.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(secondRecord) });

    const second = await request(app)
      .patch('/api/batch-productions/' + batchId + '/dispensings/' + secondRecord._id + '/verify')
      .set('x-user-id', reviewerId).set('x-user-name', 'QA Verifier').send({});

    expect(second.status).toBe(200);
    expect(batch.ingredientsConsumed).toHaveLength(2);
    expect(batch.ingredientsConsumed.map(item => item.dispensingNo)).toEqual(['DSP-000001', 'DSP-000002']);
    expect(batch.ingredientsConsumed.map(item => item.qtyConsumed)).toEqual([4, 2]);
    expect(batch.ingredientsConsumed.map(item => item.qtyWasted)).toEqual([1, 0]);
  });

  test('requires independent verification and consumes reserved stock atomically', async () => {
    MaterialDispensing.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(record) });
    RawMaterialLedger.create.mockResolvedValue([{}]);
    const selfReview = await request(app).patch('/api/batch-productions/' + batchId + '/dispensings/' + record._id + '/verify').send({});
    expect(selfReview.status).toBe(400);
    expect(selfReview.body.error).toContain('Independent dispensing verification');

    const verified = await request(app).patch('/api/batch-productions/' + batchId + '/dispensings/' + record._id + '/verify')
      .set('x-user-id', reviewerId).set('x-user-name', 'QA Verifier').send({});
    expect(verified.status).toBe(200);
    expect(entry.qty).toBe(96);
    expect(entry.reservedQty).toBe(6);
    expect(entry.issuedQty).toBe(4);
    expect(batch.ingredientsConsumed[0].qtyConsumed).toBe(4);
    expect(batch.ingredientsConsumed[0].qtyWasted).toBe(1);
    expect(batch.ingredientsConsumed[0].wastageReason).toBe('Spillage');
    expect(batch.stages[0].lossQty).toBe(1);
    expect(batch.stages[0].lossPercent).toBe(25);
    expect(batch.stages[0].lossItems[0].qty).toBe(1);
    expect(batch.ingredientsReserved[0].qtyReserved).toBe(6);
    expect(batch.rawMaterialCost).toBe(8);
    expect(record.status).toBe('verified');
    expect(record.verifiedBy).toBe(reviewerId);
    expect(RawMaterialLedger.create).toHaveBeenCalled();
  });
});
