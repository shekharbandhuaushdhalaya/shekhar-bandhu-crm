const express = require('express');
const request = require('supertest');

jest.mock('../models/PurchaseOrder');
jest.mock('../models/PurchaseRequisition');
jest.mock('../models/SupplierQuotation');
jest.mock('../models/GoodsReceivedNote');
jest.mock('../models/SupplierReturn');
jest.mock('../models/Vendor');
jest.mock('../models/VendorQualification');
jest.mock('../models/Warehouse');
jest.mock('../models/RawMaterial');
jest.mock('../models/RawMaterialEntry');
jest.mock('../models/Product');
jest.mock('../models/InventoryEntry');
jest.mock('../models/StockLedger');
jest.mock('../models/Invoice');
jest.mock('../models/RolePermission');
jest.mock('../utils/auditLogger', () => ({ logAction: jest.fn().mockResolvedValue(true) }));
jest.mock('../utils/documentCounter', () => ({ generateAtomicDocumentNumber: jest.fn().mockResolvedValue('SR-000001') }));

const SupplierReturn = require('../models/SupplierReturn');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/procurement/purchaseOrders');

describe('Supplier return lifecycle', () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: req.headers['x-user-id'] || 'reviewer-2', name: 'Workflow User', role: 'admin' };
      next();
    });
    app.use('/api/purchase-orders', router);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  test('requires an independent reviewer and evidence notes to approve', async () => {
    const record = { _id: 'return-1', status: 'pending_approval', requestedByUserId: 'maker-1', save: jest.fn().mockResolvedValue(true) };
    SupplierReturn.findById.mockResolvedValue(record);
    const response = await request(app).patch('/api/purchase-orders/supplier-returns/return-1/approve').set('x-user-id', 'maker-1').send({ decision: 'approved', reviewNotes: 'Reviewed' });
    expect(response.status).toBe(403);
    expect(record.save).not.toHaveBeenCalled();
  });

  test('records independent approval identity and review evidence with a conditional update', async () => {
    SupplierReturn.findById.mockResolvedValue({ _id: 'return-2', returnNo: 'SR-2', status: 'pending_approval', requestedByUserId: 'maker-1' });
    SupplierReturn.findOneAndUpdate.mockResolvedValue({
      _id: 'return-2', returnNo: 'SR-2', status: 'approved',
      reviewedByUserId: 'reviewer-2', reviewNotes: 'Quantity and evidence checked'
    });
    const response = await request(app).patch('/api/purchase-orders/supplier-returns/return-2/approve').set('x-user-id', 'reviewer-2').send({ decision: 'approved', reviewNotes: 'Quantity and evidence checked' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'approved', reviewedByUserId: 'reviewer-2', reviewNotes: 'Quantity and evidence checked' });
    expect(SupplierReturn.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'return-2', status: 'pending_approval', requestedByUserId: { $ne: 'reviewer-2' } },
      { $set: expect.objectContaining({ status: 'approved', reviewedByUserId: 'reviewer-2' }) },
      { new: true, runValidators: true }
    );
  });

  test('returns conflict when another reviewer wins supplier-return approval', async () => {
    SupplierReturn.findById.mockResolvedValue({ _id: 'return-2', status: 'pending_approval', requestedByUserId: 'maker-1' });
    SupplierReturn.findOneAndUpdate.mockResolvedValue(null);
    const response = await request(app).patch('/api/purchase-orders/supplier-returns/return-2/approve').set('x-user-id', 'reviewer-2').send({ decision: 'approved', reviewNotes: 'Quantity and evidence checked' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SUPPLIER_RETURN_REVIEW_CONFLICT');
  });

  test('requires dispatch evidence and only dispatches approved returns', async () => {
    const record = { _id: 'return-3', status: 'pending_approval', save: jest.fn() };
    SupplierReturn.findById.mockResolvedValue(record);
    const response = await request(app).patch('/api/purchase-orders/supplier-returns/return-3/dispatch').send({ dispatchRef: 'LR-123' });
    expect(response.status).toBe(409);
    expect(record.save).not.toHaveBeenCalled();
  });

  test('requires replacement batch evidence before closing a replacement request', async () => {
    const record = { _id: 'return-4', status: 'dispatched', resolutionType: 'replacement_requested', save: jest.fn() };
    SupplierReturn.findById.mockResolvedValue(record);
    const response = await request(app).patch('/api/purchase-orders/supplier-returns/return-4/resolve').send({ supplierReference: 'SUP-ACK-4' });
    expect(response.status).toBe(400);
    expect(record.save).not.toHaveBeenCalled();
  });

  test('closes a replacement request through a conditional update with supplier evidence', async () => {
    SupplierReturn.findById.mockResolvedValue({ _id: 'return-5', returnNo: 'SR-5', status: 'dispatched', resolutionType: 'replacement_requested' });
    SupplierReturn.findOneAndUpdate.mockResolvedValue({
      _id: 'return-5', returnNo: 'SR-5', status: 'closed', supplierReference: 'SUP-ACK-5',
      replacementBatchNo: 'REPL-BATCH-5', resolvedByUserId: 'stores-1'
    });
    const response = await request(app).patch('/api/purchase-orders/supplier-returns/return-5/resolve').set('x-user-id', 'stores-1').send({ supplierReference: 'SUP-ACK-5', replacementBatchNo: 'REPL-BATCH-5' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'closed', supplierReference: 'SUP-ACK-5', replacementBatchNo: 'REPL-BATCH-5', resolvedByUserId: 'stores-1' });
    expect(SupplierReturn.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'return-5', status: 'dispatched' },
      { $set: expect.objectContaining({ status: 'closed', supplierReference: 'SUP-ACK-5', replacementBatchNo: 'REPL-BATCH-5' }) },
      { new: true, runValidators: true }
    );
  });
});
