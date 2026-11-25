process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-material-dispensing-persistence-secret-123456';

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

jest.mock('../middleware/authorize', () => ({
  authorize: () => (req, res, next) => next()
}));

const Firm = require('../models/Firm');
const Warehouse = require('../models/Warehouse');
const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const RawMaterialLedger = require('../models/RawMaterialLedger');
const BatchProduction = require('../models/BatchProduction');
const MaterialDispensing = require('../models/MaterialDispensing');
const { runWithTenant } = require('../utils/tenantContext');
const router = require('../routes/manufacturing/materialDispensing');

let replSet;

describe('Material dispensing persistence and genealogy integration', () => {
  let app;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    await mongoose.connect(replSet.getUri());
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = {
        id: req.headers['x-user-id'],
        name: req.headers['x-user-name']
      };
      next();
    });
    app.use('/api/batch-productions', router);
  }, 90000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('reserves, dispenses, independently verifies and persists wastage through the full stock-to-BMR trail', async () => {
    const firm = await Firm.create({ name: 'Material Dispensing Integration Firm', active: true });
    await runWithTenant({ firmId: firm._id }, async () => {
      const warehouse = await Warehouse.create({ name: 'Dispensing Integration Store' });
      const material = await RawMaterial.create({ name: 'Integration Ashwagandha', sku: 'DSP-INT-ASH-001', unit: 'kg' });
      const entry = await RawMaterialEntry.create({
        rawMaterialId: material._id,
        batchNo: 'ASH-INT-LOT-01',
        qty: 100,
        reservedQty: 10,
        purchaseRate: 2,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        qcStatus: 'approved'
      });
      const batch = await BatchProduction.create({
        batchNo: 'AY-DISPENSE-INT-001',
        productId: new mongoose.Types.ObjectId(),
        manufacturingUnitId: new mongoose.Types.ObjectId(),
        plannedQty: 10,
        status: 'in_progress',
        stages: [{
          name: 'Mixing',
          status: 'in_progress',
          inputQty: 0,
          lossQty: 0,
          lossPercent: 0,
          lossItems: []
        }],
        ingredientsReserved: [{
          rawMaterialId: material._id,
          rawMaterialEntryId: entry._id,
          qtyReserved: 10,
          batchNo: entry.batchNo,
          stageName: 'Mixing'
        }],
        ingredientsConsumed: [],
        rawMaterialCost: 0
      });
      const operatorId = new mongoose.Types.ObjectId().toString();
      const reviewerId = new mongoose.Types.ObjectId().toString();

      const created = await request(app)
        .post('/api/batch-productions/' + batch._id + '/dispensings')
        .set('x-user-id', operatorId)
        .set('x-user-name', 'Dispensing Operator')
        .send({
          stageIndex: 0,
          items: [{
            rawMaterialId: String(material._id),
            rawMaterialEntryId: String(entry._id),
            qtyDispensed: 4,
            qtyWasted: 1,
            wastageReason: 'Documented spillage during weighing'
          }]
        });

      if (created.status !== 201) {
        throw new Error('Material dispensing creation failed: ' + JSON.stringify(created.body));
      }
      expect(created.status).toBe(201);
      expect(created.body.status).toBe('pending_verification');
      const dispensingId = created.body._id;
      const dispensingNo = created.body.dispensingNo;

      const verified = await request(app)
        .patch('/api/batch-productions/' + batch._id + '/dispensings/' + dispensingId + '/verify')
        .set('x-user-id', reviewerId)
        .set('x-user-name', 'Independent Reviewer')
        .send({ notes: 'Weighed quantity and wastage independently checked' });

      expect(verified.status).toBe(200);
      expect(verified.body.status).toBe('verified');

      const persistedEntry = await RawMaterialEntry.findById(entry._id).lean();
      const persistedBatch = await BatchProduction.findById(batch._id).lean();
      const persistedDispensing = await MaterialDispensing.findById(dispensingId).lean();
      const ledger = await RawMaterialLedger.findOne({ reference: dispensingNo }).lean();

      expect(persistedEntry.qty).toBe(96);
      expect(persistedEntry.reservedQty).toBe(6);
      expect(persistedEntry.issuedQty).toBe(4);
      expect(persistedBatch.ingredientsReserved[0].qtyReserved).toBe(6);
      expect(persistedBatch.ingredientsConsumed).toHaveLength(1);
      expect(persistedBatch.ingredientsConsumed[0].qtyConsumed).toBe(4);
      expect(persistedBatch.ingredientsConsumed[0].qtyWasted).toBe(1);
      expect(persistedBatch.ingredientsConsumed[0].wastageReason).toBe('Documented spillage during weighing');
      expect(persistedBatch.ingredientsConsumed[0].dispensingNo).toBe(dispensingNo);
      expect(persistedBatch.stages[0].inputQty).toBe(4);
      expect(persistedBatch.stages[0].lossQty).toBe(1);
      expect(persistedBatch.stages[0].lossPercent).toBe(25);
      expect(persistedBatch.rawMaterialCost).toBe(8);
      expect(persistedDispensing.items[0].qtyWasted).toBe(1);
      expect(persistedDispensing.items[0].wastageReason).toBe('Documented spillage during weighing');
      expect(persistedDispensing.dispensedBy.toString()).toBe(operatorId);
      expect(persistedDispensing.verifiedBy.toString()).toBe(reviewerId);
      expect(ledger.type).toBe('OUT');
      expect(ledger.qty).toBe(4);
      expect(ledger.balance).toBe(96);
    });
  });
});
