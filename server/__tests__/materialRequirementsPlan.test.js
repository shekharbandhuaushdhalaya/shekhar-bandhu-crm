const express = require('express');
const request = require('supertest');

// Mocks
jest.mock('../models/Product');
jest.mock('../models/Invoice');
jest.mock('../models/RawMaterial');
jest.mock('../models/RawMaterialEntry');
jest.mock('../models/BillOfMaterials');
jest.mock('../models/ProductionPlan');
jest.mock('../models/Warehouse');
jest.mock('../models/RolePermission');

const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const BillOfMaterials = require('../models/BillOfMaterials');
const ProductionPlan = require('../models/ProductionPlan');
const Warehouse = require('../models/Warehouse');
const RolePermission = require('../models/RolePermission');

RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });

const mrpRouter = require('../routes/analytics/materialRequirementsPlan');

describe('Material Requirements Planning (MRP) Engine & Endpoints', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: '507f1f77bcf86cd799439011', name: 'Test Planner', role: 'admin' };
      next();
    });
    app.use('/api/analytics/material-requirements-plan', mrpRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions.mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  describe('1. GET /api/analytics/material-requirements-plan', () => {
    test('1a. Shortfall product correctly computes required raw material qty using formulationBasis scaling', async () => {
      // Setup Product with currentStockLevel = 0, past 3M sales = 300 (avg 100, projected 110, shortfall 110)
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'prod_1', name: 'Ashwagandha Syrup', sku: 'ASH-100', stockLevel: 0 }
          ])
        })
      });

      // 300 units sold over past 3 months -> avgMonthlyDemand = 100, projectedNextMonthDemandUnits = 110, shortfall = 110
      Invoice.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { items: [{ productId: 'prod_1', qty: 300 }] }
          ])
        })
      });

      // Recipe: formulationBasis 100, qtyRequired = 5 kg per 100 output units
      BillOfMaterials.findOne.mockImplementation(({ productId }) => {
        if (productId === 'prod_1') {
          return {
            lean: jest.fn().mockResolvedValue({
              _id: 'bom_1',
              productId: 'prod_1',
              isDefault: true,
              isActive: true,
              formulationBasis: 100,
              ingredients: [
                { rawMaterialId: 'rm_ashwagandha', qtyRequired: 5, itemType: 'formulation' }
              ]
            })
          };
        }
        return { lean: jest.fn().mockResolvedValue(null) };
      });

      // Raw Material details: minReorder = 0
      RawMaterial.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'rm_ashwagandha', name: 'Ashwagandha Extract', unit: 'kg', minReorder: 0 }
        ])
      });

      // No stock available
      RawMaterialEntry.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });

      const res = await request(app).get('/api/analytics/material-requirements-plan');

      expect(res.status).toBe(200);
      expect(res.body.suggestions).toHaveLength(1);
      const sug = res.body.suggestions[0];
      expect(sug.rawMaterialName).toBe('Ashwagandha Extract');
      // shortfall = 110. required = 5 * (110 / 100) = 5.5 kg
      expect(sug.requiredForProduction).toBe(5.5);
      expect(sug.suggestedPurchaseQty).toBe(5.5);
      expect(sug.drivenByProducts[0].productName).toBe('Ashwagandha Syrup');
      expect(sug.drivenByProducts[0].shortfallUnits).toBe(110);
    });

    test('1b. Stock aggregation sums available stock across lots, excluding reserved and expired lots', async () => {
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'prod_1', name: 'Chyawanprash', stockLevel: 0 }
          ])
        })
      });

      Invoice.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { items: [{ productId: 'prod_1', qty: 300 }] } // 110 shortfall
          ])
        })
      });

      BillOfMaterials.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'bom_1',
          productId: 'prod_1',
          isDefault: true,
          formulationBasis: 100,
          ingredients: [{ rawMaterialId: 'rm_amla', qtyRequired: 10, itemType: 'formulation' }] // 11 kg needed
        })
      });

      RawMaterial.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'rm_amla', name: 'Amla Fresh', unit: 'kg', minReorder: 0 }
        ])
      });

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      RawMaterialEntry.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { rawMaterialId: 'rm_amla', qty: 5, reservedQty: 1, expiryDate: futureDate, vendorName: 'Herb Traders' }, // net 4
            { rawMaterialId: 'rm_amla', qty: 10, reservedQty: 0, expiryDate: pastDate, vendorName: 'Expired Supplies' }, // EXPIRED -> 0
            { rawMaterialId: 'rm_amla', qty: 3, reservedQty: 0, expiryDate: null, vendorName: 'Fresh Farms' } // net 3
          ])
        })
      });

      const res = await request(app).get('/api/analytics/material-requirements-plan');

      expect(res.status).toBe(200);
      const sug = res.body.suggestions[0];
      // Total valid available stock = 4 + 3 = 7
      expect(sug.currentAvailableStock).toBe(7);
      // Required = 10 * (110 / 100) = 11 kg.
      expect(sug.requiredForProduction).toBe(11);
      // Suggested = 11 - 7 = 4 kg.
      expect(sug.suggestedPurchaseQty).toBe(4);
      expect(sug.preferredVendor.vendorName).toBe('Herb Traders');
    });

    test('1c. Raw material used by multiple shortfall products aggregates demand across all products', async () => {
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'prod_1', name: 'Syrup A', stockLevel: 0 },
            { _id: 'prod_2', name: 'Tablet B', stockLevel: 0 }
          ])
        })
      });

      // Syrup A: 300 sales -> 110 shortfall. Tablet B: 600 sales -> 220 shortfall.
      Invoice.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { items: [{ productId: 'prod_1', qty: 300 }, { productId: 'prod_2', qty: 600 }] }
          ])
        })
      });

      BillOfMaterials.findOne.mockImplementation(({ productId }) => {
        if (productId === 'prod_1') {
          return {
            lean: jest.fn().mockResolvedValue({
              formulationBasis: 100,
              ingredients: [{ rawMaterialId: 'rm_honey', qtyRequired: 2, itemType: 'formulation' }] // 2 * 1.1 = 2.2 kg
            })
          };
        }
        if (productId === 'prod_2') {
          return {
            lean: jest.fn().mockResolvedValue({
              formulationBasis: 100,
              ingredients: [{ rawMaterialId: 'rm_honey', qtyRequired: 4, itemType: 'formulation' }] // 4 * 2.2 = 8.8 kg
            })
          };
        }
        return { lean: jest.fn().mockResolvedValue(null) };
      });

      RawMaterial.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'rm_honey', name: 'Pure Honey', unit: 'kg', minReorder: 0 }
        ])
      });

      RawMaterialEntry.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });

      const res = await request(app).get('/api/analytics/material-requirements-plan');

      expect(res.status).toBe(200);
      const sug = res.body.suggestions[0];
      // Total required = 2.2 + 8.8 = 11 kg
      expect(sug.requiredForProduction).toBe(11);
      expect(sug.drivenByProducts).toHaveLength(2);
    });

    test('1d. Standing minReorder threshold pulls suggested purchase quantity up when available stock is low', async () => {
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });

      Invoice.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });

      // Raw Material with minReorder = 20 kg
      RawMaterial.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'rm_tulsi', name: 'Tulsi Leaves', unit: 'kg', minReorder: 20 }
        ])
      });

      // Stock available = 5 kg
      RawMaterialEntry.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { rawMaterialId: 'rm_tulsi', qty: 5, reservedQty: 0 }
          ])
        })
      });

      const res = await request(app).get('/api/analytics/material-requirements-plan');

      expect(res.status).toBe(200);
      const sug = res.body.suggestions[0];
      expect(sug.requiredForProduction).toBe(0);
      expect(sug.currentAvailableStock).toBe(5);
      expect(sug.minReorderThreshold).toBe(20);
      // max(0, 0-5, 20-5) = 15 kg
      expect(sug.suggestedPurchaseQty).toBe(15);
    });
  });

  describe('2. POST /api/analytics/material-requirements-plan/create-production-plans', () => {
    test('2a. Generates draft ProductionPlan documents for specified shortfall products', async () => {
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'prod_1', name: 'Brahmi Vati', stockLevel: 0 }
          ])
        })
      });

      Invoice.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { items: [{ productId: 'prod_1', qty: 300 }] } // 110 shortfall
          ])
        })
      });

      Warehouse.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'wh_main', name: 'Varanasi Main Factory' })
      });

      ProductionPlan.create.mockImplementation(async (data) => ({
        _id: 'plan_1',
        ...data
      }));

      const res = await request(app)
        .post('/api/analytics/material-requirements-plan/create-production-plans')
        .send({ productIds: ['prod_1'] });

      expect(res.status).toBe(201);
      expect(res.body.count).toBe(1);
      expect(ProductionPlan.create).toHaveBeenCalledWith(expect.objectContaining({
        title: 'MRP Plan - Brahmi Vati',
        manufacturingUnitId: 'wh_main',
        manufacturingUnitName: 'Varanasi Main Factory',
        status: 'draft',
        plannedBatches: [
          expect.objectContaining({
            productId: 'prod_1',
            productName: 'Brahmi Vati',
            plannedQty: 110
          })
        ]
      }));
    });
  });
});
