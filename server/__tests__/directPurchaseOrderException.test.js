const express = require('express');
const request = require('supertest');

jest.mock('../models/PurchaseOrder');
jest.mock('../models/Vendor');
jest.mock('../models/RolePermission');
jest.mock('../utils/documentCounter', () => ({ generateAtomicDocumentNumber: jest.fn().mockResolvedValue('PO-00001') }));

const PurchaseOrder = require('../models/PurchaseOrder');
const Vendor = require('../models/Vendor');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/procurement/purchaseOrders');

describe('Direct purchase order procurement exception policy', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: 'buyer-1', name: 'Buyer', role: 'admin' };
      next();
    });
    app.use('/api/purchase-orders', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  test('rejects duplicate material/product lines in direct purchase orders', async () => {
    const response = await request(app).post('/api/purchase-orders').send({
      vendorId: '507f1f77bcf86cd799439011',
      procurementExceptionReason: 'Urgent replenishment required outside the approved requisition cycle.',
      items: [
        { name: 'Ashwagandha', rawMaterialId: '507f191e810c19729de860ea', qtyOrdered: 10, unitPrice: 100, unit: 'kg', gstRate: 5 },
        { name: 'Ashwagandha duplicate', rawMaterialId: '507f191e810c19729de860ea', qtyOrdered: 5, unitPrice: 105, unit: 'kg', gstRate: 5 }
      ]
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('DUPLICATE_PURCHASE_ORDER_ITEM');
    expect(Vendor.findById).not.toHaveBeenCalled();
    expect(PurchaseOrder.create).not.toHaveBeenCalled();
  });

  test('blocks direct purchase orders without a documented procurement exception', async () => {
    const response = await request(app).post('/api/purchase-orders').send({
      vendorId: '507f1f77bcf86cd799439011',
      items: [{ name: 'Ashwagandha', rawMaterialId: '507f191e810c19729de860ea', qtyOrdered: 10, unitPrice: 100, unit: 'kg', gstRate: 5 }]
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PROCUREMENT_EXCEPTION_REQUIRED');
    expect(Vendor.findById).not.toHaveBeenCalled();
    expect(PurchaseOrder.create).not.toHaveBeenCalled();
  });
});
