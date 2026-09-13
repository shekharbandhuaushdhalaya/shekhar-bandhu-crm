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
jest.mock('../models/Doctor');
jest.mock('../models/Invoice');
jest.mock('../models/Warehouse');
jest.mock('../models/Payment');
jest.mock('../models/StockMovement');
jest.mock('../models/MrDailyLog');
jest.mock('../models/MrExpense');
jest.mock('../models/RolePermission');
// The stock-transfer and MR routes exercised here allocate document numbers
// through the atomic, tenant-scoped Counter model (see utils/documentCounter.js);
// mock it so findOneAndUpdate() doesn't hang against a real unconnected model.
jest.mock('../models/Counter', () => ({
  findOneAndUpdate: jest.fn().mockResolvedValue({ seq: 1 }),
}));
// Stock-transfer shipping now creates/posts an authoritative Transfer Challan
// instead of deducting stock directly (see routes/inventory/transfers.js).
jest.mock('../models/Challan');
jest.mock('../services/challanInventoryService', () => ({
  postChallanInventory: jest.fn(),
  reverseChallanInventory: jest.fn(),
}));
// MR visit creation + sample consumption is now one real Mongoose transaction
// (see routes/crm/medicalReps.js). Real transactions need a replica-set
// connection this sandbox doesn't have, so run the callback without a session
// for these mocked-model unit tests.
jest.mock('../utils/withTransaction', () => ({
  withTransaction: jest.fn(work => work(null)),
}));

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
const Doctor = require('../models/Doctor');
const Invoice = require('../models/Invoice');
const Warehouse = require('../models/Warehouse');
const Payment = require('../models/Payment');
const StockMovement = require('../models/StockMovement');
const MrDailyLog = require('../models/MrDailyLog');
const MrExpense = require('../models/MrExpense');
const Challan = require('../models/Challan');
const { postChallanInventory } = require('../services/challanInventoryService');

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

  beforeEach(() => {
    RolePermission.getEffectivePermissions.mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
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
      Doctor.findById.mockResolvedValue(null);
      Doctor.findOne.mockResolvedValue(mockDocLoc);

      // MrVisit.create is now called as MrVisit.create([data], { session }) inside
      // withTransaction, so the mock must resolve to an array (Mongoose's own
      // array-form behavior) for the route's `const [created] = ...` destructure.
      MrVisit.create.mockImplementation(([data]) => Promise.resolve([{ _id: 'visit_99', ...data }]));
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
      // Stock-transfer numbers are now 5-digit padded via the atomic Counter
      // (routes/inventory/transfers.js), up from 4 digits previously.
      expect(response.body.transferNo).toBe('TRSF-00001');
      expect(response.body.status).toBe('pending');
    });

    // Shipping was reworked to route physical movement through a single
    // authoritative Transfer Challan (posted via challanInventoryService)
    // instead of deducting InventoryEntry/StockLedger directly in this route.
    test('PATCH /api/inventory/transfers/:id/ship creates/posts the authoritative Transfer Challan', async () => {
      const mockTransfer = {
        _id: 'transfer_01',
        transferNo: 'TRSF-00001',
        fromWarehouseId: { equals: jest.fn().mockReturnValue(false) },
        toWarehouseId: 'wh_to_1',
        items: [{ productId: '507f1f77bcf86cd799439013', productName: 'Syp Kof-K', qtyBoxes: 5, packing: 1, batchNo: 'B-1' }],
        status: 'pending',
        save: jest.fn().mockResolvedValue(true)
      };

      StockTransfer.findById.mockResolvedValue(mockTransfer);
      Warehouse.findById
        .mockResolvedValueOnce({ _id: 'wh_from_1', name: 'Varanasi Central' })
        .mockResolvedValueOnce({ _id: 'wh_to_1', name: 'Delhi Depot', addressLine1: 'Depot Rd', city: 'Delhi', state: 'DL', pincode: '110001' });
      Challan.findById.mockResolvedValue(null);
      Challan.findOne.mockResolvedValue(null);
      const createdChallan = { _id: 'challan_1', challanNo: 'TR-CH-00001' };
      Challan.create.mockResolvedValue(createdChallan);
      postChallanInventory.mockResolvedValue({ _id: 'challan_1', challanNo: 'TR-CH-00001' });

      const response = await request(app).patch('/api/inventory/transfers/transfer_01/ship');
      expect(response.status).toBe(200);
      expect(response.body.transfer.status).toBe('in_transit');
      expect(response.body.challan.challanNo).toBe('TR-CH-00001');
      expect(Challan.create).toHaveBeenCalled();
      expect(postChallanInventory).toHaveBeenCalledWith(createdChallan, expect.any(Object));
      expect(mockTransfer.save).toHaveBeenCalled();
    });
  });
});
