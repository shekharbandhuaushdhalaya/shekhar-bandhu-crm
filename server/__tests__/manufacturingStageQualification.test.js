const express = require('express');
const request = require('supertest');

jest.mock('../models/BatchProduction');
jest.mock('../models/Equipment');
jest.mock('../models/TrainingRecord');
jest.mock('../models/RolePermission');

const BatchProduction = require('../models/BatchProduction');
const Equipment = require('../models/Equipment');
const TrainingRecord = require('../models/TrainingRecord');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/manufacturing/batchProductions');

describe('Manufacturing stage qualification and equipment controls', () => {
  let app;
  const operatorId = '507f1f77bcf86cd799439011';

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: operatorId, name: 'Manufacturing Operator', role: 'admin' };
      next();
    });
    app.use('/api/batch-productions', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    TrainingRecord.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({
      _id: 'training-record-1', topic: 'GMP', trainedBy: 'QA Lead', trainedByUser: 'trainer-1',
      certificateRef: 'training/GMP-2026.pdf', status: 'verified', verifiedBy: 'reviewer-1', verifiedAt: new Date()
    }) });
  });

  test('blocks stage completion without current independently verified training', async () => {
    const batch = { _id: 'batch-training-1', status: 'in_progress', stages: [{ name: 'Mixing', status: 'pending' }], save: jest.fn() };
    BatchProduction.findById.mockResolvedValue(batch);
    TrainingRecord.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    const res = await request(app).patch('/api/batch-productions/batch-training-1/stage/0').send({ status: 'completed' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('independently verified');
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('blocks stage completion when equipment calibration has not been independently verified', async () => {
    const batch = { _id: 'batch-calibration-1', status: 'in_progress', stages: [{ name: 'Mixing', status: 'pending' }], save: jest.fn() };
    BatchProduction.findById.mockResolvedValue(batch);
    Equipment.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({
      _id: 'equipment-1', name: 'Mixer', status: 'active',
      calibrationDueDate: new Date(Date.now() + 86400000), calibrationLogs: [{
        calibratedByUser: operatorId, certificateNo: 'CAL-001', certificateRef: 'docs/CAL-001.pdf',
        nextDue: new Date(Date.now() + 86400000), status: 'pending_verification'
      }]
    }) });

    const res = await request(app).patch('/api/batch-productions/batch-calibration-1/stage/0')
      .send({ status: 'completed', equipmentId: '507f1f77bcf86cd799439099' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('independently verified calibration certificate');
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('snapshots independently verified operator training and equipment calibration on stage completion', async () => {
    const nextDue = new Date(Date.now() + 86400000 * 30);
    const batch = { _id: 'batch-valid-1', status: 'in_progress', stages: [{ name: 'Mixing', status: 'pending' }], save: jest.fn().mockResolvedValue(true) };
    BatchProduction.findById.mockResolvedValue(batch);
    Equipment.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({
      _id: 'equipment-1', name: 'Mixer', status: 'active', calibrationDueDate: nextDue,
      calibrationLogs: [{
        calibratedByUser: 'calibration-recorder', certificateNo: 'CAL-VERIFIED-01',
        certificateRef: 'docs/CAL-VERIFIED-01.pdf', nextDue, status: 'verified',
        verifiedBy: 'calibration-reviewer', verifiedAt: new Date()
      }]
    }) });

    const res = await request(app).patch('/api/batch-productions/batch-valid-1/stage/0')
      .send({ status: 'completed', equipmentId: '507f1f77bcf86cd799439099' });

    expect(res.status).toBe(200);
    expect(batch.stages[0].operatorTrainingRecordId).toBe('training-record-1');
    expect(batch.stages[0].equipmentName).toBe('Mixer');
    expect(batch.stages[0].equipmentCalibrationStatus).toBe('valid');
    expect(batch.stages[0].equipmentCalibrationCertificateNo).toBe('CAL-VERIFIED-01');
    expect(batch.save).toHaveBeenCalled();
  });
});
