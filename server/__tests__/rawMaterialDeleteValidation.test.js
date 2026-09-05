const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const rawMaterialRoutes = require('../routes/manufacturing/rawMaterials');
const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');

const app = express();
app.use(express.json());
app.use('/api/raw-materials', rawMaterialRoutes);

const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

describe('Raw Material Deletion Safety & Stock Validation API', () => {
  let testMaterialWithStockId;
  let testMaterialZeroStockId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Create raw material with active stock (10 kg)
    const mat1 = await RawMaterial.create({
      name: 'TEST DELETE MATERIAL WITH STOCK',
      sku: 'RM-DEL-TEST-001',
      category: 'Dry Herb',
      unit: 'kg'
    });
    testMaterialWithStockId = mat1._id.toString();

    await RawMaterialEntry.create({
      rawMaterialId: mat1._id,
      batchNo: 'BATCH-DEL-001',
      qty: 10,
      purchaseRate: 250
    });

    // Create raw material with 0 stock
    const mat2 = await RawMaterial.create({
      name: 'TEST DELETE MATERIAL ZERO STOCK',
      sku: 'RM-DEL-TEST-002',
      category: 'Dry Herb',
      unit: 'kg'
    });
    testMaterialZeroStockId = mat2._id.toString();
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  }, 30000);

  it('should REJECT deleting raw material if stock quantity > 0 (HTTP 400)', async () => {
    const res = await request(app)
      .delete(`/api/raw-materials/${testMaterialWithStockId}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Remaining stock quantity is 10 kg');
    expect(res.body.error).toContain('Stock must be 0 before deletion');

    // Verify material still exists in DB
    const mat = await RawMaterial.findById(testMaterialWithStockId);
    expect(mat).not.toBeNull();
  });

  it('should ALLOW deleting raw material if stock quantity is 0 (HTTP 200)', async () => {
    const res = await request(app)
      .delete(`/api/raw-materials/${testMaterialZeroStockId}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('deleted successfully');

    // Verify material is deleted from DB
    const mat = await RawMaterial.findById(testMaterialZeroStockId);
    expect(mat).toBeNull();
  });
});
