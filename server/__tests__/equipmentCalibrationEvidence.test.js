const express = require('express');
const request = require('supertest');

jest.mock('../models/Equipment');
jest.mock('../models/RolePermission');

const Equipment = require('../models/Equipment');
const RolePermission = require('../models/RolePermission');
const equipmentRouter = require('../routes/manufacturing/equipment');

describe('Equipment calibration evidence verification', () => {
  let app;
  const recorderId = '507f1f77bcf86cd799439011';
  const reviewerId = '507f1f77bcf86cd799439022';
  let item;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: req.headers['x-user-id'] || recorderId, name: req.headers['x-user-name'] || 'Calibration Engineer', role: 'admin' };
      next();
    });
    app.use('/api/manufacturing/equipment', equipmentRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    item = { _id: 'equipment-1', status: 'calibration_due', calibrationLogs: [], save: jest.fn().mockResolvedValue(true) };
    Equipment.findById.mockResolvedValue(item);
  });

  test('rejects calibration submissions without certificate evidence and dates', async () => {
    const res = await request(app).post('/api/manufacturing/equipment/equipment-1/calibrate').send({ certificateNo: 'CAL-FAKE-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('certificate evidence reference');
    expect(Equipment.findById).not.toHaveBeenCalled();
  });

  test('keeps equipment unavailable until a different user verifies the calibration record', async () => {
    const calibratedOn = new Date(Date.now() - 86400000);
    const nextDue = new Date(Date.now() + 180 * 86400000);
    const submitted = await request(app).post('/api/manufacturing/equipment/equipment-1/calibrate')
      .send({
        certificateNo: 'LAB-CERT-2026-0091',
        certificateRef: 'documents/calibration/LAB-CERT-2026-0091.pdf',
        calibratedOn: calibratedOn.toISOString(),
        nextCalibrationDue: nextDue.toISOString()
      });
    expect(submitted.status).toBe(201);
    expect(item.status).toBe('calibration_due');
    expect(item.calibrationLogs[0].status).toBe('pending_verification');

    const selfReview = await request(app).patch('/api/manufacturing/equipment/equipment-1/calibrations/0/verify')
      .send({ status: 'verified' });
    expect(selfReview.status).toBe(400);
    expect(selfReview.body.error).toContain('Independent calibration review');

    const verified = await request(app).patch('/api/manufacturing/equipment/equipment-1/calibrations/0/verify')
      .set('x-user-id', reviewerId).set('x-user-name', 'QA Reviewer').send({ status: 'verified' });
    expect(verified.status).toBe(200);
    expect(item.status).toBe('active');
    expect(item.calibrationLogs[0].status).toBe('verified');
    expect(item.calibrationLogs[0].verifiedBy).toBe(reviewerId);
    expect(item.calibrationLogs[0].verifiedAt).toBeInstanceOf(Date);
    expect(item.calibrationDueDate).toEqual(nextDue);
  });

  test('prevents direct PUT from bypassing controlled equipment status and calibration workflows', async () => {
    const res = await request(app).put('/api/manufacturing/equipment/equipment-1').send({ status: 'active', calibrationDueDate: '2028-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('controlled workflows');
    expect(Equipment.findById).not.toHaveBeenCalled();
  });
});
