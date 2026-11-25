const express = require('express');
const request = require('supertest');

jest.mock('../models/PurchaseOrder');
jest.mock('../models/VendorQualification');
jest.mock('../models/RolePermission');
jest.mock('../utils/withTransaction', () => ({ withTransaction: jest.fn(work => work({ id: 'session-1' })) }));

const PurchaseOrder = require('../models/PurchaseOrder');
const VendorQualification = require('../models/VendorQualification');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/procurement/purchaseOrders');

describe('Purchase order independent approval concurrency', () => {
  let app;
  let po;
  const poId = '507f1f77bcf86cd799439011';
  const materialId = '507f191e810c19729de860ea';
  const updatedAt = new Date('2026-11-25T10:00:00.000Z');

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'approver-2', name: 'Independent Approver', role: 'admin' };
      next();
    });
    app.use('/api/purchase-orders', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    po = {
      _id: poId,
      status: 'draft',
      vendorId: 'vendor-1',
      createdByUserId: 'buyer-1',
      updatedAt,
      items: [{ rawMaterialId: materialId, name: 'Ashwagandha' }]
    };
    PurchaseOrder.findById.mockReturnValue({
      session: jest.fn().mockResolvedValue(po)
    });
    VendorQualification.findOne.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: 'qualification-1', qualificationStatus: 'approved' })
    });
    PurchaseOrder.findOneAndUpdate.mockResolvedValue({
      ...po, status: 'approved', approvedByUserId: 'approver-2',
      approvedBy: 'Independent Approver', approvedAt: new Date()
    });
  });

  test('approves only after rechecking current material-specific vendor qualification in the transaction', async () => {
    const response = await request(app).patch('/api/purchase-orders/' + poId + '/approve');
    expect(response.status).toBe(200);
    expect(VendorQualification.findOne).toHaveBeenCalledWith(expect.objectContaining({
      vendorId: 'vendor-1',
      qualificationStatus: 'approved',
      rawMaterialIds: materialId
    }));
    expect(PurchaseOrder.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: poId, status: 'draft', updatedAt },
      { $set: expect.objectContaining({
        status: 'approved',
        approvedByUserId: 'approver-2',
        approvedBy: 'Independent Approver',
        approvedAt: expect.any(Date)
      }) },
      { new: true, runValidators: true, session: { id: 'session-1' } }
    );
  });

  test('blocks the PO creator from approving their own purchase order', async () => {
    po.createdByUserId = 'approver-2';
    const response = await request(app).patch('/api/purchase-orders/' + poId + '/approve');
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PO_MAKER_CHECKER_REQUIRED');
    expect(PurchaseOrder.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('blocks approval when vendor qualification is no longer current', async () => {
    VendorQualification.findOne.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null)
    });
    const response = await request(app).patch('/api/purchase-orders/' + poId + '/approve');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('VENDOR_MATERIAL_NOT_QUALIFIED');
    expect(PurchaseOrder.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects a stale approval attempt when the PO changes after the reviewer read it', async () => {
    PurchaseOrder.findOneAndUpdate.mockResolvedValue(null);
    const response = await request(app).patch('/api/purchase-orders/' + poId + '/approve');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PO_APPROVAL_CONFLICT');
  });
});
