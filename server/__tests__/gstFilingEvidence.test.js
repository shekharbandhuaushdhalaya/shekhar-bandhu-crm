const express = require('express');
const request = require('supertest');

jest.mock('../models/Invoice');
jest.mock('../models/CreditNote');
jest.mock('../models/GstFiling');
jest.mock('../middleware/authorize', () => ({
  authorize: jest.fn(() => (req, _res, next) => next())
}));

const GstFiling = require('../models/GstFiling');
const { authorize } = require('../middleware/authorize');
const router = require('../routes/finance/gstReturns');

describe('GST filing evidence controls', () => {
  let app;
  const actorId = '507f1f77bcf86cd799439011';

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: actorId, name: 'Finance Controller' };
      req.io = { emit: jest.fn() };
      next();
    });
    app.use('/api/gst', router);
  });

  beforeEach(() => {
    GstFiling.create = jest.fn().mockResolvedValue({ _id: 'filing-1' });
    GstFiling.findOne = jest.fn();
  });

  test('requires invoice-finalize permission to record filing evidence', async () => {
    const response = await request(app).post('/api/gst/filing-status').send({
      period: '2026-10', returnType: 'gstr1', arn: 'AA091026123456X'
    });
    expect(authorize).toHaveBeenCalledWith('invoice:finalize');
    expect(response.status).toBe(201);
  });

  test('persists authenticated operator identity and does not claim portal verification', async () => {
    const filing = { _id: 'filing-1', arn: 'AA091026123456X' };
    GstFiling.create.mockResolvedValue(filing);
    const response = await request(app).post('/api/gst/filing-status').send({
      period: '2026-10', returnType: 'gstr1', arn: 'AA091026123456X',
      snapshot: { taxableValue: 1200 }, url: 'https://example.test/receipt.pdf'
    });
    expect(response.status).toBe(201);
    expect(response.body.portalVerified).toBe(false);
    expect(GstFiling.create).toHaveBeenCalledWith(expect.objectContaining({
      period: '2026-10', returnType: 'gstr1', arn: 'AA091026123456X',
      filedBy: 'Finance Controller', filedByUserId: actorId,
      snapshot: { taxableValue: 1200 },
      supportingDocuments: [expect.objectContaining({ url: 'https://example.test/receipt.pdf' })]
    }));
  });

  test('rejects malformed periods and unsupported return types', async () => {
    let response = await request(app).post('/api/gst/filing-status').send({
      period: '2026-13', returnType: 'gstr1', arn: 'ARN-1'
    });
    expect(response.status).toBe(400);
    response = await request(app).post('/api/gst/filing-status').send({
      period: '2026-10', returnType: 'gstr9', arn: 'ARN-1'
    });
    expect(response.status).toBe(400);
    expect(GstFiling.create).not.toHaveBeenCalled();
  });

  test('returns a conflict rather than overwriting an existing filing record', async () => {
    GstFiling.create.mockRejectedValue({ code: 11000 });
    const response = await request(app).post('/api/gst/filing-status').send({
      period: '2026-10', returnType: 'gstr1', arn: 'ARN-2'
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('GST_FILING_ALREADY_RECORDED');
  });

  test('validates lookup parameters before querying', async () => {
    const response = await request(app).get('/api/gst/filing-status?period=2026-00&returnType=gstr1');
    expect(response.status).toBe(400);
    expect(GstFiling.findOne).not.toHaveBeenCalled();
  });
});
