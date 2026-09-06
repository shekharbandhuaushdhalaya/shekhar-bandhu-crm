const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../models/Product');
const RolePermission = require('../models/RolePermission');
const { clearPermissionCache } = require('../middleware/authorize');
const productRoutes = require('../routes/inventory/products');

let mongoServer;
let app;
let currentRole = 'admin';

describe('Products API Field Projection & Security Suite', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'test-user-id', role: currentRole };
      next();
    });
    app.use('/api/products', productRoutes);

    await RolePermission.seedDefaults();
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Product.deleteMany({});
    clearPermissionCache();

    await Product.create([
      { name: 'Chyawanprash Special', sku: 'CHY-001', price: 250, mrp: 300, category: 'Rasayana', stockLevel: 100 },
      { name: 'Ashwagandha Churna', sku: 'ASH-002', price: 150, mrp: 180, category: 'Single Herb', stockLevel: 50 },
    ]);
  });

  it('GET /api/products returns 200 without price for roles lacking product:viewPricing (e.g. agent)', async () => {
    currentRole = 'agent';
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);

    const firstItem = res.body[0];
    expect(firstItem.name).toBeDefined();
    expect(firstItem.sku).toBeDefined();
    expect(firstItem.price).toBeUndefined();
  });

  it('GET /api/products returns 200 WITH price for roles having product:viewPricing (e.g. manager)', async () => {
    currentRole = 'manager';
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);

    const chyawanprash = res.body.find(p => p.sku === 'CHY-001');
    expect(chyawanprash).toBeDefined();
    expect(chyawanprash.name).toBe('Chyawanprash Special');
    expect(chyawanprash.price).toBe(250);
  });

  it('GET /api/products supports pagination correctly for both roles with and without viewPricing', async () => {
    // Without viewPricing
    currentRole = 'agent';
    const resNoPrice = await request(app).get('/api/products?page=1&limit=1');
    expect(resNoPrice.status).toBe(200);
    expect(resNoPrice.body).toHaveProperty('data');
    expect(resNoPrice.body.total).toBe(2);
    expect(resNoPrice.body.page).toBe(1);
    expect(resNoPrice.body.limit).toBe(1);
    expect(resNoPrice.body.totalPages).toBe(2);
    expect(resNoPrice.body.data[0].price).toBeUndefined();

    // With viewPricing
    currentRole = 'admin';
    const resWithPrice = await request(app).get('/api/products?page=1&limit=1');
    expect(resWithPrice.status).toBe(200);
    expect(resWithPrice.body.data[0].price).toBeDefined();
    expect(typeof resWithPrice.body.data[0].price).toBe('number');
  });
});
