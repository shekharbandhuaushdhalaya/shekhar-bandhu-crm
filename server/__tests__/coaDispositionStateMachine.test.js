const express = require('express');
const request = require('supertest');

jest.mock('../models/CertificateOfAnalysis', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn()
}));
jest.mock('../models/SystemSettings', () => ({ findOne: jest.fn() }));
jest.mock('../models/BatchProduction', () => ({ findOne: jest.fn() }));
jest.mock('../models/ProductQualitySpecification', () => ({ findById: jest.fn() }));
jest.mock('../middleware/authorize', () => ({
  authorize: () => (req, res, next) => next()
}));

const CertificateOfAnalysis = require('../models/CertificateOfAnalysis');
const router = require('../routes/manufacturing/coa');

describe('CoA QA disposition state machine', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'qa-reviewer-1', name: 'Independent QA Reviewer' };
      next();
    });
    app.use('/api/manufacturing/coa', router);
  });

  beforeEach(() => jest.clearAllMocks());

  it('allows only a draft CoA to receive its first QA disposition', async () => {
    const id = '507f1f77bcf86cd799439011';
    CertificateOfAnalysis.findById.mockResolvedValue({ _id: id, status: 'draft', tests: [] });
    CertificateOfAnalysis.findOneAndUpdate.mockResolvedValue({
      _id: id, status: 'rejected', overallResult: 'REJECTED'
    });

    const response = await request(app)
      .patch(`/api/manufacturing/coa/${id}/approve`)
      .send({ status: 'rejected', remarks: 'Failed QA review' });

    expect(response.status).toBe(200);
    expect(CertificateOfAnalysis.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id, status: 'draft' },
      expect.objectContaining({ $set: expect.objectContaining({
        status: 'rejected',
        overallResult: 'REJECTED',
        qaReviewedByUser: 'qa-reviewer-1'
      }) }),
      { new: true, runValidators: true }
    );
  });

  test.each(['approved', 'rejected'])('does not allow a finalized %s CoA to be re-disposed', async status => {
    const id = '507f1f77bcf86cd799439012';
    CertificateOfAnalysis.findById.mockResolvedValue({ _id: id, status, tests: [] });

    const response = await request(app)
      .patch(`/api/manufacturing/coa/${id}/approve`)
      .send({ status: status === 'approved' ? 'rejected' : 'approved' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COA_DISPOSITION_FINALIZED');
    expect(CertificateOfAnalysis.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('does not QA-approve a draft until its linked manufacturing batch is market-released', async () => {
    const id = '507f1f77bcf86cd799439014';
    CertificateOfAnalysis.findById.mockResolvedValue({
      _id: id, status: 'draft', batchNo: 'BATCH-HELD-01', specificationId: 'spec-1', tests: []
    });
    const BatchProduction = require('../models/BatchProduction');
    BatchProduction.findOne.mockResolvedValue({
      status: 'completed', qcStatus: 'pending_qa_review', releasedBy: null, releasedAt: null
    });

    const response = await request(app)
      .patch(`/api/manufacturing/coa/${id}/approve`)
      .send({ status: 'approved' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COA_BATCH_NOT_RELEASED');
    expect(CertificateOfAnalysis.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a competing reviewer when the draft was finalized after it was read', async () => {
    const id = '507f1f77bcf86cd799439013';
    CertificateOfAnalysis.findById.mockResolvedValue({ _id: id, status: 'draft', tests: [] });
    CertificateOfAnalysis.findOneAndUpdate.mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/manufacturing/coa/${id}/approve`)
      .send({ status: 'rejected' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COA_DISPOSITION_FINALIZED');
  });
});
