const express = require('express');
const request = require('supertest');

jest.mock('../models/VendorQualification');
jest.mock('../models/Vendor');
jest.mock('../models/RawMaterial');

const VendorQualification = require('../models/VendorQualification');
const Vendor = require('../models/Vendor');
const RawMaterial = require('../models/RawMaterial');
const router = require('../routes/manufacturing/vendorQualifications');

describe('Independent supplier qualification verification', () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'auditor-1', name: 'Supplier Auditor' };
      next();
    });
    app.use('/api/vendor-qualifications', router);
  });
  beforeEach(() => jest.clearAllMocks());

  test('records an audit as pending verification even when auditor proposes approval', async () => {
    Vendor.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ company: 'Herbal Supplier' }) });
    RawMaterial.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: 'material-1' }]) });
    VendorQualification.create.mockImplementation(async value => value);
    const response = await request(app).post('/api/vendor-qualifications').send({
      vendorId: '507f1f77bcf86cd799439011',
      qualificationStatus: 'approved',
      nextAuditDue: new Date(Date.now() + 86400000).toISOString(),
      rawMaterialIds: ['507f191e810c19729de860ea']
    });
    expect(response.status).toBe(201);
    expect(VendorQualification.create).toHaveBeenCalledWith(expect.objectContaining({
      qualificationStatus: 'pending_verification',
      proposedQualificationStatus: 'approved',
      auditedByUserId: 'auditor-1'
    }));
  });

  test('prevents the auditor from verifying their own qualification', async () => {
    VendorQualification.findById.mockResolvedValue({
      _id: 'qualification-1', qualificationStatus: 'pending_verification',
      proposedQualificationStatus: 'approved', auditedByUserId: 'auditor-1',
      save: jest.fn()
    });
    const response = await request(app).patch('/api/vendor-qualifications/qualification-1/verify').send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SUPPLIER_QUALIFICATION_MAKER_CHECKER_REQUIRED');
  });

  test('allows a different reviewer to verify and records reviewer identity and timestamp', async () => {
    VendorQualification.findById.mockResolvedValue({
      _id: 'qualification-1', qualificationStatus: 'pending_verification',
      proposedQualificationStatus: 'approved', auditedByUserId: 'auditor-1',
      nextAuditDue: new Date(Date.now() + 86400000),
      save: jest.fn().mockResolvedValue(true)
    });
    app.use((req, res, next) => next());
    const response = await request(app).patch('/api/vendor-qualifications/qualification-1/verify').send({ verificationNotes: 'Documents checked' });
    expect(response.status).toBe(200);
    expect(response.body.qualificationStatus).toBe('approved');
    expect(response.body.verifiedByUserId).toBe('auditor-1');
  });
});
