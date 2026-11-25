const express = require('express');
const request = require('supertest');

jest.mock('../models/ProductQualitySpecification');
jest.mock('../models/RolePermission');

const ProductQualitySpecification = require('../models/ProductQualitySpecification');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/manufacturing/qualitySpecifications');

describe('Product quality specification authoring and approval controls', () => {
  let app;
  const validBody = () => ({
    productId: 'product-1', dosageForm: 'Tablet', pharmacopoeialStandard: 'Approved in-house specification',
    specificationVersion: '1.0', tests: [
      { code: 'IDENTITY', name: 'Identity', specification: 'Conforms', mandatory: true },
      { code: 'MOISTURE', name: 'Moisture', specification: 'NMT 5%', mandatory: true }
    ],
    status: 'approved', approvedBy: 'attacker', approvedAt: '2020-01-01'
  });
  beforeAll(() => {
    app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: req.headers['x-user-id'] || 'author-1', name: req.headers['x-user-name'] || 'Author' }; next(); });
    app.use('/api/manufacturing/quality-specifications', router);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  test('creates a draft and ignores client-supplied approval state', async () => {
    ProductQualitySpecification.create.mockImplementation(async value => ({ _id: 'spec-1', ...value }));
    const response = await request(app).post('/api/manufacturing/quality-specifications').send(validBody());
    expect(response.status).toBe(201);
    expect(ProductQualitySpecification.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'draft', createdByUserId: 'author-1', createdByName: 'Author',
      approvedBy: null, approvedAt: null
    }));
  });

  test('rejects duplicate test codes regardless of case', async () => {
    const body = validBody(); body.tests[1].code = 'identity';
    const response = await request(app).post('/api/manufacturing/quality-specifications').send(body);
    expect(response.status).toBe(400);
    expect(ProductQualitySpecification.create).not.toHaveBeenCalled();
  });

  test('requires at least one mandatory test', async () => {
    const body = validBody(); body.tests.forEach(test => { test.mandatory = false; });
    const response = await request(app).post('/api/manufacturing/quality-specifications').send(body);
    expect(response.status).toBe(400);
    expect(ProductQualitySpecification.create).not.toHaveBeenCalled();
  });

  test('prevents the specification author from approving their own draft', async () => {
    const draft = { _id: 'spec-1', status: 'draft', createdByUserId: 'author-1', tests: validBody().tests, save: jest.fn() };
    ProductQualitySpecification.findById.mockResolvedValue(draft);
    const response = await request(app).patch('/api/manufacturing/quality-specifications/spec-1/approve');
    expect(response.status).toBe(409);
    expect(draft.save).not.toHaveBeenCalled();
  });

  test('requires a draft and records independent approval evidence', async () => {
    const draft = { _id: 'spec-2', status: 'draft', createdByUserId: 'author-1', tests: validBody().tests, save: jest.fn().mockResolvedValue(true) };
    ProductQualitySpecification.findById.mockResolvedValue(draft);
    const response = await request(app).patch('/api/manufacturing/quality-specifications/spec-2/approve')
      .set('x-user-id', 'qa-2').set('x-user-name', 'QA Reviewer');
    expect(response.status).toBe(200);
    expect(draft).toMatchObject({ status: 'approved', approvedBy: 'qa-2', approvedByName: 'QA Reviewer' });
    expect(draft.approvedAt).toBeInstanceOf(Date);
    expect(draft.save).toHaveBeenCalled();
  });
});
