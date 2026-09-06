const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const BillOfMaterials = require('../models/BillOfMaterials');
const Product = require('../models/Product');
const { deductPackagingMaterials } = require('../services/batchProductionService');

let mongoServer;

describe('Item 5: Packaging Material Deduction Guard Unit Suite', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await RawMaterial.deleteMany({});
    await RawMaterialEntry.deleteMany({});
    await BillOfMaterials.deleteMany({});
    await Product.deleteMany({});
  });

  it('deducts packaging quantity proportional to actualYieldQty (ing.qtyRequired * actualYieldQty)', async () => {
    const bottleRM = await RawMaterial.create({
      name: '200 ML BOTTLE',
      sku: 'RM-BOT-200',
      unit: 'pcs',
      category: 'Packaging'
    });

    const entry = await RawMaterialEntry.create({
      rawMaterialId: bottleRM._id,
      batchNo: 'PKG-LOT-001',
      initialQty: 5000,
      qty: 5000,
      purchaseRate: 2.5,
      qcStatus: 'approved'
    });

    const product = await Product.create({
      name: 'ABHAYARISHTA 200ML',
      sku: 'PROD-ABH-200',
      price: 150
    });

    const bom = await BillOfMaterials.create({
      productId: product._id,
      batchYieldSize: 2000,
      isActive: true,
      ingredients: [
        {
          rawMaterialId: bottleRM._id,
          qtyRequired: 1, // 1 bottle per finished product unit
          unit: 'pcs',
          itemType: 'packaging'
        }
      ]
    });

    const mockBatch = {
      _id: new mongoose.Types.ObjectId(),
      batchNo: 'ABH-2026-TEST',
      productId: product._id,
      bomId: bom._id,
      packagingDeducted: false,
      rawMaterialCost: 0,
      ingredientsConsumed: []
    };

    // Trigger packaging deduction for actual yield of 2,000 bottles
    const actualYieldQty = 2000;
    await deductPackagingMaterials(mockBatch, actualYieldQty);

    expect(mockBatch.packagingDeducted).toBe(true);
    expect(mockBatch.ingredientsConsumed.length).toBe(1);
    expect(mockBatch.ingredientsConsumed[0].rawMaterialId.toString()).toBe(bottleRM._id.toString());
    expect(mockBatch.ingredientsConsumed[0].qtyConsumed).toBe(2000); // 1 * 2000 = 2000, NOT a fixed/fractional ~0.03

    const updatedEntry = await RawMaterialEntry.findById(entry._id);
    expect(updatedEntry.qty).toBe(3000); // 5000 - 2000 = 3000
  });
});
