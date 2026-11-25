const express = require('express');
const request = require('supertest');

jest.mock('../models/LineClearance');
jest.mock('../models/BatchProduction');
jest.mock('../models/RolePermission');

const LineClearance = require('../models/LineClearance');
const BatchProduction = require('../models/BatchProduction');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/manufacturing/lineClearances');

describe('GMP line-clearance maker-checker workflow', () => {
  let app;
  const batchId = '507f1f77bcf86cd799439010';
  const submitterId = '507f1f77bcf86cd799439011';
  const reviewerId = '507f1f77bcf86cd799439012';
  const checklist = { equipmentCleaned: true, previousMaterialsRemoved: true, previousLabelsDocumentsRemoved: true, areaVisuallyInspected: true };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: req.headers['x-user-id'] || submitterId, name: 'Quality User', role: 'admin' };
      next();
    });
    app.use('/api/manufacturing/line-clearances', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    BatchProduction.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: batchId, manufacturingUnitId: '507f1f77bcf86cd799439013' }) });
    LineClearance.findOne.mockResolvedValue(null);
    LineClearance.findOneAndUpdate.mockImplementation(async (filter, update) => ({ _id: 'clearance-1', batchId, phase: filter.phase, ...update.$set }));
  });

  test('submits checklist as pending; it does not self-clear the production line', async () => {
    const response = await request(app).post('/api/manufacturing/line-clearances').send({ batchId, phase: 'manufacturing', checklist });
    expect(response.status).toBe(201);
    expect(response.body.cleared).toBe(false);
    expect(response.body.submittedBy).toBe(submitterId);
    expect(response.body.verifiedBy).toBeNull();
    expect(LineClearance.findOneAndUpdate).toHaveBeenCalledWith(
      { batchId, phase: 'manufacturing' },
      expect.objectContaining({ $set: expect.objectContaining({ submittedBy: submitterId, cleared: false, verifiedAt: null }) }),
      expect.any(Object)
    );
  });

  test('requires a different reviewer and complete checklist to verify', async () => {
    const record = { _id: 'clearance-1', batchId, phase: 'manufacturing', cleared: false, submittedBy: submitterId, checklist, save: jest.fn().mockResolvedValue(true) };
    LineClearance.findById.mockResolvedValue(record);
    const self = await request(app).patch('/api/manufacturing/line-clearances/clearance-1/verify').send({});
    expect(self.status).toBe(409);
    expect(self.body.error).toMatch(/cannot verify their own/i);
    expect(record.save).not.toHaveBeenCalled();

    const verified = await request(app).patch('/api/manufacturing/line-clearances/clearance-1/verify').set('x-user-id', reviewerId).send({});
    expect(verified.status).toBe(200);
    expect(record.cleared).toBe(true);
    expect(record.verifiedBy).toBe(reviewerId);
    expect(record.verifiedAt).toBeInstanceOf(Date);
    expect(record.save).toHaveBeenCalled();
  });

  test('blocks verification until every checklist item is complete', async () => {
    const record = { _id: 'clearance-2', cleared: false, submittedBy: submitterId, checklist: { ...checklist, areaVisuallyInspected: false }, save: jest.fn() };
    LineClearance.findById.mockResolvedValue(record);
    const response = await request(app).patch('/api/manufacturing/line-clearances/clearance-2/verify').set('x-user-id', reviewerId).send({});
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/all line-clearance checklist items/i);
    expect(record.save).not.toHaveBeenCalled();
  });

  test('does not allow a verified clearance to be overwritten', async () => {
    LineClearance.findOne.mockResolvedValue({ cleared: true });
    const response = await request(app).post('/api/manufacturing/line-clearances').send({ batchId, phase: 'manufacturing', checklist });
    expect(response.status).toBe(409);
    expect(LineClearance.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
