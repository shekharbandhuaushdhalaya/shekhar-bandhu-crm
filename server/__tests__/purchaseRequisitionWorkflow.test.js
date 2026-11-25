const express = require('express');
const request = require('supertest');

jest.mock('../models/PurchaseRequisition');
jest.mock('../models/RolePermission');
const PurchaseRequisition = require('../models/PurchaseRequisition');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/procurement/purchaseRequisitions');

describe('Purchase requisition maker-checker workflow', () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: req.headers['x-user-id'] || 'requester-1', name: req.headers['x-user-name'] || 'Requester', role: 'admin' };
      app.locals.user = req.user;
      next();
    });
    app.use('/api/purchase-requisitions', router);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  test('requires exactly one correctly typed item reference and a positive quantity', async () => {
    const response = await request(app).post('/api/purchase-requisitions').send({
      department: 'Manufacturing', justification: 'Planned batch', items: [{
        itemType: 'raw_material', rawMaterialId: 'rm-1', productId: 'product-1', name: 'Herb', qtyRequested: 5, unit: 'kg'
      }]
    });
    expect(response.status).toBe(400);
    expect(PurchaseRequisition.create).not.toHaveBeenCalled();
  });

  test('creates draft requisition with requester identity and generated number', async () => {
    PurchaseRequisition.create.mockImplementation(async docs => docs);
    const response = await request(app).post('/api/purchase-requisitions').send({
      department: 'Manufacturing', justification: 'Approved production plan', items: [{
        itemType: 'raw_material', rawMaterialId: '507f1f77bcf86cd799439011', name: 'Ashwagandha', qtyRequested: 25, unit: 'kg'
      }]
    });
    expect(response.status).toBe(201);
    expect(PurchaseRequisition.create).toHaveBeenCalledWith([expect.objectContaining({
      status: 'draft', requestedByUserId: 'requester-1', createdByUserId: 'requester-1',
      items: [expect.objectContaining({ qtyRequested: 25, itemType: 'raw_material' })]
    })]);
  });

  test('prevents requester from approving own submitted requisition', async () => {
    PurchaseRequisition.findById.mockResolvedValue({
      _id: 'req-1', status: 'pending_approval', requestedByUserId: 'requester-1', save: jest.fn()
    });
    const response = await request(app).patch('/api/purchase-requisitions/req-1/approve').send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('REQUISITION_MAKER_CHECKER_REQUIRED');
  });

  test('allows independent approval and records reviewer identity', async () => {
    const record = { _id: 'req-1', status: 'pending_approval', requestedByUserId: 'requester-1', save: jest.fn().mockResolvedValue(true) };
    PurchaseRequisition.findById.mockResolvedValue(record);
    const response = await request(app).patch('/api/purchase-requisitions/req-1/approve').set('x-user-id', 'approver-2').set('x-user-name', 'Approver').send({});
    expect(response.status).toBe(200);
    expect(record.status).toBe('approved');
    expect(record.approvedByUserId).toBe('approver-2');
    expect(record.approvedAt).toBeInstanceOf(Date);
  });

  test('requires a reason and independent reviewer for rejection', async () => {
    const record = { _id: 'req-1', status: 'pending_approval', requestedByUserId: 'requester-1', save: jest.fn() };
    PurchaseRequisition.findById.mockResolvedValue(record);
    const response = await request(app).patch('/api/purchase-requisitions/req-1/reject').set('x-user-id', 'approver-2').send({});
    expect(response.status).toBe(400);
    expect(record.save).not.toHaveBeenCalled();
  });
});
