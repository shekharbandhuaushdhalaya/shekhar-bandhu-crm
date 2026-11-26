process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-challan-concurrency-secret-1234567890';

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Firm = require('../models/Firm');
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const InventoryEntry = require('../models/InventoryEntry');
const Challan = require('../models/Challan');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const StockLedger = require('../models/StockLedger');
const BatchProduction = require('../models/BatchProduction');
const MaterialDispensing = require('../models/MaterialDispensing');
const { postChallanInventory, completeProductionReceiptAndCreateTransfer } = require('../services/challanInventoryService');
const { runWithTenant } = require('../utils/tenantContext');

let replSet;

describe('Challan concurrent posting', () => {
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

  it('moves stock exactly once when the same Challan is posted concurrently', async () => {
    const firm = await Firm.create({ name: 'Concurrency Firm', active: true });

    await runWithTenant({ firmId: firm._id }, async () => {
      const product = await Product.create({
        name: 'Concurrency Product',
        sku: 'CONCUR-001',
        stockLevel: 10
      });
      const warehouse = await Warehouse.create({ name: 'Main Warehouse', isDefault: true });
      await InventoryEntry.create({
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        productId: product._id,
        qtyBoxes: 10,
        packing: 1,
        batchNo: 'B-001',
        qcStatus: 'approved'
      });
      const customer = await Customer.create({ name: 'Concurrency Customer' });
      const order = await Order.create({
        orderNo: 'SO-CONC-001',
        customerId: customer._id,
        name: customer.name,
        email: 'concurrency@example.test',
        phone: '-',
        shippingAddress: '-',
        items: [{ productId: product._id, name: product.name, qty: 4, price: 10, freeQty: 0, backorderedQty: 4 }],
        totalAmount: 40,
        status: 'processing',
      });
      const challan = await Challan.create({
        challanNo: 'CH-CONC-001',
        challanType: 'sale',
        salesOrderId: order._id,
        customerId: customer._id,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        items: [{ productId: product._id, name: product.name, qty: 4, packing: 1, batchNo: 'B-001' }],
        status: 'draft',
        inventoryPostingStatus: 'not_posted'
      });

      const results = await Promise.all([
        postChallanInventory(challan, { createdBy: 'Concurrency Test' }),
        postChallanInventory(challan, { createdBy: 'Concurrency Test' })
      ]);

      expect(results.every(result => result.status === 'finalized')).toBe(true);

      const inventory = await InventoryEntry.findOne({ warehouseId: warehouse._id, productId: product._id, batchNo: 'B-001' }).lean();
      const refreshedProduct = await Product.findById(product._id).lean();
      const refreshedChallan = await Challan.findById(challan._id).lean();
      const ledgers = await StockLedger.find({ reference: 'CH-CONC-001' }).lean();

      expect(inventory.qtyBoxes).toBe(6);
      expect(refreshedProduct.stockLevel).toBe(6);
      expect(refreshedChallan.inventoryPostingStatus).toBe('posted');
      expect(ledgers).toHaveLength(1);
      expect(ledgers[0].qtyBoxes).toBe(-4);
    });
  });

  it('blocks production-house stock transfer until the source batch has independent market release', async () => {
    const firm = await Firm.create({ name: 'Production Release Gate Firm', active: true });
    await runWithTenant({ firmId: firm._id }, async () => {
      const product = await Product.create({ name: 'Held Finished Good', sku: 'FG-HOLD-001', stockLevel: 5 });
      const source = await Warehouse.create({ name: 'Production House', type: 'manufacturing' });
      const destination = await Warehouse.create({ name: 'Finished Goods Warehouse' });
      const manufacturingUnitId = new mongoose.Types.ObjectId();
      const batch = await BatchProduction.create({
        batchNo: 'AY-BATCH-HOLD-001', productId: product._id, manufacturingUnitId,
        plannedQty: 5, actualYieldQty: 5, status: 'completed', qcStatus: 'pending_qa_review'
      });
      await InventoryEntry.create({
        warehouseId: source._id, warehouseName: source.name, productId: product._id,
        qtyBoxes: 5, packing: 1, batchNo: batch.batchNo, vendorName: 'In-House Production',
        manufacturingUnitId, productionBatchId: batch._id, marketReleased: false, qcStatus: 'approved'
      });
      const challan = await Challan.create({
        challanNo: 'CH-FG-HOLD-001', challanType: 'production_transfer', productionBatchId: batch._id,
        warehouseId: source._id, warehouseName: source.name,
        destinationWarehouseId: destination._id, destinationWarehouseName: destination.name,
        items: [{ productId: product._id, name: product.name, qty: 2, packing: 1, batchNo: batch.batchNo }],
        status: 'draft'
      });

      await expect(postChallanInventory(challan, { createdBy: 'Release Gate Test' }))
        .rejects.toMatchObject({ code: 'PRODUCTION_BATCH_NOT_RELEASED' });
      expect((await InventoryEntry.findOne({ warehouseId: source._id, productId: product._id })).qtyBoxes).toBe(5);
      expect(await InventoryEntry.countDocuments({ warehouseId: destination._id })).toBe(0);
      expect(await StockLedger.countDocuments({ reference: challan.challanNo })).toBe(0);
    });
  });

  it('blocks generic transfers of finished goods held from market release', async () => {
    const firm = await Firm.create({ name: 'Generic Transfer Release Gate Firm', active: true });
    await runWithTenant({ firmId: firm._id }, async () => {
      const product = await Product.create({ name: 'Quarantined Finished Good', sku: 'FG-GENERIC-HOLD-001', stockLevel: 4 });
      const source = await Warehouse.create({ name: 'Generic Transfer Source' });
      const destination = await Warehouse.create({ name: 'Generic Transfer Destination' });
      const batch = await BatchProduction.create({
        batchNo: 'AY-GENERIC-HOLD-001', productId: product._id,
        manufacturingUnitId: new mongoose.Types.ObjectId(), plannedQty: 4,
        actualYieldQty: 4, status: 'completed', qcStatus: 'pending_qa_review'
      });
      await InventoryEntry.create({
        warehouseId: source._id, warehouseName: source.name, productId: product._id,
        qtyBoxes: 4, packing: 1, batchNo: batch.batchNo,
        productionBatchId: batch._id, marketReleased: false, qcStatus: 'approved'
      });
      const challan = await Challan.create({
        challanNo: 'CH-GENERIC-HOLD-001', challanType: 'transfer',
        warehouseId: source._id, warehouseName: source.name,
        destinationWarehouseId: destination._id, destinationWarehouseName: destination.name,
        items: [{ productId: product._id, name: product.name, qty: 2, packing: 1, batchNo: batch.batchNo }],
        status: 'draft'
      });

      await expect(postChallanInventory(challan, { createdBy: 'Generic Transfer Gate Test' }))
        .rejects.toMatchObject({ code: 'FINISHED_GOODS_NOT_MARKET_RELEASED' });
      expect((await InventoryEntry.findOne({ warehouseId: source._id, productId: product._id })).qtyBoxes).toBe(4);
      expect(await InventoryEntry.countDocuments({ warehouseId: destination._id })).toBe(0);
      expect(await StockLedger.countDocuments({ reference: challan.challanNo })).toBe(0);
    });
  });

  it('preserves the batch release state when released production stock is transferred', async () => {
    const firm = await Firm.create({ name: 'Production Release Posting Firm', active: true });
    await runWithTenant({ firmId: firm._id }, async () => {
      const product = await Product.create({ name: 'Released Finished Good', sku: 'FG-REL-001', stockLevel: 5 });
      const source = await Warehouse.create({ name: 'Released Production House', type: 'manufacturing' });
      const destination = await Warehouse.create({ name: 'Released Finished Goods Warehouse' });
      const manufacturingUnitId = new mongoose.Types.ObjectId();
      const releasedBy = new mongoose.Types.ObjectId();
      const batch = await BatchProduction.create({
        batchNo: 'AY-BATCH-REL-001', productId: product._id, manufacturingUnitId,
        plannedQty: 5, actualYieldQty: 5, status: 'completed', qcStatus: 'approved',
        releasedBy, releasedByName: 'Independent QA', releasedAt: new Date()
      });
      const sourceEntry = await InventoryEntry.create({
        warehouseId: source._id, warehouseName: source.name, productId: product._id,
        qtyBoxes: 5, packing: 1, batchNo: batch.batchNo, vendorName: 'In-House Production',
        manufacturingUnitId, productionBatchId: batch._id, marketReleased: true,
        marketReleasedAt: batch.releasedAt, marketReleasedBy: releasedBy, qcStatus: 'approved'
      });
      const challan = await Challan.create({
        challanNo: 'CH-FG-REL-001', challanType: 'production_transfer', productionBatchId: batch._id,
        warehouseId: source._id, warehouseName: source.name,
        destinationWarehouseId: destination._id, destinationWarehouseName: destination.name,
        items: [{ productId: product._id, name: product.name, qty: 2, packing: 1, batchNo: batch.batchNo, inventoryEntryId: sourceEntry._id }],
        status: 'draft'
      });

      const posted = await postChallanInventory(challan, { createdBy: 'Release Gate Test' });
      expect(posted.inventoryPostingStatus).toBe('posted');
      const destinationEntry = await InventoryEntry.findOne({ warehouseId: destination._id, productId: product._id }).lean();
      expect(destinationEntry.qtyBoxes).toBe(2);
      expect(String(destinationEntry.productionBatchId)).toBe(String(batch._id));
      expect(destinationEntry.marketReleased).toBe(true);
      expect(await StockLedger.countDocuments({ reference: challan.challanNo })).toBe(2);
    });
  });

  it('refuses to post a standalone Sale Challan without a Sales Order', async () => {
    const firm = await Firm.create({ name: 'Order Invariant Firm', active: true });

    await runWithTenant({ firmId: firm._id }, async () => {
      const product = await Product.create({ name: 'Invariant Product', sku: 'ORDER-REQ-001', stockLevel: 5 });
      const warehouse = await Warehouse.create({ name: 'Invariant Warehouse', isDefault: true });
      await InventoryEntry.create({
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        productId: product._id,
        qtyBoxes: 5,
        packing: 1,
        batchNo: 'B-ORDER-REQ',
        qcStatus: 'approved',
      });
      const challan = await Challan.create({
        challanNo: 'CH-ORDER-REQ-001',
        challanType: 'sale',
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        items: [{ productId: product._id, name: product.name, qty: 1, packing: 1, batchNo: 'B-ORDER-REQ' }],
        status: 'draft',
      });

      await expect(postChallanInventory(challan, { createdBy: 'Invariant Test' }))
        .rejects.toMatchObject({ code: 'SALES_ORDER_REQUIRED' });

      const inventory = await InventoryEntry.findOne({ warehouseId: warehouse._id, productId: product._id }).lean();
      expect(inventory.qtyBoxes).toBe(5);
      expect(await StockLedger.countDocuments({ reference: challan.challanNo })).toBe(0);
    });
  });
 
  it('rolls back finished-goods receipt, stock ledger and batch when transfer Challan creation fails', async () => {
    const firm = await Firm.create({ name: 'Atomic Production Receipt Failure Firm', active: true });
    await runWithTenant({ firmId: firm._id }, async () => {
      const product = await Product.create({ name: 'Atomic Receipt Failure Product', sku: 'ATOMIC-FAIL-001', stockLevel: 0 });
      const manufacturingUnitId = new mongoose.Types.ObjectId();
      const productionWarehouse = await Warehouse.create({
        name: 'Atomic Failure Production House', type: 'manufacturing', manufacturingUnitId
      });
      const destinationWarehouse = await Warehouse.create({ name: 'Atomic Failure Finished Goods' });
      const batch = await BatchProduction.create({
        batchNo: 'AY-ATOMIC-FAIL-001',
        productId: product._id,
        manufacturingUnitId,
        plannedQty: 5,
        status: 'in_progress',
        rawMaterialCost: 50,
        overheadCost: 0
      });
      batch.status = 'completed';
      batch.actualYieldQty = 5;
      batch.jobWorkCharges = 0;

      const challanCreate = jest.spyOn(Challan, 'create')
        .mockRejectedValueOnce(new Error('Injected production-transfer Challan write failure'));
      try {
        await expect(completeProductionReceiptAndCreateTransfer({
          batch,
          challanItems: [{
            productId: product._id,
            name: product.name,
            qty: 5,
            packing: 1,
            batchNo: batch.batchNo,
            manufacturingUnitId,
            manufacturingUnitName: 'Atomic Failure Unit'
          }],
          productionWarehouse,
          destinationWarehouse,
          challanNo: 'CH-ATOMIC-FAIL-001',
          now: new Date(),
          userId: new mongoose.Types.ObjectId(),
          createdBy: 'Atomic Failure Test'
        })).rejects.toThrow('Injected production-transfer Challan write failure');
      } finally {
        challanCreate.mockRestore();
      }

      const persistedBatch = await BatchProduction.findById(batch._id).lean();
      const persistedProduct = await Product.findById(product._id).lean();
      expect(await InventoryEntry.countDocuments({ productionBatchId: batch._id })).toBe(0);
      expect(await StockLedger.countDocuments({ reference: batch.batchNo })).toBe(0);
      expect(await Challan.countDocuments({ challanNo: 'CH-ATOMIC-FAIL-001' })).toBe(0);
      expect(persistedProduct.stockLevel).toBe(0);
      expect(persistedBatch.status).toBe('in_progress');
      expect(persistedBatch.productionTransferChallanId).toBeFalsy();
    });
  });

  it('creates production receipt and transfer Challan exactly once across service retries', async () => {
    const firm = await Firm.create({ name: 'Atomic Production Receipt Retry Firm', active: true });
    await runWithTenant({ firmId: firm._id }, async () => {
      const product = await Product.create({ name: 'Atomic Receipt Retry Product', sku: 'ATOMIC-RETRY-001', stockLevel: 0 });
      const manufacturingUnitId = new mongoose.Types.ObjectId();
      const productionWarehouse = await Warehouse.create({
        name: 'Atomic Retry Production House', type: 'manufacturing', manufacturingUnitId
      });
      const destinationWarehouse = await Warehouse.create({ name: 'Atomic Retry Finished Goods' });
      const batch = await BatchProduction.create({
        batchNo: 'AY-ATOMIC-RETRY-001',
        productId: product._id,
        manufacturingUnitId,
        plannedQty: 5,
        status: 'in_progress',
        rawMaterialCost: 50,
        overheadCost: 0
      });
      batch.status = 'completed';
      batch.actualYieldQty = 5;
      batch.jobWorkCharges = 0;
      const args = {
        batch,
        challanItems: [{
          productId: product._id,
          name: product.name,
          qty: 5,
          packing: 1,
          batchNo: batch.batchNo,
          manufacturingUnitId,
          manufacturingUnitName: 'Atomic Retry Unit'
        }],
        productionWarehouse,
        destinationWarehouse,
        challanNo: 'CH-ATOMIC-RETRY-001',
        now: new Date(),
        userId: new mongoose.Types.ObjectId(),
        createdBy: 'Atomic Retry Test'
      };

      const first = await completeProductionReceiptAndCreateTransfer(args);
      const retry = await completeProductionReceiptAndCreateTransfer(args);

      expect(String(retry.batch._id)).toBe(String(first.batch._id));
      expect(String(retry.challan._id)).toBe(String(first.challan._id));
      expect(await InventoryEntry.countDocuments({ productionBatchId: batch._id })).toBe(1);
      expect(await StockLedger.countDocuments({ reference: batch.batchNo })).toBe(1);
      expect(await Challan.countDocuments({ challanNo: 'CH-ATOMIC-RETRY-001' })).toBe(1);
      expect((await Product.findById(product._id).lean()).stockLevel).toBe(5);
      const persistedBatch = await BatchProduction.findById(batch._id).lean();
      expect(persistedBatch.status).toBe('completed');
      expect(String(persistedBatch.productionTransferChallanId)).toBe(String(first.challan._id));
    });
  });
 
  it('rejects a stale completion snapshot without creating finished stock or a transfer Challan', async () => {
    const firm = await Firm.create({ name: 'Stale Production Completion Firm', active: true });
    await runWithTenant({ firmId: firm._id }, async () => {
      const product = await Product.create({ name: 'Stale Completion Product', sku: 'STALE-COMP-001', stockLevel: 0 });
      const manufacturingUnitId = new mongoose.Types.ObjectId();
      const productionWarehouse = await Warehouse.create({
        name: 'Stale Completion Production House', type: 'manufacturing', manufacturingUnitId
      });
      const destinationWarehouse = await Warehouse.create({ name: 'Stale Completion Finished Goods' });
      const batch = await BatchProduction.create({
        batchNo: 'AY-STALE-COMP-001',
        productId: product._id,
        manufacturingUnitId,
        plannedQty: 5,
        status: 'in_progress',
        rawMaterialCost: 50,
        overheadCost: 0
      });
      const expectedUpdatedAt = batch.updatedAt;
      await BatchProduction.updateOne(
        { _id: batch._id },
        { $set: { plannedQty: 6, updatedAt: new Date(expectedUpdatedAt.getTime() + 1000) } },
        { timestamps: false }
      );

      const args = {
        batch,
        expectedUpdatedAt,
        challanItems: [{
          productId: product._id,
          name: product.name,
          qty: 5,
          packing: 1,
          batchNo: batch.batchNo,
          manufacturingUnitId,
          manufacturingUnitName: 'Stale Completion Unit'
        }],
        productionWarehouse,
        destinationWarehouse,
        challanNo: 'CH-STALE-COMP-001',
        now: new Date(),
        userId: new mongoose.Types.ObjectId(),
        createdBy: 'Stale Completion Test'
      };

      await expect(completeProductionReceiptAndCreateTransfer(args)).rejects.toMatchObject({
        code: 'BATCH_CHANGED_DURING_COMPLETION',
        statusCode: 409
      });
      expect(await InventoryEntry.countDocuments({ productionBatchId: batch._id })).toBe(0);
      expect(await StockLedger.countDocuments({ reference: batch.batchNo })).toBe(0);
      expect(await Challan.countDocuments({ challanNo: 'CH-STALE-COMP-001' })).toBe(0);
      const persistedBatch = await BatchProduction.findById(batch._id).lean();
      expect(persistedBatch.status).toBe('in_progress');
      expect(persistedBatch.plannedQty).toBe(6);
      expect((await Product.findById(product._id).lean()).stockLevel).toBe(0);
    });
  });

  it('persists measured dispensing wastage and its reason in the GMP record', async () => {
    const firm = await Firm.create({ name: 'Dispensing Wastage Persistence Firm', active: true });
    await runWithTenant({ firmId: firm._id }, async () => {
      const product = await Product.create({ name: 'Dispensing Trace Product', sku: 'DSP-TRACE-001', stockLevel: 0 });
      const batch = await BatchProduction.create({
        batchNo: 'AY-DSP-TRACE-001',
        productId: product._id,
        manufacturingUnitId: new mongoose.Types.ObjectId(),
        plannedQty: 10,
        status: 'in_progress'
      });
      const record = await MaterialDispensing.create({
        dispensingNo: 'DSP-TRACE-000001',
        batchId: batch._id,
        batchNo: batch.batchNo,
        stageIndex: 0,
        stageName: 'Mixing',
        items: [{
          rawMaterialId: new mongoose.Types.ObjectId(),
          rawMaterialEntryId: new mongoose.Types.ObjectId(),
          lotNo: 'HERB-LOT-TRACE-01',
          qtyDispensed: 4,
          qtyWasted: 1,
          wastageReason: 'Documented spillage during weighing',
          unit: 'kg'
        }],
        status: 'verified',
        dispensedBy: new mongoose.Types.ObjectId(),
        dispensedByName: 'Dispensing Operator',
        dispensedAt: new Date(),
        verifiedBy: new mongoose.Types.ObjectId(),
        verifiedByName: 'Independent Reviewer',
        verifiedAt: new Date()
      });

      const persisted = await MaterialDispensing.findById(record._id).lean();
      expect(persisted.items[0].qtyDispensed).toBe(4);
      expect(persisted.items[0].qtyWasted).toBe(1);
      expect(persisted.items[0].wastageReason).toBe('Documented spillage during weighing');
    });
  });

  it('rejects a dispensing record with unexplained wastage at model validation', async () => {
    const record = new MaterialDispensing({
      dispensingNo: 'DSP-TRACE-INVALID',
      batchId: new mongoose.Types.ObjectId(),
      batchNo: 'AY-DSP-TRACE-INVALID',
      stageIndex: 0,
      stageName: 'Mixing',
      items: [{
        rawMaterialId: new mongoose.Types.ObjectId(),
        rawMaterialEntryId: new mongoose.Types.ObjectId(),
        lotNo: 'HERB-LOT-INVALID',
        qtyDispensed: 4,
        qtyWasted: 1,
        unit: 'kg'
      }],
      dispensedBy: new mongoose.Types.ObjectId(),
      dispensedByName: 'Dispensing Operator',
      dispensedAt: new Date()
    });
    await expect(record.validate()).rejects.toThrow('A documented reason is required for recorded dispensing wastage');
  });
});
