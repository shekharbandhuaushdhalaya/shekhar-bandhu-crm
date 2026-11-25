const express = require('express');
const request = require('supertest');

jest.mock('../models/BatchProduction');
jest.mock('../models/ProductQualitySpecification');
jest.mock('../models/RolePermission');
jest.mock('../utils/withTransaction', () => ({
  withTransaction: jest.fn(async work => work({}))
}));


const BatchProduction = require('../models/BatchProduction');
const ProductQualitySpecification = require('../models/ProductQualitySpecification');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/manufacturing/batchProductions');

describe('Product-specific QC test recording and independent QA disposition', () => {
  let app;
  const productId = 'product-qc-1';
  const specId = 'spec-qc-1';
  const makeBatch = (overrides = {}) => ({
    _id: 'batch-qc-1', productId, status: 'completed',
    qcSpecificationId: null, qcTests: [], qcStatus: 'pending', updatedAt: new Date(),
    save: jest.fn().mockResolvedValue(true), ...overrides
  });
  const spec = {
    _id: specId, productId, status: 'approved', approvedBy: 'spec-reviewer',
    approvedAt: new Date(), effectiveDate: new Date(Date.now() - 86400000),
    specificationVersion: '2.1',
    tests: [
      { code: 'IDENTITY', name: 'Identity', category: 'identity', specification: 'Conforms', mandatory: true, methodReference: 'Configured method' },
      { code: 'MOISTURE', name: 'Moisture', category: 'physicochemical', specification: 'As approved specification', unit: '%', mandatory: true },
      { code: 'COLOUR', name: 'Colour', category: 'organoleptic', specification: 'As approved reference', mandatory: false }
    ]
  };
  const mockBatch = batch => {
    BatchProduction.findById.mockResolvedValue(batch);
    BatchProduction.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(batch) });
  };
  const mockSpec = value => ProductQualitySpecification.findById.mockReturnValue({
    session: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value)
  });

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: req.headers['x-user-id'] || 'qc-analyst-1', name: req.headers['x-user-name'] || 'QC Analyst', role: 'admin' };
      next();
    });
    app.use('/api/batch-productions', router);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    mockSpec(spec);
  });

  test('records only actual values and derives pending status until every mandatory test passes', async () => {
    const batch = makeBatch();
    mockBatch(batch);
    const res = await request(app).patch('/api/batch-productions/batch-qc-1/qc-tests')
      .send({ qcSpecificationId: specId, tests: [{ code: 'IDENTITY', result: 'Conforms', status: 'pass' }] });
    expect(res.status).toBe(200);
    expect(batch.qcSpecificationId).toBe(specId);
    expect(batch.qcSpecificationVersion).toBe('2.1');
    expect(batch.qcTests[0]).toMatchObject({
      code: 'IDENTITY', result: 'Conforms', status: 'pass',
      testedBy: 'qc-analyst-1', testedByName: 'QC Analyst'
    });
    expect(batch.qcTests[0].testedAt).toBeInstanceOf(Date);
    expect(batch.qcStatus).toBe('pending');
    expect(batch.qcPassedByUser).toBeNull();
    expect(res.body.mandatoryTestsPassed).toBe(false);
  });

  test('approves QC disposition only when all mandatory tests are recorded as passed', async () => {
    const batch = makeBatch();
    mockBatch(batch);
    const res = await request(app).patch('/api/batch-productions/batch-qc-1/qc-tests')
      .send({ qcSpecificationId: specId, tests: [
        { code: 'IDENTITY', result: 'Conforms', status: 'pass' },
        { code: 'MOISTURE', numericResult: 4.2, status: 'pass' }
      ] });
    expect(res.status).toBe(200);
    expect(batch.qcStatus).toBe('pending_qa_review');
    expect(batch.qcPassedByUser).toBe('qc-analyst-1');
    expect(res.body.mandatoryTestsPassed).toBe(true);
  });

  test('puts a batch on QC hold when any recorded test fails', async () => {
    const batch = makeBatch();
    mockBatch(batch);
    const res = await request(app).patch('/api/batch-productions/batch-qc-1/qc-tests')
      .send({ qcSpecificationId: specId, tests: [{ code: 'IDENTITY', result: 'Does not conform', status: 'fail' }] });
    expect(res.status).toBe(200);
    expect(batch.qcStatus).toBe('rejected');
    expect(batch.status).toBe('qc_hold');
    expect(res.body.deviationRequired).toBe(true);
  });

  test('rejects a QC result submission when the batch changes after the analyst read it', async () => {
    const batch = makeBatch();
    mockBatch(batch);
    BatchProduction.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
    const res = await request(app).patch('/api/batch-productions/batch-qc-1/qc-tests')
      .send({ qcSpecificationId: specId, tests: [{ code: 'IDENTITY', result: 'Conforms', status: 'pass' }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QC_TEST_CONFLICT');
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('rejects unapproved, wrong-product or ineffective specifications', async () => {
    const batch = makeBatch();
    mockBatch(batch);
    mockSpec({ ...spec, status: 'draft' });
    const res = await request(app).patch('/api/batch-productions/batch-qc-1/qc-tests')
      .send({ qcSpecificationId: specId, tests: [{ code: 'IDENTITY', result: 'Conforms', status: 'pass' }] });
    expect(res.status).toBe(409);
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('rejects test codes outside the approved specification and duplicate result overwrites', async () => {
    const batch = makeBatch();
    mockBatch(batch);
    const res = await request(app).patch('/api/batch-productions/batch-qc-1/qc-tests')
      .send({ qcSpecificationId: specId, tests: [{ code: 'MADE_UP', result: 'PASS', status: 'pass' }] });
    expect(res.status).toBe(400);
    expect(batch.save).not.toHaveBeenCalled();
    batch.qcTests = [{ code: 'IDENTITY', status: 'pass' }];
    const duplicate = await request(app).patch('/api/batch-productions/batch-qc-1/qc-tests')
      .send({ qcSpecificationId: specId, tests: [{ code: 'IDENTITY', result: 'Conforms', status: 'pass' }] });
    expect(duplicate.status).toBe(409);
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('requires an actual result value even when a pass status is supplied', async () => {
    const batch = makeBatch();
    mockBatch(batch);
    const res = await request(app).patch('/api/batch-productions/batch-qc-1/qc-tests')
      .send({ qcSpecificationId: specId, tests: [{ code: 'IDENTITY', status: 'pass' }] });
    expect(res.status).toBe(400);
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('requires an independent QA reviewer to approve the completed analyst disposition', async () => {
    const batch = makeBatch({ qcStatus: 'pending_qa_review', qcSpecificationId: specId, qcSpecificationVersion: '2.1',
      qcPassedByUser: 'qc-analyst-1', qcTests: [
        { code: 'IDENTITY', result: 'Conforms', status: 'pass' },
        { code: 'MOISTURE', numericResult: 4.2, status: 'pass' }
      ] });
    mockBatch(batch);
    const self = await request(app).patch('/api/batch-productions/batch-qc-1/qc-approval').send({ notes: 'Reviewed results' });
    expect(self.status).toBe(409);
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('blocks QA approval when the pinned specification belongs to another product', async () => {
    const batch = makeBatch({ qcStatus: 'pending_qa_review', qcSpecificationId: specId, qcSpecificationVersion: '2.1',
      qcPassedByUser: 'qc-analyst-1', qcTests: [
        { code: 'IDENTITY', result: 'Conforms', status: 'pass' },
        { code: 'MOISTURE', numericResult: 4.2, status: 'pass' }
      ] });
    mockBatch(batch);
    mockSpec({ ...spec, productId: 'different-product' });
    const res = await request(app).patch('/api/batch-productions/batch-qc-1/qc-approval')
      .set('x-user-id', 'qa-reviewer-2').set('x-user-name', 'QA Reviewer').send({ notes: 'Reviewed' });
    expect(res.status).toBe(409);
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('blocks QA approval against a future-effective specification', async () => {
    const batch = makeBatch({ qcStatus: 'pending_qa_review', qcSpecificationId: specId, qcSpecificationVersion: '2.1',
      qcPassedByUser: 'qc-analyst-1', qcTests: [
        { code: 'IDENTITY', result: 'Conforms', status: 'pass' },
        { code: 'MOISTURE', numericResult: 4.2, status: 'pass' }
      ] });
    mockBatch(batch);
    mockSpec({ ...spec, effectiveDate: new Date(Date.now() + 86400000) });
    const res = await request(app).patch('/api/batch-productions/batch-qc-1/qc-approval')
      .set('x-user-id', 'qa-reviewer-2').set('x-user-name', 'QA Reviewer').send({ notes: 'Reviewed' });
    expect(res.status).toBe(409);
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('rejects QA approval when the batch changes after the reviewer read it', async () => {
    const batch = makeBatch({
      qcStatus: 'pending_qa_review',
      qcSpecificationId: specId,
      qcSpecificationVersion: '2.1',
      qcPassedByUser: 'qc-analyst-1',
      qcTests: [
        { code: 'IDENTITY', result: 'Conforms', status: 'pass' },
        { code: 'MOISTURE', numericResult: 4.2, status: 'pass' }
      ]
    });
    mockBatch(batch);
    BatchProduction.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
    const res = await request(app).patch('/api/batch-productions/batch-qc-1/qc-approval')
      .set('x-user-id', 'qa-reviewer-2').set('x-user-name', 'QA Reviewer')
      .send({ notes: 'Reviewed latest QC evidence' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QC_APPROVAL_CONFLICT');
    expect(batch.save).not.toHaveBeenCalled();
  });

  test('records independent QA approval and leaves market release as a separate gate', async () => {
    const batch = makeBatch({ qcStatus: 'pending_qa_review', qcSpecificationId: specId, qcSpecificationVersion: '2.1',
      qcPassedByUser: 'qc-analyst-1', qcTests: [
        { code: 'IDENTITY', result: 'Conforms', status: 'pass' },
        { code: 'MOISTURE', numericResult: 4.2, status: 'pass' }
      ] });
    mockBatch(batch);
    ProductQualitySpecification.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(spec) });
    const res = await request(app).patch('/api/batch-productions/batch-qc-1/qc-approval')
      .set('x-user-id', 'qa-reviewer-2').set('x-user-name', 'QA Reviewer')
      .send({ notes: 'Reviewed actual results against approved specification' });
    expect(res.status).toBe(200);
    expect(batch.qcStatus).toBe('approved');
    expect(batch.qcApprovedByUser).toBe('qa-reviewer-2');
    expect(batch.qcApprovedAt).toBeInstanceOf(Date);
    expect(res.body.message).toMatch(/separate market release/i);
  });

});
