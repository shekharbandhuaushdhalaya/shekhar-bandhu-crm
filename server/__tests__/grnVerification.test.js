const express = require('express');
const request = require('supertest');

jest.mock('../models/GoodsReceivedNote');
jest.mock('../models/RolePermission');
jest.mock('../utils/withTransaction', () => ({ withTransaction: jest.fn(async work => work({})) }));
jest.mock('../utils/auditLogger', () => ({ logAction: jest.fn().mockResolvedValue(true) }));

const GoodsReceivedNote = require('../models/GoodsReceivedNote');
const RolePermission = require('../models/RolePermission');
const { logAction } = require('../utils/auditLogger');
const router = require('../routes/procurement/purchaseOrders');
const schemas = require('../validation/schemas');

describe('GRN independent receipt and supplier-document verification', () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = {
        id: req.headers['x-user-id'] || '507f1f77bcf86cd799439022',
        name: req.headers['x-user-name'] || 'Independent Reviewer',
        role: 'admin'
      };
      next();
    });
    app.use('/api/purchase-orders', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  const pendingGrn = (overrides = {}) => ({
    _id: 'grn-1',
    grnNo: 'GRN-00001',
    poId: 'po-1',
    status: 'pending_verification',
    receivedByUserId: '507f1f77bcf86cd799439011',
    items: [{ name: 'Ashwagandha Powder', rawMaterialId: '507f191e810c19729de860ea', batchNo: 'SUP-BATCH-1', supplierCoaRef: 'COA-REF-2026-01', supplierCoaNo: 'COA-2026-01', supplierCoaDate: new Date('2026-11-20'), supplierCoaLabName: 'Supplier QC Laboratory', supplierCoaBatchNo: 'SUP-BATCH-1', supplierCoaDocumentRef: 'DOC-REF-2026-01' }],
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  });

  const mockFind = record => GoodsReceivedNote.findById.mockReturnValue({
    session: jest.fn().mockResolvedValue(record)
  });

  test('validates gate-entry and internally consistent weighment data', () => {
    const base = {
      poId: '507f1f77bcf86cd799439011',
      warehouseId: '507f1f77bcf86cd799439012',
      items: [{ rawMaterialId: '507f191e810c19729de860ea', name: 'Ashwagandha', qtyReceived: 10, qtyAccepted: 10, qtyRejected: 0, batchNo: 'SUP-1' }],
      gateEntryNo: 'GATE-2026-001',
      vehicleNo: 'UP65AB1234',
      grossWeight: 1250,
      tareWeight: 250,
      netWeight: 1000,
      weightUnit: 'kg',
      weighmentSlipRef: 'WEIGH-SLIP-001'
    };
    expect(schemas.grnSchema.safeParse(base).success).toBe(true);
    expect(schemas.grnSchema.safeParse({ ...base, netWeight: 999 }).success).toBe(false);
    expect(schemas.grnSchema.safeParse({ ...base, tareWeight: undefined }).success).toBe(false);
    expect(schemas.grnSchema.safeParse({ ...base, weighmentSlipRef: '' }).success).toBe(false);
  });

  test('does not allow the receipt operator to verify their own GRN', async () => {
    mockFind(pendingGrn());
    const response = await request(app)
      .patch('/api/purchase-orders/grn/grn-1/verify')
      .set('x-user-id', '507f1f77bcf86cd799439011')
      .send({ verificationNotes: 'Checked supplier documents' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('GRN_MAKER_CHECKER_REQUIRED');
  });

  test('requires supplier CoA reference for every raw-material line before verification', async () => {
    const record = pendingGrn({ items: [{ name: 'Ashwagandha Powder', rawMaterialId: '507f191e810c19729de860ea', batchNo: 'SUP-BATCH-1', supplierCoaRef: '', supplierCoaNo: '', supplierCoaDate: null, supplierCoaLabName: '', supplierCoaBatchNo: '', supplierCoaDocumentRef: '' }] });
    mockFind(record);
    const response = await request(app)
      .patch('/api/purchase-orders/grn/grn-1/verify')
      .send({ verificationNotes: 'Physical quantity and documents checked' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('GRN_SUPPLIER_COA_REQUIRED');
    expect(record.save).not.toHaveBeenCalled();
  });

  test('rejects supplier CoA metadata when its declared supplier batch differs from the received batch', async () => {
    const record = pendingGrn({ items: [{ name: 'Ashwagandha Powder', rawMaterialId: '507f191e810c19729de860ea', batchNo: 'SUP-BATCH-1', supplierCoaRef: 'COA-REF', supplierCoaNo: 'COA-1', supplierCoaDate: new Date('2026-11-20'), supplierCoaLabName: 'Supplier QC Laboratory', supplierCoaBatchNo: 'OTHER-BATCH', supplierCoaDocumentRef: 'DOC-1' }] });
    mockFind(record);
    const response = await request(app).patch('/api/purchase-orders/grn/grn-1/verify').send({ verificationNotes: 'Reviewed supplier CoA details' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('GRN_SUPPLIER_COA_REQUIRED');
    expect(record.save).not.toHaveBeenCalled();
  });

  test('independent verification records reviewer and audit evidence without releasing stock', async () => {
    const record = pendingGrn();
    mockFind(record);
    const response = await request(app)
      .patch('/api/purchase-orders/grn/grn-1/verify')
      .set('x-user-id', '507f1f77bcf86cd799439022')
      .send({ verificationNotes: 'Supplier batch, CoA reference and received quantity checked' });

    expect(response.status).toBe(200);
    expect(record.status).toBe('verified');
    expect(record.verifiedByUserId).toBe('507f1f77bcf86cd799439022');
    expect(record.verifiedByName).toBe('Independent Reviewer');
    expect(record.verifiedAt).toBeInstanceOf(Date);
    expect(record.save).toHaveBeenCalled();
    expect(record.items[0].supplierCoaReviewStatus).toBe('reviewed');
    expect(record.items[0].supplierCoaReviewedByUserId).toBe('507f1f77bcf86cd799439022');
    expect(record.items[0].supplierCoaReviewedAt).toBeInstanceOf(Date);
    expect(logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'GRN_INDEPENDENT_VERIFICATION' }));
  });

  test('requires a reason when rejecting a GRN', async () => {
    const record = pendingGrn();
    mockFind(record);
    const response = await request(app)
      .patch('/api/purchase-orders/grn/grn-1/verify')
      .send({ decision: 'rejected', verificationNotes: 'Mismatch observed' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/rejection reason/i);
    expect(record.save).not.toHaveBeenCalled();
  });
  test('lists GRNs with status, search and pagination filters', async () => {
    const rows = [{ _id: 'grn-2', grnNo: 'GRN-00002', status: 'pending_verification' }];
    GoodsReceivedNote.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(rows)
    });
    GoodsReceivedNote.countDocuments = jest.fn().mockResolvedValue(1);
    const response = await request(app).get('/api/purchase-orders/grn?status=pending_verification&search=GRN-00002&page=1&limit=10');
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual(rows);
    expect(response.body.total).toBe(1);
    expect(GoodsReceivedNote.find).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending_verification',
      $or: expect.arrayContaining([expect.objectContaining({ grnNo: expect.any(Object) })])
    }));
  });

  test('escapes regex metacharacters in GRN register search input', async () => {
    GoodsReceivedNote.find = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
    GoodsReceivedNote.countDocuments = jest.fn().mockResolvedValue(0);
    await request(app).get('/api/purchase-orders/grn?search=.*');
    expect(GoodsReceivedNote.find.mock.calls[0][0].$or[0].grnNo.$regex).toBe('\\.\\*');
  });

  test('returns a GRN detail record by id', async () => {
    const record = { _id: 'grn-1', grnNo: 'GRN-00001', status: 'pending_verification' };
    GoodsReceivedNote.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(record) });
    const response = await request(app).get('/api/purchase-orders/grn/grn-1');
    expect(response.status).toBe(200);
    expect(response.body.grnNo).toBe('GRN-00001');
  });

});
