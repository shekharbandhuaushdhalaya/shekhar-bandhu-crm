const express = require('express');
const request = require('supertest');

jest.mock('../models/BatchProduction');
jest.mock('../models/ProductQualitySpecification');
jest.mock('../models/RolePermission');

const BatchProduction = require('../models/BatchProduction');
const ProductQualitySpecification = require('../models/ProductQualitySpecification');
const RolePermission = require('../models/RolePermission');
RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });

const router = require('../routes/manufacturing/batchProductions');
const { deductPackagingMaterials } = require('../services/batchProductionService');

describe('Evidence-driven batch QC summary', () => {
  let app;
  const productId = '507f1f77bcf86cd799439001';
  const specId = '507f1f77bcf86cd799439002';
  const reviewerId = '507f1f77bcf86cd799439003';
  const analystId = '507f1f77bcf86cd799439004';
  const baseSpec = {
    _id: specId, productId, status: 'approved', approvedBy: reviewerId,
    approvedAt: new Date('2026-10-01T10:00:00.000Z'), effectiveDate: new Date('2026-10-01T00:00:00.000Z'),
    specificationVersion: '1.0', pharmacopoeialStandard: 'Configured in-house specification',
    tests: [
      { code: 'IDENTITY', name: 'Identity', specification: 'Conforms', mandatory: true },
      { code: 'MOISTURE', name: 'Moisture', specification: 'As approved specification', mandatory: true }
    ]
  };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: analystId, name: 'QC Analyst', role: 'admin' };
      next();
    });
    app.use('/api/batch-productions', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions.mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    const batch = {
      _id: '507f1f77bcf86cd799439005', batchNo: 'BATCH-QC-01',
      productId: { _id: productId, name: 'Test Product', sku: 'TP-01' },
      qcSpecificationId: specId, qcStatus: 'approved',
      qcPassedBy: 'QC Analyst', qcPassedByUser: analystId,
      qcTests: [{
        code: 'IDENTITY', name: 'Identity', result: 'Conforms', status: 'pass',
        testedBy: analystId, testedByName: 'QC Analyst', testedAt: new Date('2026-11-01T10:00:00.000Z')
      }]
    };
    BatchProduction.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(batch) })
    });
    ProductQualitySpecification.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(baseSpec)
    });
  });

  test('lists mandatory specification tests that have not been recorded', async () => {
    const res = await request(app).get('/api/batch-productions/batch-id/coa');
    expect(res.status).toBe(200);
    expect(res.body.officialCertificate).toBe(false);
    expect(res.body.title).toContain('NOT A CERTIFICATE OF ANALYSIS');
    expect(res.body.overallResult).toBe('PENDING');
    expect(res.body.testResults.find(test => test.code === 'MOISTURE').status).toBe('NOT_RECORDED');
    expect(res.body.missingEvidence).toContain('Required QC test not recorded: MOISTURE');
    expect(res.body.firmDetails).toBeUndefined();
  });

  test('does not report PASS before independent QA release', async () => {
    const batch = {
      _id: '507f1f77bcf86cd799439005', batchNo: 'BATCH-QC-02',
      productId: { _id: productId, name: 'Test Product', sku: 'TP-01' },
      qcSpecificationId: specId, qcStatus: 'approved',
      qcPassedBy: 'QC Analyst', qcPassedByUser: analystId,
      qcTests: baseSpec.tests.map(test => ({
        code: test.code, name: test.name, result: 'Conforms', status: 'pass',
        testedBy: analystId, testedByName: 'QC Analyst', testedAt: new Date('2026-11-01T10:00:00.000Z')
      }))
    };
    BatchProduction.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(batch) })
    });
    const res = await request(app).get('/api/batch-productions/batch-id/coa');
    expect(res.status).toBe(200);
    expect(res.body.documentStatus).toBe('READY_FOR_QA_REVIEW');
    expect(res.body.overallResult).toBe('PENDING');
  });

  test('reports PASS only with all mandatory tests, analyst disposition and independent release', async () => {
    const batch = {
      _id: '507f1f77bcf86cd799439005', batchNo: 'BATCH-QC-03',
      productId: { _id: productId, name: 'Test Product', sku: 'TP-01' },
      qcSpecificationId: specId, qcStatus: 'approved',
      qcPassedBy: 'QC Analyst', qcPassedByUser: analystId,
      releasedBy: reviewerId, releasedByName: 'QA Reviewer', releasedAt: new Date('2026-11-02T10:00:00.000Z'),
      qcTests: baseSpec.tests.map(test => ({
        code: test.code, name: test.name, result: 'Conforms', status: 'pass',
        testedBy: analystId, testedByName: 'QC Analyst', testedAt: new Date('2026-11-01T10:00:00.000Z')
      }))
    };
    BatchProduction.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(batch) })
    });
    const res = await request(app).get('/api/batch-productions/batch-id/coa');
    expect(res.status).toBe(200);
    expect(res.body.overallResult).toBe('PASS');
    expect(res.body.documentStatus).toBe('RELEASE_RECORDED');
  });
});

describe('Packaging stock issue controls', () => {
  test('does not deduct or accept packaging without independently verified dispensing', async () => {
    const batch = {
      packagingDeducted: false,
      bomSnapshot: { ingredients: [{ rawMaterialId: 'material-1', itemType: 'packaging', qtyRequired: 2 }] },
      ingredientsConsumed: []
    };
    await expect(deductPackagingMaterials(batch, 10)).rejects.toThrow('PACKAGING_DISPENSING_REQUIRED');
    expect(batch.packagingDeducted).toBe(false);
  });

  test('accepts packaging only when verified dispensing genealogy covers actual output', async () => {
    const batch = {
      packagingDeducted: false,
      bomSnapshot: { ingredients: [{ rawMaterialId: 'material-1', itemType: 'packaging', qtyRequired: 2 }] },
      ingredientsConsumed: [{ rawMaterialId: 'material-1', qtyConsumed: 20, dispensingNo: 'DSP-000001' }]
    };
    await expect(deductPackagingMaterials(batch, 10)).resolves.toBeUndefined();
    expect(batch.packagingDeducted).toBe(true);
  });
});
