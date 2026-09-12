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
const { postChallanInventory } = require('../services/challanInventoryService');
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
});
