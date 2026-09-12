const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const BatchProduction = require('../models/BatchProduction');
const Order = require('../models/Order');
const analyticsRoutes = require('../routes/analytics/analytics');

let mongoServer;
let app;

describe('Task 5 — Proactive AI Anomaly Insights Suite', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: new mongoose.Types.ObjectId().toString(), role: 'admin', permissions: ['analytics:query'] };
      next();
    });
    app.use('/api/analytics', analyticsRoutes);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Invoice.deleteMany({});
    await Product.deleteMany({});
    await BatchProduction.deleteMany({});
    await Order.deleteMany({});
  });

  it('computes 4 concrete operational signals and returns narrative summary', async () => {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 15);

    // 1. Seed Sale Invoices (Last Month: ₹100,000, Current Month: ₹150,000 => +50% MoM)
    await Invoice.create({
      invoiceNo: 'VP/26-27/LM01',
      type: 'sale',
      isFinalized: true,
      amount: 100000,
      nettTotal: 100000,
      date: lastMonthStart
    });

    await Invoice.create({
      invoiceNo: 'VP/26-27/CM01',
      type: 'sale',
      isFinalized: true,
      amount: 150000,
      nettTotal: 150000,
      date: currentMonthStart
    });

    // 2. Seed Low Stock Product
    await Product.create({
      name: 'Chyawanprash Special',
      sku: 'CHY-001',
      stockLevel: 3,
      minReorderLevel: 10,
      mrp: 500,
      rate: 350
    });

    // 3. Seed Batch Production with low yield (>15% below product avg)
    const prodId = new mongoose.Types.ObjectId();
    const mfgUnitId = new mongoose.Types.ObjectId();
    await BatchProduction.create({
      batchNo: 'BATCH-2026-001',
      manufacturingUnitId: mfgUnitId,
      plannedQty: 100,
      actualYieldQty: 95,
      productId: prodId,
      productName: 'Abhraka Bhasma Batch 1',
      status: 'completed',
      createdAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
    });

    await BatchProduction.create({
      batchNo: 'BATCH-2026-002',
      manufacturingUnitId: mfgUnitId,
      plannedQty: 100,
      actualYieldQty: 40, // 40% yield vs 70% average (drop of 30% > 15%)
      productId: prodId,
      productName: 'Abhraka Bhasma Batch 2 (Low Yield)',
      status: 'completed',
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    });

    // 4. Seed Orders for Customer Order Drop
    await Order.create({
      name: 'Regular Customer Pharmacy',
      email: 'regular@pharmacy.com',
      phone: '9876543210',
      shippingAddress: 'Varanasi',
      totalAmount: 10000,
      createdAt: new Date(now.getTime() - 75 * 24 * 60 * 60 * 1000)
    });
    await Order.create({
      name: 'Regular Customer Pharmacy',
      email: 'regular@pharmacy.com',
      phone: '9876543210',
      shippingAddress: 'Varanasi',
      totalAmount: 10000,
      createdAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000)
    });

    // Trigger GET /api/analytics/ai-insights
    const res = await request(app).get('/api/analytics/ai-insights');

    expect(res.status).toBe(200);
    expect(res.body.signals).toBeDefined();
    expect(res.body.signals.momRevenueChangePct).toBe(50);
    expect(res.body.signals.lowStockProductsCount).toBe(1);
    expect(res.body.signals.lowYieldBatchesCount).toBeGreaterThanOrEqual(1);
    expect(res.body.narrative).toBeDefined();
    expect(typeof res.body.narrative).toBe('string');
  });
});
