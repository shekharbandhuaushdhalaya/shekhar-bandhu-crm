const express = require('express');
const request = require('supertest');

// Mocks
jest.mock('../models/BatchProduction');
jest.mock('../models/SystemSettings');
jest.mock('../models/AuditLog');
jest.mock('../models/RolePermission');

const BatchProduction = require('../models/BatchProduction');
const SystemSettings = require('../models/SystemSettings');
const AuditLog = require('../models/AuditLog');
const RolePermission = require('../models/RolePermission');

RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });

// Router
const batchRouter = require('../routes/manufacturing/batchProductions');

describe('Features 10, 12, 13: Advanced AYUSH Manufacturing & Audit Suite', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: '507f1f77bcf86cd799439011', name: 'Dr. V. K. Sharma', role: 'admin' };
      next();
    });
    app.use('/api/batch-productions', batchRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions.mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  // Feature 10 Tests
  describe('Feature 10: Packing Material Reconciliation & Schedule T Audit', () => {
    test('POST /api/batch-productions/:id/label-reconciliation passes compliant reconciliation', async () => {
      const mockSave = jest.fn().mockResolvedValue(true);
      const mockBatch = {
        _id: 'batch_101',
        batchNo: 'B-2026-101',
        labelReconciliation: [],
        deviations: [],
        save: mockSave
      };
      BatchProduction.findById.mockResolvedValue(mockBatch);

      const res = await request(app)
        .post('/api/batch-productions/batch_101/label-reconciliation')
        .send({
          items: [
            {
              rawMaterialId: 'mat_1',
              name: 'Printed Carton 100g',
              qtyIssued: 1000,
              qtyUsed: 995,
              qtyDamaged: 5,
              qtyReturnedToStore: 0
            }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.overallAuditStatus).toBe('PASSED');
      expect(mockSave).toHaveBeenCalled();
    });

    test('POST /api/batch-productions/:id/label-reconciliation flags discrepancy > 0.5% and logs quality deviation', async () => {
      const mockSave = jest.fn().mockResolvedValue(true);
      const mockBatch = {
        _id: 'batch_102',
        batchNo: 'B-2026-102',
        labelReconciliation: [],
        deviations: [],
        save: mockSave
      };
      BatchProduction.findById.mockResolvedValue(mockBatch);

      const res = await request(app)
        .post('/api/batch-productions/batch_102/label-reconciliation')
        .send({
          items: [
            {
              rawMaterialId: 'mat_2',
              name: 'AYUSH Hologram Labels',
              qtyIssued: 1000,
              qtyUsed: 950,
              qtyDamaged: 10,
              qtyReturnedToStore: 0
              // Unaccounted = 40 (4.0% discrepancy > 0.5%)
            }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.overallAuditStatus).toBe('FLAGGED_EXCEEDS_0.5_PERCENT');
      expect(mockBatch.deviations).toHaveLength(1);
      expect(mockBatch.deviations[0].description).toContain('Schedule T Packing Audit Alert');
      expect(mockSave).toHaveBeenCalled();
    });

    test('GET /api/batch-productions/:id/label-reconciliation-report generates official Schedule T audit JSON', async () => {
      BatchProduction.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'batch_101',
            batchNo: 'B-2026-101',
            productId: { name: 'Chyawanprash Special' },
            labelReconciliation: [
              { name: 'Printed Foil', qtyIssued: 500, qtyUsed: 498, discrepancyPct: 0.4, discrepancyFlagged: false }
            ]
          })
        })
      });

      SystemSettings.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          firmName: 'SHEKHAR BANDHU AUSHADHALAYA'
        })
      });

      const res = await request(app).get('/api/batch-productions/batch_101/label-reconciliation-report');
      expect(res.status).toBe(200);
      expect(res.body.title).toContain('AYUSH SCHEDULE T PACKING MATERIAL RECONCILIATION AUDIT REPORT');
      expect(res.body.firmDetails.name).toBe('SHEKHAR BANDHU AUSHADHALAYA');
      expect(res.body.auditSummary.auditResult).toContain('COMPLIANT');
    });
  });

  // Feature 12 Tests
  describe('Feature 12: Job-Work & Loan-License Manufacturing Module', () => {
    test('POST /api/batch-productions/:id/job-work/dispatch generates delivery challan and sets status', async () => {
      const mockSave = jest.fn().mockResolvedValue(true);
      const mockBatch = {
        _id: 'batch_201',
        batchNo: 'B-JW-2026-01',
        plannedQty: 500,
        save: mockSave
      };
      BatchProduction.findById.mockResolvedValue(mockBatch);

      const res = await request(app)
        .post('/api/batch-productions/batch_201/job-work/dispatch')
        .send({
          jobWorkerId: 'vendor_888',
          jobWorkerName: 'Apex Jobworks Pvt Ltd',
          expectedYieldQty: 500,
          jobWorkCharges: 25000
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.challanNo).toContain('JW-CHALLAN-');
      expect(mockBatch.jobWorkStatus).toBe('dispatched_to_vendor');
      expect(mockBatch.jobWorkerName).toBe('Apex Jobworks Pvt Ltd');
      expect(mockSave).toHaveBeenCalled();
    });

    test('POST /api/batch-productions/:id/job-work/receive records yield and conversion loss %', async () => {
      const mockSave = jest.fn().mockResolvedValue(true);
      const mockBatch = {
        _id: 'batch_201',
        batchNo: 'B-JW-2026-01',
        expectedYieldQty: 500,
        save: mockSave
      };
      BatchProduction.findById.mockResolvedValue(mockBatch);

      const res = await request(app)
        .post('/api/batch-productions/batch_201/job-work/receive')
        .send({
          receivedYieldQty: 480,
          jobWorkerCertificateRef: 'COA-JW-9988'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockBatch.receivedYieldQty).toBe(480);
      expect(mockBatch.conversionLossPct).toBe(4);
      expect(mockBatch.jobWorkStatus).toBe('received_partially');
      expect(mockSave).toHaveBeenCalled();
    });

    test('GET /api/batch-productions/job-work-summary returns job work ledger', async () => {
      BatchProduction.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                {
                  _id: 'batch_201',
                  batchNo: 'B-JW-2026-01',
                  productionType: 'job_work',
                  jobWorkerName: 'Apex Jobworks',
                  expectedYieldQty: 500,
                  receivedYieldQty: 480,
                  jobWorkCharges: 25000
                }
              ])
            })
          })
        })
      });

      const res = await request(app).get('/api/batch-productions/job-work-summary');
      expect(res.status).toBe(200);
      expect(res.body.totalJobWorkOrders).toBe(1);
      expect(res.body.totalJobWorkCharges).toBe(25000);
      expect(res.body.orders[0].batchNo).toBe('B-JW-2026-01');
    });
  });

  // Feature 13 Tests
  describe('Feature 13: Dual E-Signature & Audit Trail for Critical BMR Steps', () => {
    test('POST /api/batch-productions/:id/stages/:stageIndex/dual-esign records dual signatures and audit log', async () => {
      const mockSave = jest.fn().mockResolvedValue(true);
      AuditLog.create.mockResolvedValue(true);

      const mockBatch = {
        _id: 'batch_301',
        batchNo: 'B-2026-301',
        stages: [
          { name: 'Raw Material Verification & Weighing', status: 'pending' },
          { name: 'Primary Processing (Swasan/Mardan)', status: 'pending' }
        ],
        save: mockSave
      };
      BatchProduction.findById.mockResolvedValue(mockBatch);

      const res = await request(app)
        .post('/api/batch-productions/batch_301/stages/0/dual-esign')
        .send({
          chemistName: 'R. K. Verma Chemist',
          chemistComments: 'Weighing verified on calibrated balance',
          qaName: 'Dr. S. K. Gupta QA Head',
          qaComments: 'Verified and approved'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.signatureHash).toBeDefined();
      expect(mockBatch.stages[0].isDualSigned).toBe(true);
      expect(mockBatch.stages[0].status).toBe('completed');
      expect(mockBatch.stages[0].chemistSignature.userName).toBe('R. K. Verma Chemist');
      expect(mockBatch.stages[0].qaSignature.userName).toBe('Dr. S. K. Gupta QA Head');
      expect(mockSave).toHaveBeenCalled();
      expect(AuditLog.create).toHaveBeenCalled();
    });
  });
});
