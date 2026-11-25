process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-production-receipt-transaction-secret-123456';

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Firm = require('../models/Firm');
const Warehouse = require('../models/Warehouse');
const Product = require('../models/Product');
const BatchProduction = require('../models/BatchProduction');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');
const Challan = require('../models/Challan');
const { runWithTenant } = require('../utils/tenantContext');
const { completeProductionReceiptAndCreateTransfer } = require('../services/challanInventoryService');

let replSet;

describe('Production receipt and transfer transaction integration', () => {
  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    await mongoose.connect(replSet.getUri());
  }, 90000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  async function seed() {
    const firm = await Firm.create({ name: 'Production Receipt Integration Firm', active: true });
    return runWithTenant({ firmId: firm._id }, async () => {
      const manufacturingUnitId = new mongoose.Types.ObjectId();
      const productionWarehouse = await Warehouse.create({ name: 'Production House', type: 'manufacturing', manufacturingUnitId });
      const destinationWarehouse = await Warehouse.create({ name: 'Finished Goods Warehouse', type: 'main' });
      const product = await Product.create({ name: 'Integration Herbal Tablets', sku: 'PROD-RCPT-INT-001', price: 40, mrp: 50 });
      const batch = await BatchProduction.create({
        batchNo: 'AY-PROD-RCPT-INT-001',
        productId: product._id,
        manufacturingUnitId,
        manufacturingUnitName: 'Integration Manufacturing Unit',
        plannedQty: 12,
        actualYieldQty: 12,
        rawMaterialCost: 120,
        overheadCost: 10,
        jobWorkCharges: 0,
        status: 'in_progress',
        stages: [{ name: 'Mixing', status: 'completed' }]
      });
      const expectedUpdatedAt = batch.updatedAt;
      batch.status = 'completed';
      const args = {
        batch,
        challanItems: [{
          productId: product._id, name: product.name, qty: 12, packing: 1,
          batchNo: 'FG-INT-BATCH-001', mfgDate: new Date('2026-11-25'),
          expiryDate: new Date('2027-11-25'), manufacturingUnitId,
          manufacturingUnitName: 'Integration Manufacturing Unit'
        }],
        productionWarehouse,
        destinationWarehouse,
        challanNo: 'CH-PROD-RCPT-INT-001',
        now: new Date('2026-11-25T12:00:00.000Z'),
        userId: new mongoose.Types.ObjectId(),
        createdBy: 'Integration Operator',
        expectedUpdatedAt
      };
      return { firm, product, batch, productionWarehouse, destinationWarehouse, args };
    });
  }

  it('posts finished-goods receipt and creates one draft transfer Challan idempotently', async () => {
    const seeded = await seed();
    await runWithTenant({ firmId: seeded.firm._id }, async () => {
      const first = await completeProductionReceiptAndCreateTransfer(seeded.args);
      expect(first.batch.status).toBe('completed');
      expect(first.batch.productionTransferChallanId.toString()).toBe(first.challan._id.toString());
      expect(first.challan.challanType).toBe('production_transfer');
      expect(first.challan.status).toBe('draft');
      expect(first.challan.inventoryPostingStatus).toBe('not_posted');

      const entry = await InventoryEntry.findOne({
        warehouseId: seeded.productionWarehouse._id,
        productId: seeded.product._id,
        batchNo: 'FG-INT-BATCH-001',
        qcStatus: 'approved'
      }).lean();
      expect(entry.qtyBoxes).toBe(12);
      expect(entry.marketReleased).toBe(false);
      expect(String(entry.productionBatchId)).toBe(String(seeded.batch._id));

      const product = await Product.findById(seeded.product._id).lean();
      expect(product.stockLevel).toBe(12);
      const ledger = await StockLedger.findOne({ movementKey: { $regex: '^BATCH_PRODUCTION_IN:' } }).lean();
      expect(ledger).toMatchObject({ type: 'IN', qtyBoxes: 12, balanceBoxes: 12 });

      const retry = await completeProductionReceiptAndCreateTransfer(seeded.args);
      expect(String(retry.challan._id)).toBe(String(first.challan._id));
      expect(await Challan.countDocuments({ challanType: 'production_transfer' })).toBe(1);
      expect(await StockLedger.countDocuments({ movementKey: { $regex: '^BATCH_PRODUCTION_IN:' } })).toBe(1);
      expect((await InventoryEntry.findById(entry._id).lean()).qtyBoxes).toBe(12);
    });
  });

  it('rolls back finished-goods stock, ledger and batch state if transfer Challan creation fails', async () => {
    const seeded = await seed();
    await runWithTenant({ firmId: seeded.firm._id }, async () => {
      const originalCreate = Challan.create;
      const injected = jest.spyOn(Challan, 'create').mockRejectedValueOnce(new Error('Injected transfer Challan write failure'));
      try {
        await expect(completeProductionReceiptAndCreateTransfer(seeded.args))
          .rejects.toThrow('Injected transfer Challan write failure');
      } finally {
        injected.mockRestore();
        Challan.create = originalCreate;
      }

      const persistedBatch = await BatchProduction.findById(seeded.batch._id).lean();
      const persistedProduct = await Product.findById(seeded.product._id).lean();
      expect(persistedBatch.status).toBe('in_progress');
      expect(persistedBatch.productionTransferChallanId).toBeFalsy();
      expect(persistedProduct.stockLevel).toBe(0);
      expect(await InventoryEntry.countDocuments({ productionBatchId: seeded.batch._id })).toBe(0);
      expect(await StockLedger.countDocuments({ movementKey: { $regex: '^BATCH_PRODUCTION_IN:' } })).toBe(0);
      expect(await Challan.countDocuments({ challanType: 'production_transfer' })).toBe(0);
    });
  });
});
