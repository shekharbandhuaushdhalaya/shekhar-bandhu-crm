const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { getBotanicalInfo, BOTANICAL_DICTIONARY } = require('../utils/botanicalLookup');
const RawMaterial = require('../models/RawMaterial');

let mongoServer;

describe('Botanical & Scientific Name Lookup Test Suite', () => {
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

  afterEach(async () => {
    await RawMaterial.deleteMany({});
  });

  it('correctly looks up scientific names for common Ayurvedic herbs', async () => {
    const ashwagandha = await getBotanicalInfo('Ashwagandha Extract');
    expect(ashwagandha.botanicalName).toBe('Withania somnifera');
    expect(ashwagandha.partUsed).toBe('Root');

    const tulsi = await getBotanicalInfo('Tulsi Leaves');
    expect(tulsi.botanicalName).toBe('Ocimum sanctum');
    expect(tulsi.partUsed).toBe('Leaf');

    const shatavari = await getBotanicalInfo('Shatavari Powder');
    expect(shatavari.botanicalName).toBe('Asparagus racemosus');
  });

  it('stores botanicalName in RawMaterial model documents', async () => {
    const rm = await RawMaterial.create({
      name: 'Ashwagandha',
      sku: 'RM-ASH-002',
      unit: 'kg',
      category: 'Herb',
      botanicalName: 'Withania somnifera',
      partUsed: 'Root',
      pharmacopoeialStandard: 'API'
    });

    expect(rm.botanicalName).toBe('Withania somnifera');
    expect(rm.partUsed).toBe('Root');
    expect(rm.pharmacopoeialStandard).toBe('API');
  });
});
