const express = require('express');
const request = require('supertest');

jest.mock('../models/PurchaseRequisition');
jest.mock('../models/SupplierQuotation');
jest.mock('../models/Vendor');
jest.mock('../models/RolePermission');
jest.mock('../utils/documentCounter', () => ({ generateAtomicDocumentNumber: jest.fn().mockResolvedValue('SQ-00001') }));
jest.mock('../utils/withTransaction', () => ({ withTransaction: fn => fn({}) }));

const PurchaseRequisition = require('../models/PurchaseRequisition');
const SupplierQuotation = require('../models/SupplierQuotation');
const Vendor = require('../models/Vendor');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/procurement/purchaseRequisitions');

describe('Supplier quotation comparison and independent selection', () => {
  let app;
  let requisition;
  const requisitionId = '507f1f77bcf86cd799439011';
  const materialId = '507f191e810c19729de860ea';
  const vendorId = '507f191e810c19729de860eb';

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: req.headers['x-user-id'] || 'buyer-1', name: req.headers['x-user-name'] || 'Buyer', role: 'admin' };
      next();
    });
    app.use('/api/purchase-requisitions', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    requisition = {
      _id: requisitionId, requisitionNo: 'PR-00001', status: 'approved', purchaseOrderId: null,
      items: [{ itemType: 'raw_material', rawMaterialId: materialId, qtyRequested: 25, unit: 'kg', name: 'Ashwagandha' }],
      save: jest.fn().mockResolvedValue(true)
    };
    PurchaseRequisition.findById.mockResolvedValue(requisition);
    Vendor.findById.mockResolvedValue({ _id: vendorId, company: 'Herbal Supplier' });
    SupplierQuotation.create.mockImplementation(async docs => docs.map(doc => ({ _id: 'quote-1', ...doc })));
  });

  test('records exact-line supplier quotation and calculates landed total', async () => {
    const response = await request(app).post('/api/purchase-requisitions/' + requisitionId + '/quotations').send({
      vendorId, vendorQuoteReference: 'SUP-Q-88', evidenceRef: 'evidence://supplier/quote-88',
      validUntil: new Date(Date.now() + 86400000).toISOString(), deliveryLeadTimeDays: 7,
      freightAmount: 50, otherCharges: 10,
      items: [{ rawMaterialId: materialId, qtyQuoted: 25, unit: 'kg', unitPrice: 120, gstRate: 5 }]
    });
    expect(response.status).toBe(201);
    expect(response.body.totalAmount).toBe(3210);
    expect(response.body.status).toBe('pending_review');
    expect(SupplierQuotation.create).toHaveBeenCalledWith([expect.objectContaining({
      vendorId, requisitionId, subtotal: 3000, taxAmount: 150, totalAmount: 3210,
      evidenceRef: 'evidence://supplier/quote-88'
    })]);
  });

  test('rejects quotation quantities that differ from the approved requisition', async () => {
    const response = await request(app).post('/api/purchase-requisitions/' + requisitionId + '/quotations').send({
      vendorId, vendorQuoteReference: 'SUP-Q-88', evidenceRef: 'evidence://supplier/quote-88',
      validUntil: new Date(Date.now() + 86400000).toISOString(), deliveryLeadTimeDays: 7,
      items: [{ rawMaterialId: materialId, qtyQuoted: 26, unit: 'kg', unitPrice: 120, gstRate: 5 }]
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SUPPLIER_QUOTE_LINE_MISMATCH');
    expect(SupplierQuotation.create).not.toHaveBeenCalled();
  });

  test('prevents quotation recorder from selecting their own quote', async () => {
    const quote = {
      _id: 'quote-1', requisitionId, status: 'pending_review', submittedByUserId: 'buyer-1',
      validUntil: new Date(Date.now() + 86400000), save: jest.fn()
    };
    PurchaseRequisition.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(requisition) });
    SupplierQuotation.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(quote) });
    const response = await request(app).patch('/api/purchase-requisitions/' + requisitionId + '/quotations/quote-1/select').send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SUPPLIER_QUOTE_MAKER_CHECKER_REQUIRED');
    expect(quote.save).not.toHaveBeenCalled();
  });

  test('allows independent reviewer to select a current quotation transactionally', async () => {
    const quote = {
      _id: 'quote-1', requisitionId, status: 'pending_review', submittedByUserId: 'recorder-2',
      validUntil: new Date(Date.now() + 86400000), save: jest.fn().mockResolvedValue(true)
    };
    PurchaseRequisition.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(requisition) });
    SupplierQuotation.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(quote) });
    const response = await request(app).patch('/api/purchase-requisitions/' + requisitionId + '/quotations/quote-1/select')
      .set('x-user-id', 'reviewer-3').set('x-user-name', 'Independent Reviewer').send({ reviewNotes: 'Best landed cost and delivery' });
    expect(response.status).toBe(200);
    expect(quote.status).toBe('selected');
    expect(quote.reviewedByUserId).toBe('reviewer-3');
    expect(requisition.selectedQuotationId).toBe('quote-1');
    expect(quote.save).toHaveBeenCalledWith({ session: {} });
    expect(requisition.save).toHaveBeenCalledWith({ session: {} });
  });
});
