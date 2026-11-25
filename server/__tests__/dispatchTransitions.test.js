const express = require('express');
const request = require('supertest');

jest.mock('../models/Dispatch');
jest.mock('../models/InventoryEntry');
jest.mock('../models/Challan');
jest.mock('../models/Invoice');
jest.mock('../models/Order');
jest.mock('../models/RolePermission');
jest.mock('../services/dispatchService', () => ({
  recomputeOrderLogisticsFromChallan: jest.fn().mockResolvedValue(true)
}));

const Dispatch = require('../models/Dispatch');
const RolePermission = require('../models/RolePermission');
const { recomputeOrderLogisticsFromChallan } = require('../services/dispatchService');
const router = require('../routes/operations/dispatches');

describe('Dispatch optimistic state transitions', () => {
  let app;
  const dispatchId = '507f1f77bcf86cd799439011';
  const updatedAt = new Date('2026-11-25T10:00:00.000Z');

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: '507f191e810c19729de860ea', name: 'Dispatch Operator', role: 'admin' };
      next();
    });
    app.use('/api/dispatches', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    Dispatch.findById.mockResolvedValue({
      _id: dispatchId, challanId: 'challan-1', status: 'dispatched', updatedAt,
      proofOfDelivery: {}
    });
    Dispatch.findOneAndUpdate.mockResolvedValue({
      _id: dispatchId, challanId: 'challan-1', status: 'in_transit'
    });
  });

  test('applies shipment transition through a status-and-version conditional update', async () => {
    const response = await request(app).patch('/api/dispatches/' + dispatchId).send({ status: 'in_transit', trackingId: 'TRACK-001' });
    expect(response.status).toBe(200);
    expect(Dispatch.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: dispatchId, status: 'dispatched', updatedAt },
      { $set: { status: 'in_transit', trackingId: 'TRACK-001' } },
      { new: true, runValidators: true }
    );
    expect(recomputeOrderLogisticsFromChallan).toHaveBeenCalledWith('challan-1');
  });

  test('returns conflict instead of overwriting a concurrent dispatch update', async () => {
    Dispatch.findOneAndUpdate.mockResolvedValue(null);
    const response = await request(app).patch('/api/dispatches/' + dispatchId).send({ status: 'in_transit' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DISPATCH_UPDATE_CONFLICT');
    expect(recomputeOrderLogisticsFromChallan).not.toHaveBeenCalled();
  });

  test('requires proof-of-delivery evidence before recording delivered status', async () => {
    const response = await request(app).patch('/api/dispatches/' + dispatchId).send({ status: 'delivered' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('POD_REQUIRED');
    expect(Dispatch.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
