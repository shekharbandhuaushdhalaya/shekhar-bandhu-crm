const express = require('express');
const request = require('supertest');

jest.mock('../models/SalesReturn');
jest.mock('../middleware/authorize', () => ({ authorize: () => (_req, _res, next) => next() }));
jest.mock('../utils/auditLogger', () => ({ logAction: jest.fn().mockResolvedValue(true) }));
jest.mock('../services/salesReturnService', () => ({
  createSalesReturn: jest.fn(),
  postSalesReturn: jest.fn(),
  reverseSalesReturn: jest.fn(),
  dispositionSalesReturnItem: jest.fn()
}));

const SalesReturn = require('../models/SalesReturn');
const service = require('../services/salesReturnService');
const router = require('../routes/sales/salesReturns');

describe('Sales Return API lifecycle', () => {
  let app;
  const actor = { id: '507f191e810c19729de860ea', name: 'Return Reviewer' };
  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = actor; next(); });
    app.use('/api/sales-returns', router);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    service.createSalesReturn.mockResolvedValue({ _id: 'ret-1', returnNo: 'SR-00001', status: 'draft', challanId: 'challan-1' });
    service.postSalesReturn.mockResolvedValue({ _id: 'ret-1', returnNo: 'SR-00001', status: 'posted' });
    service.dispositionSalesReturnItem.mockResolvedValue({ _id: 'ret-1', returnNo: 'SR-00001' });
    service.reverseSalesReturn.mockResolvedValue({ _id: 'ret-1', returnNo: 'SR-00001', status: 'reversed' });
  });

  test('creates a return draft only when an original Challan and return lines are supplied', async () => {
    const response = await request(app).post('/api/sales-returns').send({ challanId: 'challan-1', items: [{ productId: 'p1', qty: 1 }] });
    expect(response.status).toBe(201);
    expect(service.createSalesReturn).toHaveBeenCalledWith(expect.objectContaining({ challanId: 'challan-1' }), actor);
  });

  test('posts through the transactional service with the authenticated actor', async () => {
    const response = await request(app).patch('/api/sales-returns/ret-1/post');
    expect(response.status).toBe(200);
    expect(service.postSalesReturn).toHaveBeenCalledWith('ret-1', actor);
  });

  test('requires independent QA disposition evidence and records the requested item index', async () => {
    const response = await request(app).patch('/api/sales-returns/ret-1/items/0/disposition')
      .send({ disposition: 'approved', notes: 'Identity and physical condition independently verified' });
    expect(response.status).toBe(200);
    expect(service.dispositionSalesReturnItem).toHaveBeenCalledWith('ret-1', '0', {
      disposition: 'approved', notes: 'Identity and physical condition independently verified', actor
    });
  });

  test('requires a substantive reason before reversal', async () => {
    const response = await request(app).patch('/api/sales-returns/ret-1/reverse').send({ reason: 'Undo' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('RETURN_REVERSAL_REASON_REQUIRED');
    expect(service.reverseSalesReturn).not.toHaveBeenCalled();
  });

  test('reverses through the service with authenticated actor and reason', async () => {
    const response = await request(app).patch('/api/sales-returns/ret-1/reverse')
      .send({ reason: 'Duplicate return posted against the same Challan' });
    expect(response.status).toBe(200);
    expect(service.reverseSalesReturn).toHaveBeenCalledWith('ret-1', actor, 'Duplicate return posted against the same Challan');
  });
});
