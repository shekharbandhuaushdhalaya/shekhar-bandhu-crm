const express = require('express');
const request = require('supertest');

jest.mock('../models/Order');
jest.mock('../models/Challan');
jest.mock('../models/Invoice');
jest.mock('../models/Dispatch');
jest.mock('../models/RolePermission');
jest.mock('../utils/auditLogger', () => ({ logAction: jest.fn().mockResolvedValue(true) }));

const Order = require('../models/Order');
const Challan = require('../models/Challan');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/sales/orders');

describe('Sales order maker-checker and concurrent approval', () => {
  let app;
  const orderId = '507f1f77bcf86cd799439011';
  const updatedAt = new Date('2026-11-25T10:00:00.000Z');

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: req.headers['x-user-id'] || '507f191e810c19729de860ea', name: req.headers['x-user-name'] || 'Order Reviewer', role: 'admin' };
      next();
    });
    app.use('/api/orders', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    Order.findById.mockResolvedValue({
      _id: orderId, status: 'pending', approvalStatus: 'pending_approval',
      createdByUserId: '507f1f77bcf86cd799439022', updatedAt
    });
    Order.findOneAndUpdate.mockResolvedValue({
      _id: orderId, status: 'processing', approvalStatus: 'approved',
      approvedByUserId: '507f191e810c19729de860ea'
    });
    Challan.exists.mockResolvedValue(false);
  });

  test('approves an order using a conditional versioned update and records reviewer identity', async () => {
    const response = await request(app).patch('/api/orders/' + orderId + '/approve');
    expect(response.status).toBe(200);
    expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: orderId, status: 'pending', approvalStatus: 'pending_approval', updatedAt },
      { $set: expect.objectContaining({
        approvalStatus: 'approved', status: 'processing',
        approvedByUserId: '507f191e810c19729de860ea',
        approvedBy: 'Order Reviewer', approvedAt: expect.any(Date)
      }) },
      { new: true, runValidators: true }
    );
  });

  test('prevents the order creator from approving their own order', async () => {
    Order.findById.mockResolvedValue({
      _id: orderId, status: 'pending', approvalStatus: 'pending_approval',
      createdByUserId: '507f191e810c19729de860ea'
    });
    const response = await request(app).patch('/api/orders/' + orderId + '/approve');
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ORDER_MAKER_CHECKER_REQUIRED');
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('returns conflict when another reviewer has already changed the order', async () => {
    Order.findOneAndUpdate.mockResolvedValue(null);
    const response = await request(app).patch('/api/orders/' + orderId + '/approve');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ORDER_APPROVAL_CONCURRENT_UPDATE');
  });

  test('requires a substantive rejection reason', async () => {
    const response = await request(app).patch('/api/orders/' + orderId + '/reject').send({ reason: 'No' });
    expect(response.status).toBe(400);
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('prevents the order creator from rejecting their own order', async () => {
    Order.findById.mockResolvedValue({
      _id: orderId, status: 'pending', approvalStatus: 'pending_approval',
      createdByUserId: '507f191e810c19729de860ea'
    });
    const response = await request(app).patch('/api/orders/' + orderId + '/reject').send({ reason: 'Not justified for current demand' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ORDER_MAKER_CHECKER_REQUIRED');
  });

  test('blocks rejection after a posted Challan exists', async () => {
    Challan.exists.mockResolvedValue(true);
    const response = await request(app).patch('/api/orders/' + orderId + '/reject').send({ reason: 'Not justified for current demand' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('POSTED_CHALLAN_EXISTS');
    expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects a stale concurrent rejection decision', async () => {
    Order.findOneAndUpdate.mockResolvedValue(null);
    const response = await request(app).patch('/api/orders/' + orderId + '/reject').send({ reason: 'Not justified for current demand' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ORDER_REJECTION_CONCURRENT_UPDATE');
  });
});
