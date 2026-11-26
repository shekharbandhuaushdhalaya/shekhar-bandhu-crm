process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-tenant-isolation-jwt-secret-123456789';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Firm = require('../models/Firm');
const Product = require('../models/Product');
const { runWithTenant, getFirmId } = require('../utils/tenantContext');

let mongoServer;

describe('tenant isolation regression', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('scopes reads and rejects cross-tenant writes', async () => {
    const [firmA, firmB] = await Firm.create([
      { name: 'Firm A', active: true },
      { name: 'Firm B', active: true }
    ]);

    const productA = await runWithTenant({ firmId: firmA._id }, () => Product.create({
      name: 'Tenant A Product',
      sku: 'TENANT-A-001',
      stockLevel: 5
    }));

    const productB = await runWithTenant({ firmId: firmB._id }, () => Product.create({
      name: 'Tenant B Product',
      sku: 'TENANT-B-001',
      stockLevel: 7
    }));

    const visibleToA = await runWithTenant({ firmId: firmA._id }, async () => {
      expect(String(getFirmId())).toBe(String(firmA._id));
      return Product.find({}).lean();
    });
    expect(visibleToA).toHaveLength(1);
    expect(String(visibleToA[0]._id)).toBe(String(productA._id));

    const crossTenantLookup = await runWithTenant({ firmId: firmA._id }, async () => await Product.findById(productB._id).lean());
    expect(crossTenantLookup).toBeNull();

    const attemptedTenantOverride = await runWithTenant(
      { firmId: firmA._id },
      async () => await Product.find({ firmId: firmB._id }).lean()
    );
    expect(attemptedTenantOverride).toHaveLength(0);

    await expect(runWithTenant({ firmId: firmA._id }, () => Product.create({
      firmId: firmB._id,
      name: 'Illegal Cross Tenant Product',
      sku: 'ILLEGAL-XTENANT-001'
    }))).rejects.toThrow('Cross-tenant write rejected');
  });

  it('rejects tenant ownership changes through update queries', async () => {
    const [firmA, firmB] = await Firm.create([
      { name: 'Update Firm A', active: true },
      { name: 'Update Firm B', active: true }
    ]);
    const product = await runWithTenant({ firmId: firmA._id }, () => Product.create({
      name: 'Immutable Tenant Product', sku: 'IMMUTABLE-TENANT-001', stockLevel: 3
    }));

    await expect(runWithTenant({ firmId: firmA._id }, async () => await Product.updateOne(
      { _id: product._id },
      { $set: { firmId: firmB._id } }
    ))).rejects.toThrow('Tenant ownership is immutable');

    await expect(runWithTenant({ firmId: firmA._id }, async () => await Product.findOneAndUpdate(
      { _id: product._id },
      { $unset: { firmId: 1 } }
    ))).rejects.toThrow('Tenant ownership is immutable');

    const persisted = await runWithTenant({ firmId: firmA._id }, async () => await Product.findById(product._id).lean());
    expect(String(persisted.firmId)).toBe(String(firmA._id));
  });

  it('scopes bulk writes and rejects bulk tenant ownership changes', async () => {
    const [firmA, firmB] = await Firm.create([
      { name: 'Bulk Firm A', active: true },
      { name: 'Bulk Firm B', active: true }
    ]);
    const product = await runWithTenant({ firmId: firmA._id }, () => Product.create({
      name: 'Bulk Tenant Product', sku: 'BULK-TENANT-001', stockLevel: 2
    }));

    await expect(runWithTenant({ firmId: firmA._id }, () => Product.bulkWrite([{
      updateOne: {
        filter: { _id: product._id },
        update: { $set: { firmId: firmB._id } }
      }
    }]))).rejects.toThrow('Tenant ownership is immutable');

    await runWithTenant({ firmId: firmA._id }, () => Product.bulkWrite([{
      updateOne: {
        filter: { _id: product._id },
        update: { $inc: { stockLevel: 4 } }
      }
    }]));

    const persisted = await runWithTenant({ firmId: firmA._id }, async () => await Product.findById(product._id).lean());
    expect(persisted.stockLevel).toBe(6);
  });
});
