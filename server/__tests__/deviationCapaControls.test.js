const express = require('express');
const request = require('supertest');

jest.mock('../models/DeviationCapa');
jest.mock('../models/BatchProduction');
jest.mock('../models/RolePermission');
jest.mock('../utils/documentCounter', () => ({ generateAtomicDocumentNumber: jest.fn().mockResolvedValue('DEV-00001') }));

const DeviationCapa = require('../models/DeviationCapa');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/manufacturing/deviations');

describe('Deviation CAPA independent resolution and closure controls', () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = {
        id: req.headers['x-test-user'] || 'reporter-1',
        name: req.headers['x-test-user-name'] || 'Deviation Reporter',
        role: 'admin'
      };
      next();
    });
    app.use('/api/manufacturing/deviations', router);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });
  const makeDeviation = (overrides = {}) => ({
    _id: 'deviation-1', batchId: 'batch-1', batchNo: 'BATCH-001',
    status: 'open', reportedBy: 'Deviation Reporter', reportedByUser: 'reporter-1',
    rootCause: '', correctiveAction: '', preventiveAction: '',
    signedOffBy: null, signedOffAt: null, save: jest.fn().mockResolvedValue(true),
    ...overrides
  });

  test('prevents reporter from signing off their own deviation as resolved', async () => {
    const dev = makeDeviation();
    DeviationCapa.findById.mockResolvedValue(dev);
    const res = await request(app).put('/api/manufacturing/deviations/deviation-1/signoff')
      .set('x-test-user', 'reporter-1').send({
        status: 'resolved', rootCause: 'Root cause', correctiveAction: 'Correction', preventiveAction: 'Prevention'
      });
    expect(res.status).toBe(409);
    expect(dev.save).not.toHaveBeenCalled();
  });

  test('requires documented root cause and both CAPA actions before resolution', async () => {
    const dev = makeDeviation({ status: 'under_investigation' });
    DeviationCapa.findById.mockResolvedValue(dev);
    const res = await request(app).put('/api/manufacturing/deviations/deviation-1/signoff')
      .set('x-test-user', 'investigator-1').send({ status: 'resolved', rootCause: 'Root cause' });
    expect(res.status).toBe(400);
    expect(dev.save).not.toHaveBeenCalled();
  });

  test('allows a different investigator to resolve a complete CAPA', async () => {
    const dev = makeDeviation({ status: 'under_investigation' });
    DeviationCapa.findById.mockResolvedValue(dev);
    const res = await request(app).put('/api/manufacturing/deviations/deviation-1/signoff')
      .set('x-test-user', 'investigator-1').set('x-test-user-name', 'CAPA Investigator')
      .send({ status: 'resolved', rootCause: 'Contaminated transfer hose', correctiveAction: 'Replace hose', preventiveAction: 'Add pre-use inspection' });
    expect(res.status).toBe(200);
    expect(dev.status).toBe('resolved');
    expect(dev.signedOffBy).toBe('investigator-1');
    expect(dev.signedOffByName).toBe('CAPA Investigator');
    expect(dev.signedOffAt).toBeInstanceOf(Date);
    expect(dev.save).toHaveBeenCalled();
  });

  test('blocks direct closure without an independent effectiveness check', async () => {
    const dev = makeDeviation({ status: 'resolved', signedOffBy: 'investigator-1', signedOffAt: new Date() });
    DeviationCapa.findById.mockResolvedValue(dev);
    const res = await request(app).put('/api/manufacturing/deviations/deviation-1/signoff')
      .set('x-test-user', 'qa-reviewer').send({ status: 'closed' });
    expect(res.status).toBe(409);
    expect(dev.save).not.toHaveBeenCalled();
  });

  test('requires independent verifier and evidence reference before closure', async () => {
    const dev = makeDeviation({ status: 'resolved', signedOffBy: 'investigator-1', signedOffAt: new Date() });
    DeviationCapa.findById.mockResolvedValue(dev);
    const res = await request(app).patch('/api/manufacturing/deviations/deviation-1/verify-closure')
      .set('x-test-user', 'investigator-1').send({ effectivenessCheck: 'Effective', effectivenessEvidenceRef: 'CAPA/EVIDENCE/001' });
    expect(res.status).toBe(409);
    expect(dev.save).not.toHaveBeenCalled();
  });

  test('closes only after independent effectiveness verification with evidence', async () => {
    const dev = makeDeviation({ status: 'resolved', signedOffBy: 'investigator-1', signedOffAt: new Date() });
    DeviationCapa.findById.mockResolvedValue(dev);
    const res = await request(app).patch('/api/manufacturing/deviations/deviation-1/verify-closure')
      .set('x-test-user', 'qa-reviewer').set('x-test-user-name', 'QA Verifier')
      .send({ effectivenessCheck: 'No recurrence observed during the approved observation period', effectivenessEvidenceRef: 'CAPA/EVIDENCE/001' });
    expect(res.status).toBe(200);
    expect(dev.status).toBe('closed');
    expect(dev.closureVerifiedBy).toBe('qa-reviewer');
    expect(dev.closureVerifiedByName).toBe('QA Verifier');
    expect(dev.closureVerifiedAt).toBeInstanceOf(Date);
    expect(dev.closedAt).toBeInstanceOf(Date);
    expect(dev.effectivenessEvidenceRef).toBe('CAPA/EVIDENCE/001');
    expect(dev.save).toHaveBeenCalled();
  });
});
