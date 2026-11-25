process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-role-permission-tenant-secret-123456';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Firm = require('../models/Firm');
const RolePermission = require('../models/RolePermission');
const { runWithTenant } = require('../utils/tenantContext');
const { clearPermissionCache, getRolePermissions } = require('../middleware/authorize');

let mongoServer;

describe('role permission tenant isolation', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    clearPermissionCache();
    await mongoose.connection.dropDatabase();
  });

  it('loads permissions from the explicitly requested firm outside request context', async () => {
    const [firmA, firmB] = await Firm.create([
      { name: 'Permission Firm A', active: true },
      { name: 'Permission Firm B', active: true }
    ]);

    await runWithTenant({ firmId: firmA._id }, () => RolePermission.create({
      role: 'quality_reviewer',
      permissions: ['quality:view', 'quality:approve'],
      isCustom: true
    }));
    await runWithTenant({ firmId: firmB._id }, () => RolePermission.create({
      role: 'quality_reviewer',
      permissions: ['quality:view'],
      isCustom: true
    }));

    const permissionsA = await getRolePermissions('quality_reviewer', firmA._id);
    const permissionsB = await getRolePermissions('quality_reviewer', firmB._id);

    expect(permissionsA).toEqual(['quality:view', 'quality:approve']);
    expect(permissionsB).toEqual(['quality:view']);
  });
});
