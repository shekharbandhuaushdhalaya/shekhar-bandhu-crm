const express = require('express');
const request = require('supertest');

// Mocks
jest.mock('../models/Customer');
jest.mock('../models/Product');
jest.mock('../models/CustomerPricing');
jest.mock('../models/RawMaterial');
jest.mock('../models/SystemSettings');
jest.mock('../models/RolePermission');
jest.mock('../middleware/validate', () => ({
  validate: () => (req, res, next) => next()
}));

const Customer = require('../models/Customer');
const Product = require('../models/Product');
const CustomerPricing = require('../models/CustomerPricing');
const SystemSettings = require('../models/SystemSettings');
const RolePermission = require('../models/RolePermission');

RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });

// Router
const pricingRouter = require('../routes/sales/customerPricing');

describe('Tiered Trade Pricing & Stockist Category Discount Matrices Suite', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: '507f1f77bcf86cd799439011', name: 'Test User', role: 'admin' };
      next();
    });
    app.use('/api/customer-pricing', pricingRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions.mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  test('GET /api/customer-pricing/trade-matrix returns trade category discount matrix', async () => {
    SystemSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        tradeDiscountMatrix: {
          super_stockist: 45,
          distributor: 35,
          retailer: 20,
          hospital: 15,
          direct: 0
        }
      })
    });

    const res = await request(app).get('/api/customer-pricing/trade-matrix');
    expect(res.status).toBe(200);
    expect(res.body.super_stockist).toBe(45);
    expect(res.body.distributor).toBe(35);
  });

  test('POST /api/customer-pricing/trade-matrix updates trade category discounts', async () => {
    const mockSave = jest.fn().mockResolvedValue(true);
    const mockSettings = {
      tradeDiscountMatrix: {},
      save: mockSave
    };
    SystemSettings.findOne.mockResolvedValue(mockSettings);

    const res = await request(app)
      .post('/api/customer-pricing/trade-matrix')
      .send({ super_stockist: 48, distributor: 38 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSettings.tradeDiscountMatrix.super_stockist).toBe(48);
    expect(mockSave).toHaveBeenCalled();
  });

  test('POST /api/customer-pricing/resolve auto-applies Super Stockist (45%) discount off MRP', async () => {
    Customer.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'cust_stockist_1',
        name: 'Varanasi Super Stockist',
        tradeCategory: 'super_stockist'
      })
    });

    SystemSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        tradeDiscountMatrix: { super_stockist: 45, distributor: 35 }
      })
    });

    CustomerPricing.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null) // No specific product override rule
    });

    Product.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'prod_100',
        name: 'Chyawanprash 1kg',
        price: 500,
        mrp: 500,
        sku: 'CHW-1K'
      })
    });

    const res = await request(app)
      .post('/api/customer-pricing/resolve')
      .send({
        customerId: 'cust_stockist_1',
        items: [{ productId: 'prod_100', qty: 10 }]
      });

    expect(res.status).toBe(200);
    expect(res.body.tradeCategory).toBe('super_stockist');
    expect(res.body.appliedCategoryDiscount).toBe(45);
    expect(res.body.items[0].discountPercent).toBe(45);
    expect(res.body.items[0].finalUnitPrice).toBe(275); // 500 * (1 - 0.45) = 275
    expect(res.body.items[0].pricingSource).toBe('trade_category_matrix');
  });

  test('POST /api/customer-pricing/resolve honors custom Product rule over trade category default', async () => {
    Customer.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'cust_stockist_1',
        name: 'Varanasi Super Stockist',
        tradeCategory: 'super_stockist'
      })
    });

    CustomerPricing.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        customRate: 200, // Special rate 200 overrides 45% matrix discount
        discountPercent: 0
      })
    });

    Product.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'prod_100',
        name: 'Chyawanprash 1kg',
        price: 500,
        mrp: 500
      })
    });

    const res = await request(app)
      .post('/api/customer-pricing/resolve')
      .send({
        customerId: 'cust_stockist_1',
        items: [{ productId: 'prod_100', qty: 5 }]
      });

    expect(res.status).toBe(200);
    expect(res.body.items[0].finalUnitPrice).toBe(200);
    expect(res.body.items[0].pricingSource).toBe('custom_rate');
  });
});
