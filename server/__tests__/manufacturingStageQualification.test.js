const express = require('express');
const request = require('supertest');

jest.mock('../models/BatchProduction');
jest.mock('../models/Equipment');
jest.mock('../models/TrainingRecord');
jest.mock('../models/RolePermission');
jest.mock('../models/LineClearance');

const BatchProduction = require('../models/BatchProduction');
const Equipment = require('../models/Equipment');
const TrainingRecord = require('../models/TrainingRecord');
const RolePermission = require('../models/RolePermission');
const LineClearance = require('../models/LineClearance');
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
    LineClearance.findOne.mockResolvedValue({
      cleared: true, submittedBy: 'line-operator', submittedAt: new Date(), clearedBy: 'clearance-reviewer', clearedAt: new Date(), verifiedBy: 'clearance-reviewer', verifiedAt: new Date(),
      checklist: { equipmentCleaned: true, previousMaterialsRemoved: true, previousLabelsDocumentsRemoved: true, areaVisuallyInspected: true }
    });
    TrainingRecord.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({
      _id: 'training-record-1', topic: 'GMP', trainedBy: 'QA Lead', trainedByUser: 'trainer-1',
      certificateRef: 'training/GMP-2026.pdf', status: 'verified', verifiedBy: 'reviewer-1', verifiedAt: new Date()
    }) });
  });

  test('blocks stage completion without current independently verified training', async () => {
    const batch = { _id: 'batch-training-1', status: 'in_progress', bmrApprovedBy: 'bmr-reviewer', bmrApprovedByName: 'BMR Reviewer', bmrApprovedAt: new Date(), stages: [{ name: 'Mixing', status: 'pending' }], save: jest.fn() };
    BatchProduction.findById.mockResolvedValue(batch);
    TrainingRecord.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    const res = await request(app).patch('/api/batch-productions/batch-training-1/stage/0').send({ status: 'completed' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('independently verified');
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('blocks stage completion when equipment calibration has not been independently verified', async () => {
    const batch = { _id: 'batch-calibration-1', status: 'in_progress', bmrApprovedBy: 'bmr-reviewer', bmrApprovedByName: 'BMR Reviewer', bmrApprovedAt: new Date(), stages: [{ name: 'Mixing', status: 'pending' }], save: jest.fn() };
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
    const batch = { _id: 'batch-valid-1', status: 'in_progress', bmrApprovedBy: 'bmr-reviewer', bmrApprovedByName: 'BMR Reviewer', bmrApprovedAt: new Date(), stages: [{ name: 'Mixing', status: 'pending' }], save: jest.fn().mockResolvedValue(true) };
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

  test('does not start the next stage until the previous stage is independently verified', async () => {
    const batch = { _id: 'batch-stage-sequence-1', status: 'in_progress', stages: [
      { name: 'Mixing', status: 'completed', performedBy: 'operator-1' },
      { name: 'Drying', status: 'pending' }
    ], save: jest.fn() };
    BatchProduction.findById.mockResolvedValue(batch);
    const res = await request(app).patch('/api/batch-productions/batch-stage-sequence-1/stage/1')
      .send({ status: 'in_progress' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PREVIOUS_STAGE_VERIFICATION_REQUIRED');
    expect(batch.stages[1].status).toBe('pending');
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('requires a reason when a stage is formally skipped', async () => {
    const batch = { _id: 'batch-stage-skip-1', status: 'in_progress', stages: [
      { name: 'Optional Process', status: 'pending' }
    ], save: jest.fn() };
    BatchProduction.findById.mockResolvedValue(batch);
    const res = await request(app).patch('/api/batch-productions/batch-stage-skip-1/stage/0')
      .send({ status: 'skipped' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('STAGE_SKIP_REASON_REQUIRED');
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('does not automatically start the next stage when the current stage completes', async () => {
    const batch = { _id: 'batch-stage-no-auto-advance', status: 'in_progress', stages: [
      { name: 'Mixing', status: 'in_progress', performedBy: 'operator-1' },
      { name: 'Drying', status: 'pending' }
    ], save: jest.fn().mockResolvedValue(true) };
    BatchProduction.findById.mockResolvedValue(batch);
    const res = await request(app).patch('/api/batch-productions/batch-stage-no-auto-advance/stage/0')
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(batch.stages[1].status).toBe('pending');
    expect(batch.save).toHaveBeenCalled();
  });

  test('blocks a filling stage until its own line clearance is independently verified', async () => {
    const batch = { _id: 'batch-filling-clearance-1', status: 'in_progress', stages: [
      { name: 'Mixing', status: 'completed', performedBy: 'operator-before', verifiedBy: 'independent-verifier', verifiedAt: new Date() }, { name: 'Filling', status: 'pending' }
    ], save: jest.fn() };
    BatchProduction.findById.mockResolvedValue(batch);
    LineClearance.findOne.mockResolvedValue(null);
    const res = await request(app).patch('/api/batch-productions/batch-filling-clearance-1/stage/1').send({ status: 'in_progress' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STAGE_LINE_CLEARANCE_REQUIRED');
    expect(res.body.phase).toBe('filling');
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('blocks a packing stage until its own line clearance is independently verified', async () => {
    const batch = { _id: 'batch-packing-clearance-1', status: 'in_progress', stages: [
      { name: 'Drying', status: 'completed', performedBy: 'operator-before', verifiedBy: 'independent-verifier', verifiedAt: new Date() }, { name: 'Packaging & Labeling', status: 'pending' }
    ], save: jest.fn() };
    BatchProduction.findById.mockResolvedValue(batch);
    LineClearance.findOne.mockResolvedValue(null);
    const res = await request(app).patch('/api/batch-productions/batch-packing-clearance-1/stage/1').send({ status: 'in_progress' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STAGE_LINE_CLEARANCE_REQUIRED');
    expect(res.body.phase).toBe('packing');
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('allows a filling stage to start only after a complete independent clearance', async () => {
    const batch = { _id: 'batch-filling-clearance-valid', status: 'in_progress', stages: [
      { name: 'Mixing', status: 'completed' }, { name: 'Filling', status: 'pending' }
    ], save: jest.fn().mockResolvedValue(true) };
    BatchProduction.findById.mockResolvedValue(batch);
    LineClearance.findOne.mockResolvedValue({
      cleared: true, submittedBy: 'line-operator', verifiedBy: 'independent-reviewer',
      verifiedAt: new Date(), clearedBy: 'independent-reviewer', clearedAt: new Date(),
      checklist: { equipmentCleaned: true, previousMaterialsRemoved: true, previousLabelsDocumentsRemoved: true, areaVisuallyInspected: true }
    });
    const res = await request(app).patch('/api/batch-productions/batch-filling-clearance-valid/stage/1').send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(batch.stages[1].status).toBe('in_progress');
    expect(batch.save).toHaveBeenCalled();
  });

});
