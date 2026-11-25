const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Firm = require('../models/Firm');
const ManufacturingUnit = require('../models/ManufacturingUnit');
const Warehouse = require('../models/Warehouse');
const { runWithTenant } = require('../utils/tenantContext');
const { createManufacturingUnitWithWarehouse } = require('../services/manufacturingUnitSetupService');

let replSet;

describe('Manufacturing unit and production-house setup transaction', () => {
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

  async function withTenant(callback) {
    const firm = await Firm.create({ name: 'Manufacturing Setup Integration Firm', active: true });
    return runWithTenant({ firmId: firm._id }, () => callback(firm));
  }

  const unitData = {
    name: 'Integration Herbal Manufacturing Unit',
    code: 'MFG-INT-SETUP',
    addressLine1: 'Industrial Estate',
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    pincode: '221001',
    contactPerson: 'Operations',
    phone: '9000000000'
  };

  it('creates the manufacturing unit and its mapped production-house warehouse together', async () => {
    await withTenant(async () => {
      const { unit, warehouse } = await createManufacturingUnitWithWarehouse(unitData);

      expect(unit.name).toBe(unitData.name);
      expect(warehouse).toMatchObject({
        name: 'Integration Herbal Manufacturing Unit Production House',
        type: 'manufacturing',
        manufacturingUnitId: unit._id,
        city: unitData.city,
        state: unitData.state
      });
      expect(await ManufacturingUnit.countDocuments({ _id: unit._id })).toBe(1);
      expect(await Warehouse.countDocuments({ manufacturingUnitId: unit._id, type: 'manufacturing' })).toBe(1);
    });
  });

  it('rolls back the manufacturing unit when production-house warehouse creation fails', async () => {
    await withTenant(async () => {
      const injected = jest.spyOn(Warehouse, 'create')
        .mockRejectedValueOnce(new Error('Injected production-house warehouse creation failure'));

      try {
        await expect(createManufacturingUnitWithWarehouse(unitData))
          .rejects.toThrow('Injected production-house warehouse creation failure');
      } finally {
        injected.mockRestore();
      }

      expect(await ManufacturingUnit.countDocuments({ code: unitData.code })).toBe(0);
      expect(await Warehouse.countDocuments({ manufacturingUnitId: { $exists: true, $ne: null } })).toBe(0);
    });
  });
});
