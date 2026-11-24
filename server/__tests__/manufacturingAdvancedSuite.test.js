const express = require('express');
const request = require('supertest');

// Mocks
jest.mock('../models/BatchProduction');
jest.mock('../models/LineClearance');
jest.mock('../models/RawMaterial');
jest.mock('../models/SystemSettings');
jest.mock('../models/AuditLog');
jest.mock('../models/RolePermission');
// The job-work dispatch flow allocates a Challan number through the atomic,
// tenant-scoped Counter model (see utils/documentCounter.js); mock it so
// findOneAndUpdate() doesn't hang against a real unconnected Mongoose model.
jest.mock('../models/Counter', () => ({
  findOneAndUpdate: jest.fn().mockResolvedValue({ seq: 1 }),
}));

const BatchProduction = require('../models/BatchProduction');
const LineClearance = require('../models/LineClearance');
const RawMaterial = require('../models/RawMaterial');
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
      req.user = { id: req.headers['x-user-id'] || '507f1f77bcf86cd799439011', name: req.headers['x-user-name'] || 'Dr. V. K. Sharma', role: 'admin' };
      next();
    });
    app.use('/api/batch-productions', batchRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions.mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  // Feature 10 Tests
  describe('Feature 10: Internal Packaging Material Reconciliation', () => {
    const makeBatch = (id) => {
      const labelReconciliation = [];
      labelReconciliation.id = (itemId) => labelReconciliation.find(item => item._id === itemId);
      return {
        _id: id,
        batchNo: 'B-2026-' + id,
        status: 'completed',
        releasedBy: null,
        bomSnapshot: { ingredients: [{ rawMaterialId: 'mat_1', itemType: 'packaging' }, { rawMaterialId: 'mat_2', itemType: 'packaging' }] },
        ingredientsConsumed: [{ rawMaterialId: 'mat_1', qtyConsumed: 1000, dispensingNo: 'DSP-001' }, { rawMaterialId: 'mat_2', qtyConsumed: 1000, dispensingNo: 'DSP-002' }],
        labelReconciliation,
        deviations: [],
        save: jest.fn().mockResolvedValue(true)
      };
    };

    beforeEach(() => {
      RawMaterial.findById.mockImplementation(id => ({
        lean: jest.fn().mockResolvedValue({ _id: id, name: id === 'mat_1' ? 'Printed Carton 100g' : 'AYUSH Hologram Labels' })
      }));
    });

    test('submits reconciliation against verified dispensing quantities and waits for independent verification', async () => {
      const mockBatch = makeBatch('batch_101');
      BatchProduction.findById.mockResolvedValue(mockBatch);
      const res = await request(app)
        .post('/api/batch-productions/batch_101/label-reconciliation')
        .send({ items: [{ rawMaterialId: 'mat_1', qtyUsed: 995, qtyDamaged: 5, qtyReturnedToStore: 0 }] });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.overallAuditStatus).toBe('PENDING_INDEPENDENT_VERIFICATION');
      expect(mockBatch.labelReconciliation[0]).toMatchObject({
        qtyIssued: 1000, qtyUsed: 995, qtyDamaged: 5, auditStatus: 'pending', reconciled: false
      });
      expect(mockBatch.save).toHaveBeenCalled();
    });

    test('rejects caller-supplied issued quantity and materials not present in the pinned packaging formula', async () => {
      const mockBatch = makeBatch('batch_102');
      BatchProduction.findById.mockResolvedValue(mockBatch);
      const overIssue = await request(app).post('/api/batch-productions/batch_102/label-reconciliation')
        .send({ items: [{ rawMaterialId: 'mat_1', qtyIssued: 5000, qtyUsed: 5000 }] });
      expect(overIssue.status).toBe(400);
      expect(mockBatch.labelReconciliation).toHaveLength(0);
      const wrongMaterial = await request(app).post('/api/batch-productions/batch_102/label-reconciliation')
        .send({ items: [{ rawMaterialId: 'unrelated', qtyUsed: 1 }] });
      expect(wrongMaterial.status).toBe(400);
      expect(mockBatch.save).not.toHaveBeenCalled();
    });

    test('requires independent reviewer and flags unaccounted quantities only after verification', async () => {
      const mockBatch = makeBatch('batch_103');
      BatchProduction.findById.mockResolvedValue(mockBatch);
      const submitted = await request(app).post('/api/batch-productions/batch_103/label-reconciliation')
        .send({ items: [{ rawMaterialId: 'mat_2', qtyUsed: 950, qtyDamaged: 10, qtyReturnedToStore: 0 }] });
      expect(submitted.status).toBe(201);
      const item = mockBatch.labelReconciliation[0];
      item._id = 'reconciliation-item-1';
      mockBatch.labelReconciliation.id = (itemId) => mockBatch.labelReconciliation.find(entry => entry._id === itemId);
      const selfVerify = await request(app).patch('/api/batch-productions/batch_103/label-reconciliation/reconciliation-item-1/verify');
      expect(selfVerify.status).toBe(409);
      const verified = await request(app)
        .patch('/api/batch-productions/batch_103/label-reconciliation/reconciliation-item-1/verify')
        .set('x-user-id', 'independent-qa')
        .set('x-user-name', 'Independent QA')
        .send({ discrepancyNote: 'Investigate 40 labels not accounted for' });
      expect(verified.status).toBe(200);
      expect(verified.body.auditStatus).toBe('flagged');
      expect(item).toMatchObject({ unaccountedQty: 40, discrepancyFlagged: true, reconciled: true, verifiedByName: 'Independent QA' });
      expect(mockBatch.deviations).toHaveLength(1);
      expect(mockBatch.deviations[0].description).toContain('Packaging material reconciliation discrepancy');
    });
  });

  describe('Independent line-clearance verification', () => {
    const checklist = {
      equipmentCleaned: true, previousMaterialsRemoved: true,
      previousLabelsDocumentsRemoved: true, areaVisuallyInspected: true
    };

    test('submits a complete line-clearance checklist as pending, not cleared', async () => {
      BatchProduction.findById.mockResolvedValue({
        _id: 'batch-line-1', status: 'draft', manufacturingUnitId: 'unit-1', releasedBy: null
      });
      LineClearance.findOne.mockResolvedValue(null);
      LineClearance.create.mockImplementation(async data => ({ _id: 'clearance-1', ...data }));
      const res = await request(app).post('/api/batch-productions/batch-line-1/line-clearance')
        .send({ phase: 'manufacturing', checklist });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING_INDEPENDENT_VERIFICATION');
      expect(LineClearance.create).toHaveBeenCalledWith(expect.objectContaining({
        cleared: false, submittedBy: '507f1f77bcf86cd799439011',
        checklist: expect.objectContaining(checklist)
      }));
    });

    test('prevents operator self-verification and records independent QA signoff', async () => {
      BatchProduction.findById.mockResolvedValue({
        _id: 'batch-line-2', status: 'draft', releasedBy: null
      });
      const record = {
        _id: 'clearance-2', batchId: 'batch-line-2', cleared: false,
        submittedBy: '507f1f77bcf86cd799439011', checklist,
        save: jest.fn().mockResolvedValue(true)
      };
      LineClearance.findById.mockResolvedValue(record);
      const selfVerify = await request(app).patch('/api/batch-productions/batch-line-2/line-clearance/clearance-2/verify');
      expect(selfVerify.status).toBe(409);
      const verified = await request(app)
        .patch('/api/batch-productions/batch-line-2/line-clearance/clearance-2/verify')
        .set('x-user-id', 'independent-line-reviewer')
        .set('x-user-name', 'Independent Line Reviewer');
      expect(verified.status).toBe(200);
      expect(record).toMatchObject({
        cleared: true, clearedBy: 'independent-line-reviewer',
        verifiedBy: 'independent-line-reviewer', verifiedByName: 'Independent Line Reviewer'
      });
      expect(record.verifiedAt).toBeInstanceOf(Date);
      expect(record.save).toHaveBeenCalled();
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

      const resChemist = await request(app)
        .post('/api/batch-productions/batch_301/stages/0/dual-esign')
        .send({ role: 'chemist', comments: 'Weighing verified on calibrated balance' });

      expect(resChemist.status).toBe(200);
      expect(mockBatch.stages[0].chemistSignature).toBeDefined();

      const qaApp = express();
      qaApp.use(express.json());
      qaApp.use((req, res, next) => {
        req.user = { id: '507f1f77bcf86cd799439099', name: 'Dr. S. K. Gupta QA Head', role: 'admin' };
        next();
      });
      qaApp.use('/api/batch-productions', batchRouter);

      const resQa = await request(qaApp)
        .post('/api/batch-productions/batch_301/stages/0/dual-esign')
        .send({ role: 'qa', comments: 'Verified and approved' });

      expect(resQa.status).toBe(200);
      expect(resQa.body.success).toBe(true);
      expect(mockBatch.stages[0].isDualSigned).toBe(true);
      expect(mockBatch.stages[0].status).toBe('completed');
      expect(mockSave).toHaveBeenCalled();
    });
  });
});
