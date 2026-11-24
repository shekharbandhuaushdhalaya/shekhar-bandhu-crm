const express = require('express');
const request = require('supertest');

jest.mock('../models/TrainingRecord');
jest.mock('../models/RolePermission');

const TrainingRecord = require('../models/TrainingRecord');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/manufacturing/trainingRecords');

describe('Operator training evidence and independent verification', () => {
  let app;
  const recorderId = '507f1f77bcf86cd799439011';
  const reviewerId = '507f1f77bcf86cd799439022';
  let record;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: req.headers['x-user-id'] || recorderId, name: req.headers['x-user-name'] || 'Training Coordinator', role: 'admin' };
      next();
    });
    app.use('/api/manufacturing/training-records', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    record = {
      _id: 'training-1', userId: '507f1f77bcf86cd799439033', trainedByUser: recorderId,
      trainedBy: 'Training Coordinator', topic: 'GMP', trainedOn: new Date(Date.now() - 86400000),
      validUntil: new Date(Date.now() + 86400000 * 30), certificateRef: 'training/GMP.pdf',
      status: 'pending_verification', save: jest.fn().mockResolvedValue(true)
    };
  });

  test('requires training evidence reference and validity dates', async () => {
    const res = await request(app).post('/api/manufacturing/training-records').send({ userId: '507f1f77bcf86cd799439033', topic: 'GMP' });
    expect(res.status).toBe(400);
    expect(TrainingRecord.create).not.toHaveBeenCalled();
  });

  test('requires an independent reviewer before training can qualify an operator', async () => {
    TrainingRecord.findById.mockResolvedValue(record);
    const self = await request(app).patch('/api/manufacturing/training-records/training-1/verify').send({ status: 'verified' });
    expect(self.status).toBe(400);
    expect(self.body.error).toContain('Independent training evidence review');

    const verified = await request(app).patch('/api/manufacturing/training-records/training-1/verify')
      .set('x-user-id', reviewerId).set('x-user-name', 'QA Reviewer').send({ status: 'verified' });
    expect(verified.status).toBe(200);
    expect(record.status).toBe('verified');
    expect(record.verifiedBy).toBe(reviewerId);
    expect(record.verifiedAt).toBeInstanceOf(Date);
    expect(record.save).toHaveBeenCalled();
  });
});
