const express = require('express');
const request = require('supertest');

jest.mock('../models/VendorQualification');
jest.mock('../models/Vendor');
jest.mock('../models/RawMaterial');
jest.mock('../models/RolePermission');

const RolePermission = require('../models/RolePermission');

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
      req.user = { id: req.headers['x-user-id'] || 'auditor-1', name: req.headers['x-user-name'] || 'Supplier Auditor', role: 'admin' };
      next();
    });
    app.use('/api/vendor-qualifications', router);
  });
  beforeEach(() => { jest.clearAllMocks(); RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] }); });

  test('records an audit as pending verification even when auditor proposes approval', async () => {
    Vendor.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ company: 'Herbal Supplier' }) }) });
    RawMaterial.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: '507f191e810c19729de860ea' }] ) }) });
    VendorQualification.create.mockImplementation(async value => value);
    const response = await request(app).post('/api/vendor-qualifications').send({
      vendorId: '507f1f77bcf86cd799439011',
      qualificationStatus: 'approved',
      nextAuditDue: new Date(Date.now() + 86400000).toISOString(),
      rawMaterialIds: ['507f191e810c19729de860ea'],
      documents: [{ name: 'GMP certificate', url: 'evidence://supplier/gmp-certificate' }]
    });
    expect(response.status).toBe(201);
    expect(VendorQualification.create).toHaveBeenCalledWith(expect.objectContaining({
      qualificationStatus: 'pending_verification',
      proposedQualificationStatus: 'approved',
      auditedByUserId: 'auditor-1'
    }));
  });

  test('requires named supporting evidence before creating an audit', async () => {
    Vendor.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ company: 'Herbal Supplier' }) }) });
    RawMaterial.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: '507f191e810c19729de860ea' }]) }) });
    const response = await request(app).post('/api/vendor-qualifications').send({ vendorId: '507f1f77bcf86cd799439011', nextAuditDue: new Date(Date.now() + 86400000).toISOString(), rawMaterialIds: ['507f191e810c19729de860ea'] });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/evidence reference/i);
    expect(VendorQualification.create).not.toHaveBeenCalled();
  });

  test('prevents the auditor from verifying their own qualification', async () => {
    VendorQualification.findById.mockResolvedValue({
      _id: 'qualification-1', qualificationStatus: 'pending_verification',
      proposedQualificationStatus: 'approved', auditedByUserId: 'auditor-1',
      documents: [{ name: 'GMP certificate', url: 'evidence://supplier/gmp' }], save: jest.fn()
    });
    const response = await request(app).patch('/api/vendor-qualifications/qualification-1/verify').send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SUPPLIER_QUALIFICATION_MAKER_CHECKER_REQUIRED');
  });

  test('does not approve an audit without supporting evidence references', async () => {
    const record = { _id: 'qualification-1', qualificationStatus: 'pending_verification', proposedQualificationStatus: 'approved', auditedByUserId: 'auditor-1', documents: [], save: jest.fn() };
    VendorQualification.findById.mockResolvedValue(record);
    const response = await request(app).patch('/api/vendor-qualifications/qualification-1/verify').set('x-user-id', 'reviewer-2').send({ verificationNotes: 'Reviewed' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SUPPLIER_QUALIFICATION_EVIDENCE_REQUIRED');
    expect(record.save).not.toHaveBeenCalled();
  });

  test('allows a different reviewer through one atomic pending-state transition', async () => {
    VendorQualification.findById.mockResolvedValue({
      _id: 'qualification-1', qualificationStatus: 'pending_verification',
      proposedQualificationStatus: 'approved', auditedByUserId: 'auditor-1',
      documents: [{ name: 'GMP certificate', url: 'evidence://supplier/gmp' }],
      nextAuditDue: new Date(Date.now() + 86400000)
    });
    VendorQualification.findOneAndUpdate.mockResolvedValue({
      _id: 'qualification-1', qualificationStatus: 'approved',
      verifiedByUserId: 'reviewer-2', verifiedAt: new Date()
    });
    const response = await request(app).patch('/api/vendor-qualifications/qualification-1/verify').set('x-user-id', 'reviewer-2').set('x-user-name', 'Independent Reviewer').send({ verificationNotes: 'Documents checked' });
    expect(response.status).toBe(200);
    expect(response.body.qualificationStatus).toBe('approved');
    expect(response.body.verifiedByUserId).toBe('reviewer-2');
    expect(VendorQualification.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'qualification-1', qualificationStatus: 'pending_verification' }),
      expect.objectContaining({ $set: expect.objectContaining({ verifiedByUserId: 'reviewer-2' }) }),
      { new: true, runValidators: true }
    );
  });

  test('returns conflict when another reviewer wins the concurrent verification race', async () => {
    VendorQualification.findById.mockResolvedValue({
      _id: 'qualification-1', qualificationStatus: 'pending_verification',
      proposedQualificationStatus: 'approved', auditedByUserId: 'auditor-1',
      documents: [{ name: 'GMP certificate', url: 'evidence://supplier/gmp' }],
      nextAuditDue: new Date(Date.now() + 86400000)
    });
    VendorQualification.findOneAndUpdate.mockResolvedValue(null);
    const response = await request(app).patch('/api/vendor-qualifications/qualification-1/verify').set('x-user-id', 'reviewer-2').send({ verificationNotes: 'Documents checked' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SUPPLIER_QUALIFICATION_CONCURRENT_REVIEW');
  });
});
