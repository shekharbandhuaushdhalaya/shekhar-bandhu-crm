const express = require('express');
const request = require('supertest');

jest.mock('../models/RawMaterial');
jest.mock('../models/RawMaterialEntry');
jest.mock('../models/RawMaterialQuarantine');
jest.mock('../models/BillOfMaterials');
jest.mock('../models/ProductionPlan');
jest.mock('../models/Product');
jest.mock('../models/Warehouse');
jest.mock('../models/RolePermission');
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
  });

  describe('Quarantine Release Updates Linked RawMaterialEntry qcStatus', () => {
    test('POST /api/manufacturing/quarantine logs quarantine lot and links matching RawMaterialEntry', async () => {
      RawMaterialEntry.findOne.mockResolvedValue({
        _id: 'entry_101',
        rawMaterialId: 'rm_101',
        batchNo: 'BATCH-2026-001',
        qcStatus: 'under_test'
      });

      RawMaterialQuarantine.create.mockImplementation(async (data) => ({
        _id: 'quarantine_101',
        ...data
      }));

      const res = await request(app)
        .post('/api/manufacturing/quarantine')
        .send({
          herbName: 'Ashwagandha',
          batchNo: 'BATCH-2026-001',
          qty: 50,
          unit: 'kg',
          expiryDate: '2027-12-31'
        });

      expect(res.status).toBe(201);
      expect(RawMaterialQuarantine.create).toHaveBeenCalledWith(expect.objectContaining({
        herbName: 'Ashwagandha',
        batchNo: 'BATCH-2026-001',
        rawMaterialEntryId: 'entry_101',
        rawMaterialId: 'rm_101'
      }));
    });

    test('PATCH /api/manufacturing/quarantine/:id/release sets RawMaterialEntry qcStatus to approved when released', async () => {
      const mockEntry = {
        _id: 'entry_101',
        rawMaterialId: 'rm_101',
        qcStatus: 'under_test',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockLot = {
        _id: 'quarantine_101',
        quarantineLotNo: 'QRM-1001',
        rawMaterialEntryId: 'entry_101',
        quarantineStatus: 'under_testing',
        save: jest.fn().mockResolvedValue(true)
      };

      RawMaterialQuarantine.findById.mockResolvedValue(mockLot);
      RawMaterialEntry.findById.mockResolvedValue(mockEntry);

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
        qcStatus: 'under_test',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockLot = {
        _id: 'quarantine_102',
        quarantineLotNo: 'QRM-1002',
        rawMaterialEntryId: 'entry_102',
        quarantineStatus: 'under_testing',
        save: jest.fn().mockResolvedValue(true)
      };

      RawMaterialQuarantine.findById.mockResolvedValue(mockLot);
      RawMaterialEntry.findById.mockResolvedValue(mockEntry);

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
