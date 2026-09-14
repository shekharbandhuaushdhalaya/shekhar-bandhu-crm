const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { checkExpiriesAndReorders } = require('../utils/expiryAlertChecker');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const RawMaterial = require('../models/RawMaterial');
const Notification = require('../models/Notification');
const MrSampleBag = require('../models/MrSampleBag');
require('../models/MedicalRepresentative');
require('../models/Product');

let mongoServer;

describe('expiryAlertChecker Integration Test', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  afterEach(async () => {
    await Notification.deleteMany({});
    await RawMaterialEntry.deleteMany({});
    await RawMaterial.deleteMany({});
    await MrSampleBag.deleteMany({});
  });

  it('generates notifications for expiring raw materials, low stock, and expiring sample bags', async () => {
    // 1. Seed expiring RawMaterialEntry
    const rmDoc = await RawMaterial.create({
      name: 'Ashwagandha Extract',
      sku: 'RM-ASH-001',
      stockLevel: 100,
      minReorder: 200,
      unit: 'kg'
    });

    const now = new Date();
    const exp20Days = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);

    await RawMaterialEntry.create({
      rawMaterialId: rmDoc._id,
      batchNo: 'BATCH-RM-101',
      qty: 50,
      expiryDate: exp20Days
    });

    // 2. Seed expiring MR Sample Bag (Item #3 in checker)
    await MrSampleBag.create({
      mrId: new mongoose.Types.ObjectId(),
      productId: new mongoose.Types.ObjectId(),
      batchNo: 'SAMPLE-99',
      qty: 10,
      expiryDate: exp20Days
    });

    // Run the checker
    await checkExpiriesAndReorders();

    const notifications = await Notification.find({}).lean();
    
    // Assert notification for expiring Raw Material Entry
    const rmExpNotif = notifications.find(n => n.title.includes('Raw Material Expiry Alert'));
    expect(rmExpNotif).toBeDefined();

    // Assert notification for Low Stock Raw Material
    const rmLowNotif = notifications.find(n => /Low Stock Reorder Alert/i.test(n.title));
    expect(rmLowNotif).toBeDefined();

    // Assert notification for MR Sample Bag (item #3, which was swallowed when syntax was broken)
    const mrSampleNotif = notifications.find(n => n.title.includes('Field Sample Bag Expiry Alert'));
    expect(mrSampleNotif).toBeDefined();
  });
});
