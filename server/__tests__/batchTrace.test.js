const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const BatchProduction = require('../models/BatchProduction');
const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const batchTraceRoutes = require('../routes/manufacturing/batchTrace');

let mongoServer;
let app;

describe('Task 6 — Batch Recall Traceability Suite (Backward & Forward Trace)', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: new mongoose.Types.ObjectId().toString(), role: 'admin', permissions: ['inventory:view'] };
      next();
    });
    app.use('/api/manufacturing/batch-trace', batchTraceRoutes);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await BatchProduction.deleteMany({});
    await RawMaterial.deleteMany({});
    await RawMaterialEntry.deleteMany({});
    await Invoice.deleteMany({});
    await Product.deleteMany({});
  });

  it('returns complete backward (vendor/raw material) and forward (customer/invoice) traceability chains', async () => {
    const mfgUnitId = new mongoose.Types.ObjectId();
    const prod = await Product.create({
      name: 'Ashwagandha Rasayana 500g',
      sku: 'ASH-RAS-500',
      stockLevel: 500,
      mrp: 350,
      rate: 250
    });

    const rm = await RawMaterial.create({
      name: 'Purified Ashwagandha Root',
      sku: 'RM-ASH-ROOT',
      unit: 'kg',
      category: 'Herb'
    });

    const rmEntry = await RawMaterialEntry.create({
      rawMaterialId: rm._id,
      batchNo: 'RM-BATCH-2026-99',
      initialQty: 100,
      qty: 80,
      purchaseRate: 200,
      vendorId: new mongoose.Types.ObjectId(),
      vendorName: 'Himalayan Organic Botanicals Ltd',
      purchaseRef: 'PO-2026-444'
    });

    const targetBatchNo = 'VP-ASH-2026-88';

    // Seed Batch Production (Finished Good)
    await BatchProduction.create({
      batchNo: targetBatchNo,
      manufacturingUnitId: mfgUnitId,
      plannedQty: 500,
      actualYieldQty: 490,
      productId: prod._id,
      productName: prod.name,
      status: 'completed',
      ingredientsConsumed: [
        {
          rawMaterialId: rm._id,
          rawMaterialEntryId: rmEntry._id,
          qtyConsumed: 20,
          batchNo: rmEntry.batchNo
        }
      ]
    });

    // Seed Sale Invoice shipping finished-goods batch to customer
    await Invoice.create({
      invoiceNo: 'VP/26-27/777',
      type: 'sale',
      isFinalized: true,
      customerName: 'Kashi Pharma Distributors',
      partyAddress: 'Godaulia Market, Varanasi, UP',
      amount: 50000,
      nettTotal: 50000,
      date: new Date(),
      items: [
        {
          productId: prod._id,
          name: prod.name,
          qty: 100,
          packing: 1,
          rate: 250,
          batchNo: targetBatchNo
        }
      ]
    });

    // Execute GET /api/manufacturing/batch-trace/:batchNo
    const res = await request(app).get(`/api/manufacturing/batch-trace/${targetBatchNo}`);

    expect(res.status).toBe(200);
    expect(res.body.batchNo).toBe(targetBatchNo);
    expect(res.body.productName).toBe('Ashwagandha Rasayana 500g');
    expect(res.body.actualYieldQty).toBe(490);

    // Assert Backward Trace (Raw materials + Vendor)
    expect(res.body.rawMaterialsUsed.length).toBe(1);
    expect(res.body.rawMaterialsUsed[0].rawMaterialName).toBe('PURIFIED ASHWAGANDHA ROOT');
    expect(res.body.rawMaterialsUsed[0].consumedBatchNo).toBe('RM-BATCH-2026-99');
    expect(res.body.rawMaterialsUsed[0].vendorName).toBe('Himalayan Organic Botanicals Ltd');

    // Assert Forward Trace (Customer dispatches/invoices)
    expect(res.body.dispatchedTo.length).toBe(1);
    expect(res.body.dispatchedTo[0].invoiceNo || res.body.dispatchedTo[0].documentNo).toBe('VP/26-27/777');
    expect(res.body.dispatchedTo[0].customerName).toBe('Kashi Pharma Distributors');
    expect(res.body.dispatchedTo[0].qtyDispatched).toBe(100);
  });
});
