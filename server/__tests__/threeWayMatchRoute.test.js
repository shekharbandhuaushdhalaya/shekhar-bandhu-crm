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
jest.mock('../utils/documentCounter', () => ({ generateAtomicDocumentNumber: jest.fn() }));

const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceivedNote = require('../models/GoodsReceivedNote');
const Invoice = require('../models/Invoice');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/procurement/purchaseOrders');

describe('Purchase invoice three-way match', () => {
  let app;
  const po = {
    _id: 'po-1', poNo: 'PO-1', vendorId: 'vendor-1', vendorName: 'Supplier A',
    totalAmount: 1050,
    items: [{ rawMaterialId: 'raw-1', name: 'Ashwagandha', qtyOrdered: 10, unit: 'kg', unitPrice: 100, gstRate: 5 }]
  };
  const grns = [{
    _id: 'grn-1', status: 'verified', poId: 'po-1',
    items: [{ rawMaterialId: 'raw-1', name: 'Ashwagandha', qtyAccepted: 10, unit: 'kg' }]
  }];
  const invoice = {
    _id: 'invoice-1', type: 'purchase', vendorId: 'vendor-1', supplierName: 'Supplier A',
    amount: 1050, roundOff: 0,
    items: [{ rawMaterialId: 'raw-1', name: 'Ashwagandha', qty: 10, unit: 'kg', rate: 100, gstRate: 5 }]
  };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'reviewer-1', name: 'Finance Reviewer', role: 'admin' }; next(); });
    app.use('/api/purchase-orders', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    PurchaseOrder.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(po) });
    GoodsReceivedNote.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(grns) });
    Invoice.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(invoice) });
  });

  test('matches supplier, accepted quantities, net line price, GST and invoice total', async () => {
    const response = await request(app).post('/api/purchase-orders/3-way-match').send({ poId: 'po-1', purchaseInvoiceId: 'invoice-1' });
    expect(response.status).toBe(200);
    expect(response.body.matchStatus).toBe('MATCHED');
    expect(response.body.lineMatches[0]).toMatchObject({
      receivedEnough: true, billedMatchesReceived: true, priceMatch: true, taxMatch: true, matched: true
    });
  });

  test('rejects an amount discrepancy that the former ₹10 tolerance would have accepted', async () => {
    Invoice.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ ...invoice, amount: 1055 }) });
    const response = await request(app).post('/api/purchase-orders/3-way-match').send({ poId: 'po-1', purchaseInvoiceId: 'invoice-1' });
    expect(response.body.matchStatus).toBe('DISCREPANCY_FOUND');
    expect(response.body.amountMatch).toBe(false);
  });

  test('rejects line price and GST mismatches even when invoice grand total is forced to match', async () => {
    Invoice.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({
      ...invoice, amount: 1050,
      items: [{ ...invoice.items[0], rate: 95, gstRate: 10 }]
    }) });
    const response = await request(app).post('/api/purchase-orders/3-way-match').send({ poId: 'po-1', purchaseInvoiceId: 'invoice-1' });
    expect(response.body.matchStatus).toBe('DISCREPANCY_FOUND');
    expect(response.body.lineMatches[0].priceMatch).toBe(false);
    expect(response.body.lineMatches[0].taxMatch).toBe(false);
  });

  test('flags invoice lines without material/product identity', async () => {
    Invoice.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({
      ...invoice, items: [...invoice.items, { name: 'Unlinked freight', qty: 1, rate: 0 }]
    }) });
    const response = await request(app).post('/api/purchase-orders/3-way-match').send({ poId: 'po-1', purchaseInvoiceId: 'invoice-1' });
    expect(response.body.matchStatus).toBe('DISCREPANCY_FOUND');
    expect(response.body.unlinkedInvoiceItems).toContain('Unlinked freight');
  });
});
