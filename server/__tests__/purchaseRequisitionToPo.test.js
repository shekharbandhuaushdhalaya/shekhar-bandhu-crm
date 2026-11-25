const express = require('express');
const request = require('supertest');

jest.mock('../models/PurchaseOrder');
jest.mock('../models/PurchaseRequisition');
jest.mock('../models/Vendor');
jest.mock('../models/SupplierQuotation');
jest.mock('../models/RolePermission');
jest.mock('../utils/documentCounter', () => ({ generateAtomicDocumentNumber: jest.fn().mockResolvedValue('PO-00001') }));
jest.mock('../utils/withTransaction', () => ({ withTransaction: fn => fn({}) }));

const PurchaseOrder = require('../models/PurchaseOrder');
const PurchaseRequisition = require('../models/PurchaseRequisition');
const Vendor = require('../models/Vendor');
const SupplierQuotation = require('../models/SupplierQuotation');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/procurement/purchaseOrders');

describe('Purchase requisition to purchase order conversion', () => {
  let app;
  let requisitionRecord;
  const requisitionId = '507f1f77bcf86cd799439011';
  const materialId = '507f191e810c19729de860ea';
  const vendorId = '507f191e810c19729de860eb';

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'buyer-1', name: 'Buyer', role: 'admin' };
      next();
    });
    app.use('/api/purchase-orders', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    Vendor.findById.mockReturnValue({ session: jest.fn().mockResolvedValue({ _id: vendorId, company: 'Herbal Supplier' }) });
    requisitionRecord = {
      _id: requisitionId, status: 'approved', purchaseOrderId: null,
      items: [{ itemType: 'raw_material', rawMaterialId: materialId, qtyRequested: 25, unit: 'kg' }],
      save: jest.fn().mockResolvedValue(true)
    };
    PurchaseRequisition.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(requisitionRecord) });
    PurchaseOrder.create.mockImplementation(async docs => [{ _id: 'po-1', ...docs[0] }]);
  });

  const body = (qty = 25) => ({
    requisitionId, vendorId, procurementExceptionReason: 'Only approved vendor available for this specified raw material.', items: [{
      rawMaterialId: materialId, name: 'Ashwagandha', qtyOrdered: qty, unitPrice: 120,
      unit: 'kg', gstRate: 5
    }]
  });

  test('creates a draft PO and atomically marks the approved requisition converted', async () => {
    const response = await request(app).post('/api/purchase-orders').send(body());
    expect(response.status).toBe(201);
    expect(PurchaseOrder.create).toHaveBeenCalledWith([expect.objectContaining({
      sourceRequisitionId: requisitionId, status: 'draft', vendorId,
      items: [expect.objectContaining({ qtyOrdered: 25, qtyReceived: 0 })]
    })], { session: {} });
    const requisition = await PurchaseRequisition.findById.mock.results[0].value.session.mock.results[0].value;
    expect(requisition.status).toBe('converted');
    expect(requisition.purchaseOrderId).toBe('po-1');
    expect(requisition.save).toHaveBeenCalledWith({ session: {} });
  });

  test('rejects PO quantities that exceed or differ from the approved requisition', async () => {
    const response = await request(app).post('/api/purchase-orders').send(body(26));
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('REQUISITION_LINE_MISMATCH');
    expect(PurchaseOrder.create).not.toHaveBeenCalled();
  });

  test('uses selected quotation vendor and locked price and marks quote converted', async () => {
    requisitionRecord.selectedQuotationId = 'quote-1';
    const quote = {
      _id: 'quote-1', status: 'selected', requisitionId, vendorId,
      validUntil: new Date(Date.now() + 86400000),
      items: [{ rawMaterialId: materialId, unitPrice: 120, gstRate: 5 }],
      save: jest.fn().mockResolvedValue(true)
    };
    SupplierQuotation.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(quote) });
    const response = await request(app).post('/api/purchase-orders').send(body());
    expect(response.status).toBe(201);
    expect(PurchaseOrder.create).toHaveBeenCalledWith([expect.objectContaining({ sourceQuotationId: 'quote-1' })], { session: {} });
    expect(quote.status).toBe('converted');
    expect(quote.save).toHaveBeenCalledWith({ session: {} });
  });

  test('rejects conversion of a requisition that is not approved', async () => {
    PurchaseRequisition.findById.mockReturnValue({
      session: jest.fn().mockResolvedValue({ _id: requisitionId, status: 'pending_approval', items: [] })
    });
    const response = await request(app).post('/api/purchase-orders').send(body());
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('REQUISITION_NOT_CONVERTIBLE');
    expect(PurchaseOrder.create).not.toHaveBeenCalled();
  });
});
