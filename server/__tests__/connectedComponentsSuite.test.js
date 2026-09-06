const express = require('express');
const request = require('supertest');

// Mocks
jest.mock('../models/Complaint');
jest.mock('../models/DeviationCapa');
jest.mock('../models/Order');
jest.mock('../models/Product');
jest.mock('../models/InventoryEntry');
jest.mock('../models/StockLedger');
jest.mock('../models/SalesTarget');
jest.mock('../models/RolePermission');
jest.mock('../middleware/validate', () => ({
  validate: () => (req, res, next) => next()
}));
jest.mock('../utils/documentCounter', () => ({
  generateAtomicDocumentNumber: jest.fn().mockResolvedValue('CMP-001')
}));

const Complaint = require('../models/Complaint');
const DeviationCapa = require('../models/DeviationCapa');
const Order = require('../models/Order');
const Product = require('../models/Product');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');
const SalesTarget = require('../models/SalesTarget');
const RolePermission = require('../models/RolePermission');

RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });

// Routers
const complaintsRouter = require('../routes/operations/complaints');
const ordersRouter = require('../routes/sales/orders');
const mrRouter = require('../routes/crm/medicalReps');

describe('Connected Standalone Components Suite (Options 1 & 3)', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: '507f1f77bcf86cd799439011', name: 'Test User', role: 'admin' };
      next();
    });

    app.use('/api/complaints', complaintsRouter);
    app.use('/api/orders', ordersRouter);
    app.use('/api/medical-reps', mrRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions.mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  // Option 1 Tests
  describe('Option 1: Customer Complaints ↔ Batch Production & Quality CAPA', () => {
    test('POST /api/complaints creates complaint and auto-triggers CAPA on 2+ complaints for same batch', async () => {
      const mockSave = jest.fn().mockResolvedValue(true);
      const mockComplaint = {
        _id: 'cmp_1',
        complaintNo: 'CMP-001',
        batchNo: 'B-2026-99',
        productName: 'Maha Bhringraj Taila',
        autoCapaTriggered: false,
        save: mockSave
      };
      Complaint.create.mockResolvedValue(mockComplaint);
      Complaint.countDocuments.mockResolvedValue(2); // 2nd complaint on same batch
      DeviationCapa.findOne.mockResolvedValue(null);
      DeviationCapa.create.mockResolvedValue({
        _id: 'capa_99',
        deviationNo: 'CAPA-CMP-123456',
        batchNo: 'B-2026-99',
        deviationType: 'customer_complaint_cluster'
      });

      const res = await request(app)
        .post('/api/complaints')
        .send({
          customerName: 'Gupta Medicals',
          batchNo: 'B-2026-99',
          productName: 'Maha Bhringraj Taila',
          description: 'Sedimentation observed in bottle'
        });

      expect(res.status).toBe(201);
      expect(DeviationCapa.create).toHaveBeenCalled();
      expect(mockComplaint.autoCapaTriggered).toBe(true);
      expect(mockSave).toHaveBeenCalled();
    });

    test('GET /api/complaints/batch-clusters returns batch complaint clusters', async () => {
      Complaint.aggregate.mockResolvedValue([
        {
          _id: 'B-2026-99',
          complaintCount: 2,
          productName: 'Maha Bhringraj Taila',
          autoCapaTriggered: true
        }
      ]);

      const res = await request(app).get('/api/complaints/batch-clusters');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]._id).toBe('B-2026-99');
      expect(res.body[0].complaintCount).toBe(2);
    });
  });

  // Option 3 Tests
  describe('Option 3: Field MR Order Booking ↔ Sales Targets & Commissions', () => {
    test('POST /api/orders/public/create with mrId calculates 2% commission and updates SalesTarget', async () => {
      Product.findById.mockResolvedValue({
        _id: 'prod_1',
        name: 'Ashwagandha Syrup',
        price: 200,
        discount: 0,
        stockLevel: 100,
        save: jest.fn().mockResolvedValue(true)
      });

      InventoryEntry.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          { _id: 'inv_1', qtyBoxes: 50, packing: 1, save: jest.fn() }
        ])
      });

      StockLedger.create.mockResolvedValue(true);
      SalesTarget.findOneAndUpdate.mockResolvedValue(true);

      const mockOrder = {
        _id: 'ord_101',
        totalAmount: 10000,
        mrId: 'mr_777',
        commissionAmount: 200
      };
      Order.create.mockResolvedValue(mockOrder);

      const res = await request(app)
        .post('/api/orders/public/create')
        .send({
          name: 'City Pharmacy',
          email: 'city@pharmacy.com',
          phone: '9876543210',
          shippingAddress: 'Main Road Varanasi',
          mrId: 'mr_777',
          mrName: 'Rajesh Kumar MR',
          items: [{ productId: 'prod_1', qty: 50 }]
        });

      expect(res.status).toBe(201);
      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mrId: 'mr_777',
          commissionAmount: 200,
          incentiveCredited: true
        })
      );
      expect(SalesTarget.findOneAndUpdate).toHaveBeenCalled();
    });

    test('GET /api/medical-reps/:mrId/sales-performance returns MR sales ledger & commissions', async () => {
      Order.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'ord_101', mrId: 'mr_777', totalAmount: 10000, commissionAmount: 200 }
          ])
        })
      });

      SalesTarget.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          agentId: 'mr_777',
          targetAmount: 50000,
          achievedAmount: 10000
        })
      });

      const res = await request(app).get('/api/medical-reps/mr_777/sales-performance');
      expect(res.status).toBe(200);
      expect(res.body.mrId).toBe('mr_777');
      expect(res.body.totalSalesBooked).toBe(10000);
      expect(res.body.totalCommissionEarned).toBe(200);
      expect(res.body.monthlyTarget.achievementPercentage).toBe(20);
    });
  });
});
