const express = require('express');
const request = require('supertest');

jest.mock('../models/GoodsReceivedNote');
jest.mock('../models/SupplierReturn');
jest.mock('../utils/documentCounter', () => ({ generateAtomicDocumentNumber: jest.fn().mockResolvedValue('SR-000001') }));
jest.mock('../models/RolePermission');
jest.mock('../utils/withTransaction', () => ({ withTransaction: jest.fn(async work => work({})) }));
jest.mock('../utils/auditLogger', () => ({ logAction: jest.fn().mockResolvedValue(true) }));

const GoodsReceivedNote = require('../models/GoodsReceivedNote');
const SupplierReturn = require('../models/SupplierReturn');
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

  test('requires substantive verification notes and rejection reasons', async () => {
    const shortNotesRecord = pendingGrn();
    mockFind(shortNotesRecord);
    const shortNotes = await request(app)
      .patch('/api/purchase-orders/grn/grn-1/verify')
      .send({ verificationNotes: 'Checked' });
    expect(shortNotes.status).toBe(400);
    expect(shortNotes.body.error).toMatch(/at least 10 characters/i);
    expect(shortNotesRecord.save).not.toHaveBeenCalled();

    const shortReasonRecord = pendingGrn();
    mockFind(shortReasonRecord);
    const shortReason = await request(app)
      .patch('/api/purchase-orders/grn/grn-1/verify')
      .send({ decision: 'rejected', verificationNotes: 'Supplier batch mismatch reviewed', rejectionReason: 'Mismatch' });
    expect(shortReason.status).toBe(400);
    expect(shortReason.body.error).toMatch(/rejection reason/i);
    expect(shortReasonRecord.save).not.toHaveBeenCalled();

    const rejectedRecord = pendingGrn();
    mockFind(rejectedRecord);
    const rejected = await request(app)
      .patch('/api/purchase-orders/grn/grn-1/verify')
      .send({ decision: 'rejected', verificationNotes: 'Supplier batch mismatch reviewed', rejectionReason: 'Supplier batch number does not match the received material lot' });
    expect(rejected.status).toBe(200);
    expect(rejectedRecord.status).toBe('rejected');
    expect(rejectedRecord.rejectionReason).toBe('Supplier batch number does not match the received material lot');
    expect(rejectedRecord.save).toHaveBeenCalled();
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

  test('creates a supplier return only within the verified GRN rejected quantity', async () => {
    const grn = { _id: 'grn-1', grnNo: 'GRN-00001', poId: 'po-1', poNo: 'PO-1', vendorId: 'vendor-1', vendorName: 'Supplier', status: 'verified', items: [{ name: 'Ashwagandha', batchNo: 'LOT-1', qtyRejected: 5, unit: 'kg', rawMaterialId: 'raw-1' }] };
    GoodsReceivedNote.findById = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(grn) });
    GoodsReceivedNote.findOneAndUpdate = jest.fn().mockResolvedValue({ ...grn, returnReservationVersion: 1 });
    SupplierReturn.find = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue([{ qty: 3, status: 'pending_approval' }]) });
    SupplierReturn.create = jest.fn().mockResolvedValue([{ _id: 'return-1', returnNo: 'SR-000001', qty: 2 }]);
    const response = await request(app).post('/api/purchase-orders/grn/grn-1/supplier-returns').send({ itemIndex: 0, qty: 2, reason: 'Damaged packaging', resolutionType: 'replacement_requested' });
    expect(response.status).toBe(201);
    expect(GoodsReceivedNote.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'grn-1', status: 'verified' },
      { $inc: { returnReservationVersion: 1 } },
      { new: true, session: {} }
    );
    expect(SupplierReturn.create).toHaveBeenCalledWith([expect.objectContaining({ qty: 2, status: 'pending_approval', requestedByUserId: '507f1f77bcf86cd799439022' })], { session: {} });
  });


  test('rejects a stale concurrent supplier-return quantity reservation', async () => {
    const grn = { _id: 'grn-1', status: 'verified', items: [{ name: 'Ashwagandha', batchNo: 'LOT-1', qtyRejected: 5, rawMaterialId: 'raw-1' }] };
    GoodsReceivedNote.findById = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(grn) });
    SupplierReturn.find = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue([{ qty: 3, status: 'approved' }]) });
    GoodsReceivedNote.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    SupplierReturn.create = jest.fn();
    const response = await request(app).post('/api/purchase-orders/grn/grn-1/supplier-returns')
      .send({ itemIndex: 0, qty: 2, reason: 'Damaged packaging', resolutionType: 'return_to_supplier' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SUPPLIER_RETURN_RESERVATION_CONFLICT');
    expect(SupplierReturn.create).not.toHaveBeenCalled();
  });

  test('blocks supplier return quantities above the remaining rejected quantity', async () => {
    const grn = { _id: 'grn-1', status: 'verified', items: [{ name: 'Ashwagandha', batchNo: 'LOT-1', qtyRejected: 5 }] };
    GoodsReceivedNote.findById = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(grn) });
    SupplierReturn.find = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue([{ qty: 3, status: 'approved' }]) });
    const response = await request(app).post('/api/purchase-orders/grn/grn-1/supplier-returns').send({ itemIndex: 0, qty: 3, reason: 'Damaged', resolutionType: 'return_to_supplier' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SUPPLIER_RETURN_QTY_EXCEEDED');
  });

  test('enforces maker-checker on supplier return approval and requires review notes', async () => {
    const record = { _id: 'return-1', status: 'pending_approval', requestedByUserId: '507f1f77bcf86cd799439022', save: jest.fn() };
    SupplierReturn.findById = jest.fn().mockResolvedValue(record);
    const self = await request(app).patch('/api/purchase-orders/supplier-returns/return-1/approve').send({ decision: 'approved', reviewNotes: 'Checked' });
    expect(self.status).toBe(403);
    record.requestedByUserId = 'another-user';
    const missingNotes = await request(app).patch('/api/purchase-orders/supplier-returns/return-1/approve').send({ decision: 'approved' });
    expect(missingNotes.status).toBe(400);
    SupplierReturn.findOneAndUpdate = jest.fn().mockResolvedValue({
      _id: 'return-1', status: 'approved', reviewedByUserId: '507f1f77bcf86cd799439022'
    });
    const approved = await request(app).patch('/api/purchase-orders/supplier-returns/return-1/approve').send({ decision: 'approved', reviewNotes: 'Reviewed evidence' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.reviewedByUserId).toBe('507f1f77bcf86cd799439022');
  });

  test('requires dispatch evidence and a verified replacement GRN before closing a replacement request', async () => {
    const approvedRecord = {
      _id: 'return-1', returnNo: 'SR-1', status: 'approved', resolutionType: 'replacement_requested',
      poId: 'po-1', vendorId: 'vendor-1', rawMaterialId: 'raw-1', qty: 2
    };
    const dispatchedRecord = { ...approvedRecord, status: 'dispatched', updatedAt: new Date('2026-11-25T10:00:00Z') };
    SupplierReturn.findById = jest.fn()
      .mockResolvedValueOnce(approvedRecord)
      .mockResolvedValueOnce(approvedRecord)
      .mockResolvedValueOnce(dispatchedRecord)
      .mockResolvedValueOnce(dispatchedRecord);
    SupplierReturn.findOneAndUpdate = jest.fn()
      .mockResolvedValueOnce({ ...dispatchedRecord, dispatchRef: 'LR-001' })
      .mockResolvedValueOnce({
        ...dispatchedRecord, status: 'closed', replacementBatchNo: 'NEW-LOT-1',
        replacementGrnId: 'replacement-grn-1', replacementGrnNo: 'GRN-REPL-1'
      });
    const missingDispatch = await request(app).patch('/api/purchase-orders/supplier-returns/return-1/dispatch').send({});
    expect(missingDispatch.status).toBe(400);
    const dispatched = await request(app).patch('/api/purchase-orders/supplier-returns/return-1/dispatch').send({ dispatchRef: 'LR-001' });
    expect(dispatched.status).toBe(200);
    const missingBatch = await request(app).patch('/api/purchase-orders/supplier-returns/return-1/resolve').send({ supplierReference: 'SUP-ACK-1' });
    expect(missingBatch.status).toBe(400);
    GoodsReceivedNote.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({
      _id: 'replacement-grn-1', grnNo: 'GRN-REPL-1', status: 'verified',
      receivedDate: new Date('2026-11-24'), verifiedAt: new Date('2026-11-25'),
      items: [{ rawMaterialId: 'raw-1', batchNo: 'NEW-LOT-1', qtyAccepted: 2 }]
    }) });
    GoodsReceivedNote.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: 'replacement-grn-1', status: 'verified' });
    SupplierReturn.find = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    const resolved = await request(app).patch('/api/purchase-orders/supplier-returns/return-1/resolve').send({ supplierReference: 'SUP-ACK-1', replacementBatchNo: 'NEW-LOT-1' });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({
      status: 'closed', replacementBatchNo: 'NEW-LOT-1',
      replacementGrnId: 'replacement-grn-1', replacementGrnNo: 'GRN-REPL-1'
    });
  });

  test('does not close a replacement request without a verified replacement GRN', async () => {
    SupplierReturn.findById = jest.fn().mockResolvedValue({
      _id: 'return-2', status: 'dispatched', resolutionType: 'replacement_requested',
      poId: 'po-1', vendorId: 'vendor-1', rawMaterialId: 'raw-1', qty: 2
    });
    GoodsReceivedNote.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const response = await request(app).patch('/api/purchase-orders/supplier-returns/return-2/resolve')
      .send({ supplierReference: 'SUP-ACK-2', replacementBatchNo: 'NEW-LOT-2' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SUPPLIER_REPLACEMENT_GRN_NOT_VERIFIED');
    expect(SupplierReturn.findOneAndUpdate).not.toHaveBeenCalled();
  });

});
