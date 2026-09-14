process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-tenant-isolation-jwt-secret-123456789';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Firm = require('../models/Firm');
const Product = require('../models/Product');
const { runWithTenant } = require('../utils/tenantContext');

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

    const visibleToA = await runWithTenant({ firmId: firmA._id }, () => Product.find({}).lean());
    expect(visibleToA).toHaveLength(1);
    expect(String(visibleToA[0]._id)).toBe(String(productA._id));

    const crossTenantLookup = await runWithTenant({ firmId: firmA._id }, () => Product.findById(productB._id).lean());
    expect(crossTenantLookup).toBeNull();

    await expect(runWithTenant({ firmId: firmA._id }, () => Product.create({
      firmId: firmB._id,
      name: 'Illegal Cross Tenant Product',
      sku: 'ILLEGAL-XTENANT-001'
    }))).rejects.toThrow('Cross-tenant write rejected');
  });
});
