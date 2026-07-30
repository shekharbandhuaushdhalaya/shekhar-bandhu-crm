const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

// Mock Mongoose models
jest.mock('../models/Customer');
jest.mock('../models/Vendor');
jest.mock('../models/Product');
jest.mock('../models/InventoryEntry');
jest.mock('../models/Notification');
jest.mock('../models/MedicalRepresentative');
jest.mock('../models/MrVisit');
jest.mock('../models/StockTransfer');
jest.mock('../models/StockLedger');
jest.mock('../models/Contact');
jest.mock('../models/Invoice');
jest.mock('../models/Warehouse');
jest.mock('../models/Payment');
jest.mock('../models/StockMovement');
jest.mock('../models/MrDailyLog');
jest.mock('../models/MrExpense');
jest.mock('../models/RolePermission');

const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const RolePermission = require('../models/RolePermission');
RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
const InventoryEntry = require('../models/InventoryEntry');
const Notification = require('../models/Notification');
const MedicalRepresentative = require('../models/MedicalRepresentative');
const MrVisit = require('../models/MrVisit');
const StockTransfer = require('../models/StockTransfer');
const StockLedger = require('../models/StockLedger');
const Contact = require('../models/Contact');
const Invoice = require('../models/Invoice');
const Warehouse = require('../models/Warehouse');
const Payment = require('../models/Payment');
const StockMovement = require('../models/StockMovement');
const MrDailyLog = require('../models/MrDailyLog');
const MrExpense = require('../models/MrExpense');

// Routers
const complianceRouter = require('../routes/inventory/compliance');
const transfersRouter = require('../routes/inventory/transfers');
const tallyRouter = require('../routes/finance/tally');
const notificationsRouter = require('../routes/system/notifications');
const mrRouter = require('../routes/crm/medicalReps');

describe('Compliance and Operations Features', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    // Attach dummy authenticated user middleware
    app.use((req, res, next) => {
      req.user = { id: '507f1f77bcf86cd799439011', name: 'Test User', role: 'admin' };
      next();
    });
    app.use('/api/inventory/compliance', complianceRouter);
    app.use('/api/inventory/transfers', transfersRouter);
    app.use('/api/finance/export/tally', tallyRouter);
    app.use('/api/notifications', notificationsRouter);
    app.use('/api/medical-reps', mrRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Pharma Expiry & Compliance Alerts', () => {
    test('GET /near-expiry returns upcoming expiring batches', async () => {
      const mockEntries = [
        { batchNo: 'B-100', expiryDate: new Date(), qtyBoxes: 5 }
      ];
      InventoryEntry.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockEntries)
        })
      });

      const response = await request(app).get('/api/inventory/compliance/near-expiry');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].batchNo).toBe('B-100');
    });

    test('GET /license-alerts returns expiring customer and vendor drug licenses', async () => {
      Customer.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ name: 'Cust A', drugLicenseExpiry: new Date() }])
        })
      });
      Vendor.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ name: 'Vend B', manufacturingLicenseExpiry: new Date() }])
        })
      });

      const response = await request(app).get('/api/inventory/compliance/license-alerts');
      expect(response.status).toBe(200);
      expect(response.body.customers).toHaveLength(1);
      expect(response.body.vendors).toHaveLength(1);
    });

    test('GET /low-stock returns items below threshold', async () => {
      const mockLowStock = [{ name: 'Paracetamol', stockLevel: 2, minReorder: 10 }];
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockLowStock)
        })
      });

      const response = await request(app).get('/api/inventory/compliance/low-stock');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Paracetamol');
    });
  });

  describe('Centralized Notification Center Check', () => {
    test('GET /alerts/check scans compliance lists and inserts notifications', async () => {
      Product.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{ name: 'Aspirin', minReorder: 10, stockLevel: 1 }]) });
      Customer.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      Vendor.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      InventoryEntry.find.mockReturnValue({ populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });

      // Mock finding no existing notifications
      Notification.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      Notification.create.mockResolvedValue({ title: 'Low Stock Warning', message: 'Test Alert' });

      const response = await request(app).get('/api/notifications/alerts/check');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Notification.create).toHaveBeenCalled();
    });
  });

  describe('Tally Accounting Export', () => {
    test('GET /finance/export/tally returns plain text CSV content', async () => {
      Invoice.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{ invoiceNo: 'INV-123', type: 'sale', amount: 500 }]) });
      Payment.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      const response = await request(app).get('/api/finance/export/tally');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('INV-123');
    });
  });

  describe('Field Force Geofencing & Commissions', () => {
    test('POST /medical-reps/:id/visits calculates distance and auto-verifies geofenced clinics', async () => {
      const mockDocLoc = { name: 'Dr. Ramesh', latitude: 25.3176, longitude: 82.9739 }; // Varanasi Coordinates
      Customer.findOne.mockResolvedValue(null);
      Contact.findOne.mockResolvedValue(mockDocLoc);

      MrVisit.create.mockImplementation(data => Promise.resolve({ _id: 'visit_99', ...data }));
      MedicalRepresentative.findById.mockResolvedValue({ name: 'Rajesh' });
      StockMovement.countDocuments.mockResolvedValue(0);
      StockMovement.create.mockResolvedValue({});
      Product.findById.mockResolvedValue({ name: 'Test Product', save: jest.fn().mockResolvedValue(true) });

      // Checkin at close location (Varanasi Ghats ~150 meters away)
      const response = await request(app)
        .post('/api/medical-reps/mr_001/visits')
        .send({
          doctorName: 'Dr. Ramesh',
          latitude: 25.3180,
          longitude: 82.9745,
          clinic: 'Ramesh Clinic'
        });

      expect(response.status).toBe(201);
      expect(response.body.doctorVerified).toBe(true);
    });

    test('GET /medical-reps/commission/calculate computes commission payouts', async () => {
      MedicalRepresentative.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: 'mr_001', name: 'Rajesh', monthlyTarget: 10000 }]) });
      MrVisit.aggregate.mockResolvedValue([{ _id: 'mr_001', totalSales: 12000 }]);

      const response = await request(app).get('/api/medical-reps/commission/calculate?month=07&year=2026');
      expect(response.status).toBe(200);
      expect(response.body.report[0].achievementPct).toBe(120);
      expect(response.body.report[0].calculatedCommission).toBe(600); // 5% of 12000
    });
  });

  describe('Inter-Warehouse Stock Transfers Workflow', () => {
    test('POST /api/inventory/transfers creates pending transfer request', async () => {
      Warehouse.findById.mockResolvedValue({ name: 'Varanasi Central' });
      Product.findById.mockResolvedValue({ name: 'Syp Kof-K' });
      StockTransfer.countDocuments.mockResolvedValue(0);
      StockTransfer.create.mockImplementation(data => Promise.resolve({ _id: 'transfer_01', ...data }));

      const response = await request(app)
        .post('/api/inventory/transfers')
        .send({
          fromWarehouseId: '507f1f77bcf86cd799439011',
          toWarehouseId: '507f1f77bcf86cd799439012',
          items: [{ productId: '507f1f77bcf86cd799439013', qtyBoxes: 10 }]
        });

      expect(response.status).toBe(201);
      expect(response.body.transferNo).toBe('TRSF-0001');
      expect(response.body.status).toBe('pending');
    });

    test('PATCH /api/inventory/transfers/:id/ship handles stock deduction from source', async () => {
      const mockTransfer = {
        _id: 'transfer_01',
        transferNo: 'TRSF-0001',
        fromWarehouseId: '507f1f77bcf86cd799439011',
        fromWarehouseName: 'Source W',
        toWarehouseName: 'Target W',
        status: 'pending',
        items: [{ productId: '507f1f77bcf86cd799439013', qtyBoxes: 5, packing: 1, batchNo: 'B-1' }],
        save: jest.fn().mockResolvedValue(true)
      };

      StockTransfer.findById.mockResolvedValue(mockTransfer);
      InventoryEntry.findOne.mockResolvedValue({
        qtyBoxes: 10,
        save: jest.fn().mockResolvedValue(true)
      });
      StockLedger.create.mockResolvedValue({});

      const response = await request(app).patch('/api/inventory/transfers/transfer_01/ship');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('in_transit');
      expect(mockTransfer.save).toHaveBeenCalled();
    });
  });
});
