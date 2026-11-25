const express = require('express');
const request = require('supertest');

jest.mock('../models/RawMaterial');
jest.mock('../models/RawMaterialEntry');
jest.mock('../models/RawMaterialQuarantine');
jest.mock('../models/RawMaterialQualitySpecification');
jest.mock('../models/GoodsReceivedNote');
jest.mock('../models/BillOfMaterials');
jest.mock('../models/ProductionPlan');
jest.mock('../models/Product');
jest.mock('../models/Warehouse');
jest.mock('../models/RolePermission');
jest.mock('../utils/withTransaction', () => ({ withTransaction: jest.fn(async work => work({})) }));
jest.mock('../utils/auditLogger', () => ({ logAction: jest.fn().mockResolvedValue(true) }));
// quarantine.js allocates lot/report numbers through the atomic, tenant-scoped
// Counter model (see utils/documentCounter.js); mock it so findOneAndUpdate()
// doesn't hang against a real unconnected Mongoose model.
jest.mock('../models/Counter', () => ({
  findOneAndUpdate: jest.fn().mockResolvedValue({ seq: 1 }),
}));
jest.mock('../routes/analytics/demandForecasting', () => ({
  computeDemandForecast: jest.fn().mockResolvedValue([
    {
      productId: 'prod_shortfall_1',
      productName: 'Chyawanprash Special',
      reorderRecommended: true,
      recommendedReorderQty: 100
    }
  ])
}));

const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const RawMaterialQuarantine = require('../models/RawMaterialQuarantine');
const RawMaterialQualitySpecification = require('../models/RawMaterialQualitySpecification');
const GoodsReceivedNote = require('../models/GoodsReceivedNote');
const BillOfMaterials = require('../models/BillOfMaterials');
const Product = require('../models/Product');
const RolePermission = require('../models/RolePermission');

RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });

const quarantineRouter = require('../routes/manufacturing/quarantine');
const mrpRouter = require('../routes/analytics/materialRequirementsPlan');

describe('Task 2: Quarantine / QC Enforcement for Production & MRP', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: '507f1f77bcf86cd799439011', name: 'QC Manager', role: 'admin' };
      next();
    });
    app.use('/api/manufacturing/quarantine', quarantineRouter);
    app.use('/api/analytics/material-requirements-plan', mrpRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions.mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    RawMaterialQualitySpecification.findOne = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'spec-1', specificationVersion: '1.0', approvedByUserId: 'qa-approver', approvedAt: new Date(), tests: [{ code: 'IDENTITY', name: 'Identity', specification: 'Conforms', unit: '', methodReference: 'API method', mandatory: true }] }) }) });
    GoodsReceivedNote.findOne = jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue({ grnNo: 'GRN-00001', status: 'verified' }) });
  });

  describe('Quarantine Release Updates Linked RawMaterialEntry qcStatus', () => {
    test('POST /api/manufacturing/quarantine logs quarantine lot and links matching RawMaterialEntry', async () => {
      RawMaterialEntry.findById.mockResolvedValue({
        _id: 'entry_101',
        rawMaterialId: 'rm_101',
        batchNo: 'BATCH-2026-001',
        vendorName: 'Herbal Supplier',
        expiryDate: new Date('2027-12-31'),
        qty: 50,
        reservedQty: 0,
        qcStatus: 'under_test'
      });

      RawMaterialQuarantine.create.mockImplementation(async (data) => [{
        _id: 'quarantine_101',
        ...data[0]
      }]);

      const res = await request(app)
        .post('/api/manufacturing/quarantine')
        .send({
          herbName: 'Ashwagandha',
          batchNo: 'BATCH-2026-001',
          supplierName: 'Herbal Supplier',
          rawMaterialEntryId: 'entry_101',
          rawMaterialId: 'rm_101',
          qty: 50,
          unit: 'kg',
          expiryDate: '2027-12-31'
        });

      expect(res.status).toBe(201);
      expect(RawMaterialQualitySpecification.findOne).toHaveBeenCalledWith(expect.objectContaining({ rawMaterialId: 'rm_101', status: 'approved' }));
      expect(RawMaterialQuarantine.create).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({
        herbName: 'Ashwagandha',
        batchNo: 'BATCH-2026-001',
        rawMaterialEntryId: 'entry_101',
        rawMaterialId: 'rm_101'
      })]));
    });

    test('PATCH /api/manufacturing/quarantine/:id/release sets RawMaterialEntry qcStatus to approved when released', async () => {
      const mockEntry = {
        _id: 'entry_101',
        rawMaterialId: 'rm_101',
        batchNo: 'BATCH-2026-001',
        qty: 50,
        reservedQty: 0,
        qcStatus: 'under_test',
        grnReferences: [{ grnNo: 'GRN-00001', supplierCoaRef: 'COA-REF-1', receivedQty: 50 }],
        save: jest.fn().mockResolvedValue(true)
      };

      const mockLot = {
        _id: 'quarantine_101',
        quarantineLotNo: 'QRM-1001',
        rawMaterialEntryId: 'entry_101',
        rawMaterialId: 'rm_101',
        batchNo: 'BATCH-2026-001',
        qty: 50,
        quarantineStatus: 'under_testing',
        qcSpecificationId: 'spec-1', qcSpecificationVersion: '1.0', qcSpecificationTests: [{ code: 'IDENTITY', mandatory: true }], inspectionResults: [{ testCode: 'IDENTITY', outcome: 'pass', result: 'Conforms' }],
        inspectionRecordedByUserId: 'qc-analyst-1',
        save: jest.fn().mockResolvedValue(true)
      };

      RawMaterialQuarantine.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockLot) });
      RawMaterialEntry.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockEntry) });

      const res = await request(app)
        .patch('/api/manufacturing/quarantine/quarantine_101/release')
        .send({
          quarantineStatus: 'released',
          testReportNo: 'QC-8899',
          remarks: 'Passed purity test'
        });

      expect(res.status).toBe(200);
      expect(mockEntry.qcStatus).toBe('approved');
      expect(mockEntry.save).toHaveBeenCalled();
      expect(mockLot.quarantineStatus).toBe('released');
    });

    test('PATCH /api/manufacturing/quarantine/:id/release sets RawMaterialEntry qcStatus to rejected when rejected', async () => {
      const mockEntry = {
        _id: 'entry_102',
        rawMaterialId: 'rm_102',
        batchNo: 'BATCH-2026-002',
        qty: 20,
        reservedQty: 0,
        qcStatus: 'under_test',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockLot = {
        _id: 'quarantine_102',
        quarantineLotNo: 'QRM-1002',
        rawMaterialEntryId: 'entry_102',
        rawMaterialId: 'rm_102',
        batchNo: 'BATCH-2026-002',
        qty: 20,
        quarantineStatus: 'under_testing',
        qcSpecificationId: 'spec-1', qcSpecificationVersion: '1.0', qcSpecificationTests: [{ code: 'MOISTURE', mandatory: true }], inspectionResults: [{ testCode: 'MOISTURE', outcome: 'fail', result: '12%' }],
        inspectionRecordedByUserId: 'qc-analyst-2',
        save: jest.fn().mockResolvedValue(true)
      };

      RawMaterialQuarantine.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockLot) });
      RawMaterialEntry.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockEntry) });

      const res = await request(app)
        .patch('/api/manufacturing/quarantine/quarantine_102/release')
        .send({
          quarantineStatus: 'rejected',
          testReportNo: 'QC-8900',
          remarks: 'High moisture level'
        });

      expect(res.status).toBe(200);
      expect(mockEntry.qcStatus).toBe('rejected');
      expect(mockEntry.save).toHaveBeenCalled();
      expect(mockLot.quarantineStatus).toBe('rejected');
    });


    test('blocks rejection without actual failed inspection evidence', async () => {
      const mockEntry = { _id: 'entry_no_fail', rawMaterialId: 'rm_no_fail', batchNo: 'BATCH-NO-FAIL', qty: 10, reservedQty: 0, qcStatus: 'under_test', save: jest.fn() };
      const mockLot = { _id: 'quarantine_no_fail', quarantineLotNo: 'QRM-NO-FAIL', rawMaterialEntryId: 'entry_no_fail', rawMaterialId: 'rm_no_fail', batchNo: 'BATCH-NO-FAIL', qty: 10, quarantineStatus: 'under_testing', inspectionResults: [{ testCode: 'IDENTITY', outcome: 'pass', result: 'Conforms' }], inspectionRecordedByUserId: 'qc-analyst-2', save: jest.fn() };
      RawMaterialQuarantine.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockLot) });
      RawMaterialEntry.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockEntry) });
      const res = await request(app).patch('/api/manufacturing/quarantine/quarantine_no_fail/release').send({ quarantineStatus: 'rejected', testReportNo: 'QC-NO-FAIL', remarks: 'Reject lot' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/at least one failed test/i);
      expect(mockEntry.save).not.toHaveBeenCalled();
    });

    test('blocks QC analyst from approving their own rejection', async () => {
      const mockEntry = { _id: 'entry_self_reject', rawMaterialId: 'rm_self_reject', batchNo: 'BATCH-SELF', qty: 10, reservedQty: 0, qcStatus: 'under_test', save: jest.fn() };
      const mockLot = { _id: 'quarantine_self_reject', quarantineLotNo: 'QRM-SELF', rawMaterialEntryId: 'entry_self_reject', rawMaterialId: 'rm_self_reject', batchNo: 'BATCH-SELF', qty: 10, quarantineStatus: 'under_testing', qcSpecificationId: 'spec-1', qcSpecificationVersion: '1.0', qcSpecificationTests: [{ code: 'IDENTITY', mandatory: true }], inspectionResults: [{ testCode: 'IDENTITY', outcome: 'fail', result: 'Not conforming' }], inspectionRecordedByUserId: '507f1f77bcf86cd799439011', save: jest.fn() };
      RawMaterialQuarantine.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockLot) });
      RawMaterialEntry.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockEntry) });
      const res = await request(app).patch('/api/manufacturing/quarantine/quarantine_self_reject/release').send({ quarantineStatus: 'rejected', testReportNo: 'QC-SELF', remarks: 'Reject lot' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/cannot independently approve/i);
      expect(mockEntry.save).not.toHaveBeenCalled();
    });

    test('allows QC rejection while the linked GRN is still pending verification', async () => {
      const mockEntry = {
        _id: 'entry_reject_pending', rawMaterialId: 'rm_reject_pending', batchNo: 'BATCH-REJECT-PENDING',
        qty: 10, reservedQty: 0, qcStatus: 'under_test',
        grnReferences: [{ grnNo: 'GRN-PENDING-REJECT', supplierCoaRef: 'COA-REF-PENDING', receivedQty: 10 }],
        save: jest.fn().mockResolvedValue(true)
      };
      const mockLot = {
        _id: 'quarantine_reject_pending', quarantineLotNo: 'QRM-REJECT-PENDING',
        rawMaterialEntryId: 'entry_reject_pending', rawMaterialId: 'rm_reject_pending',
        batchNo: 'BATCH-REJECT-PENDING', qty: 10, quarantineStatus: 'under_testing',
        inspectionResults: [{ testCode: 'IDENTITY', outcome: 'fail', result: 'Not conforming' }],
        inspectionRecordedByUserId: 'qc-analyst-2',
        save: jest.fn().mockResolvedValue(true)
      };
      RawMaterialQuarantine.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockLot) });
      RawMaterialEntry.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockEntry) });
      GoodsReceivedNote.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
      const res = await request(app).patch('/api/manufacturing/quarantine/quarantine_reject_pending/release').send({
        quarantineStatus: 'rejected', testReportNo: 'QC-REJECT-PENDING', remarks: 'Failed incoming specification'
      });
      expect(res.status).toBe(200);
      expect(mockEntry.qcStatus).toBe('rejected');
      expect(mockEntry.save).toHaveBeenCalled();
      expect(mockLot.quarantineStatus).toBe('rejected');
      expect(GoodsReceivedNote.findOne).not.toHaveBeenCalled();
    });

    test('blocks incoming QC release until every linked GRN is independently verified', async () => {
      const mockEntry = { _id: 'entry_pending_grn', rawMaterialId: 'rm_pending', batchNo: 'BATCH-PENDING', qty: 10, reservedQty: 0, qcStatus: 'under_test', grnReferences: [{ grnNo: 'GRN-PENDING', supplierCoaRef: 'COA-REF-PENDING', receivedQty: 10 }], save: jest.fn().mockResolvedValue(true) };
      const mockLot = { _id: 'quarantine_pending', quarantineLotNo: 'QRM-PENDING', rawMaterialEntryId: 'entry_pending_grn', rawMaterialId: 'rm_pending', batchNo: 'BATCH-PENDING', qty: 10, quarantineStatus: 'under_testing', inspectionResults: [{ testCode: 'IDENTITY', outcome: 'pass', result: 'Conforms' }], inspectionRecordedByUserId: 'qc-analyst-1', save: jest.fn().mockResolvedValue(true) };
      RawMaterialQuarantine.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockLot) });
      RawMaterialEntry.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockEntry) });
      GoodsReceivedNote.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
      const res = await request(app).patch('/api/manufacturing/quarantine/quarantine_pending/release').send({ quarantineStatus: 'released', testReportNo: 'QC-PENDING', remarks: 'Testing completed' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/GRN.*independently verified/i);
      expect(mockEntry.save).not.toHaveBeenCalled();
    });
  });

  describe('MRP Calculation QC Enforcement', () => {
    test('MRP excludes under_test and rejected lots from currentAvailableStock', async () => {
      RawMaterial.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'rm_101', name: 'Ashwagandha Powder', unit: 'kg', minReorder: 20 }
        ])
      });

      BillOfMaterials.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          productId: 'prod_shortfall_1',
          formulationBasis: 100,
          isActive: true,
          ingredients: [
            { itemType: 'formulation', rawMaterialId: 'rm_101', qtyRequired: 10 }
          ]
        })
      });

      // RawMaterialEntry find is mocked with query matcher requiring qcStatus: 'approved'
      RawMaterialEntry.find.mockImplementation((query) => {
        if (query.qcStatus === 'approved') {
          return {
            sort: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                { _id: 'entry_approved', qty: 5, reservedQty: 0, qcStatus: 'approved' }
              ])
            })
          };
        }
        return {
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([])
          })
        };
      });

      const res = await request(app).get('/api/analytics/material-requirements-plan');
      expect(res.status).toBe(200);
      expect(res.body.suggestions).toHaveLength(1);
      const sugg = res.body.suggestions[0];
      expect(sugg.rawMaterialId).toBe('rm_101');
      expect(sugg.requiredForProduction).toBe(10); // 100 units shortfall * (10 / 100 basis) = 10
      expect(sugg.currentAvailableStock).toBe(5); // Only approved lot counted (5 kg), excluding under_test lots
      expect(sugg.suggestedPurchaseQty).toBe(15); // max(0, 10-5, 20-5) = 15
    });
  });
});
