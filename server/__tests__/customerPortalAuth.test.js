const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const Firm = require('../models/Firm');
const Product = require('../models/Product');
const publicProductRoutes = require('../routes/public/products');
const { publicTenant } = require('../middleware/publicTenant');
const portalAuthRoutes = require('../routes/public/portalAuth');
const portalRoutes = require('../routes/portal/portal');

let mongoServer;
let app;

describe('Task 4 — B2B Customer Self-Service Portal Auth & Scoped Routes Suite', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use('/api/portal/auth', portalAuthRoutes);
    app.use('/api/portal', portalRoutes);
    app.use('/api/public/products', publicTenant, publicProductRoutes);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Customer.deleteMany({});
    await Firm.deleteMany({});
    global.portalTestFirm = await Firm.create({ name: 'Portal Test Firm' });
    await Invoice.deleteMany({});
  });

  it('prevents login when portalEnabled is false or password is invalid', async () => {
    const passwordHash = await bcrypt.hash('Secret123!', 10);
    await Customer.create({
      name: 'Disabled Customer',
      email: 'disabled@customer.com',
      passwordHash,
      portalEnabled: false,
      firmId: global.portalTestFirm._id
    });

    const res = await request(app)
      .post('/api/portal/auth/login')
      .send({ email: 'disabled@customer.com', password: 'Secret123!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid email or password');
  });

  it('allows valid enabled customer to log in and receive scoped JWT', async () => {
    const passwordHash = await bcrypt.hash('CustomerPass123!', 10);
    const customer = await Customer.create({
      name: 'Varanasi Ayurveda Stores',
      email: 'store@varanasiayurveda.com',
      passwordHash,
      portalEnabled: true,
      firmId: global.portalTestFirm._id
    });

    const res = await request(app)
      .post('/api/portal/auth/login')
      .send({ email: 'store@varanasiayurveda.com', password: 'CustomerPass123!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.customer.name).toBe('Varanasi Ayurveda Stores');
  });

  it('enforces customer-scoped invoice retrieval and returns 403 when requesting another customer invoice', async () => {
    const passwordHash = await bcrypt.hash('Pass123!', 10);

    // Customer A (Logged in)
    const custA = await Customer.create({
      name: 'Customer A Pharmacy',
      email: 'customerA@test.com',
      passwordHash,
      portalEnabled: true,
      firmId: global.portalTestFirm._id
    });

    // Customer B (Other customer)
    const custB = await Customer.create({
      name: 'Customer B Medicals',
      email: 'customerB@test.com',
      passwordHash,
      portalEnabled: true
    });

    // Invoices for A & B
    const invA = await Invoice.create({
      invoiceNo: 'VP/26-27/001',
      type: 'sale',
      isFinalized: true,
      customerId: custA._id,
      customerName: custA.name,
      firmId: global.portalTestFirm._id,
      amount: 12000,
      nettTotal: 12000,
      date: new Date()
    });

    const invB = await Invoice.create({
      invoiceNo: 'VP/26-27/002',
      type: 'sale',
      isFinalized: true,
      customerId: custB._id,
      customerName: custB.name,
      firmId: global.portalTestFirm._id,
      amount: 45000,
      nettTotal: 45000,
      date: new Date()
    });

    // Login as Customer A
    const loginRes = await request(app)
      .post('/api/portal/auth/login')
      .send({ email: 'customerA@test.com', password: 'Pass123!' });

    const tokenA = loginRes.body.token;

    // 1. Fetch Customer A invoices (should return invA ONLY, not invB)
    const invoicesRes = await request(app)
      .get('/api/portal/invoices')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(invoicesRes.status).toBe(200);
    expect(invoicesRes.body.length).toBe(1);
    expect(invoicesRes.body[0].invoiceNo).toBe('VP/26-27/001');

    // 2. Fetch Customer A invoice PDF (allowed)
    const pdfResA = await request(app)
      .get(`/api/portal/invoices/${invA._id}/pdf`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(pdfResA.status).toBe(200);
    expect(pdfResA.body.invoiceNo).toBe('VP/26-27/001');

    // 3. Attempt to fetch Customer B invoice PDF using Token A (forbidden 403)
    const pdfResB = await request(app)
      .get(`/api/portal/invoices/${invB._id}/pdf`)
      .set('Authorization', `Bearer ${tokenA}`);

    // Customer-scoped lookups deliberately return 404 to avoid disclosing another customer's invoice.
    expect(pdfResB.status).toBe(404);
    expect(pdfResB.body.error).toContain('Invoice not found');
  });

  it('does not expose internal errors from public product endpoints', async () => {
    const listFailure = jest.spyOn(Product, 'find').mockReturnValueOnce({
      select: () => ({ sort: () => ({ lean: () => Promise.reject(new Error('private database connection string')) }) }),
    });
    const listRes = await request(app).get('/api/public/products');
    expect(listRes.status).toBe(500);
    expect(listRes.body.error).toBe('Unable to retrieve public products');
    listFailure.mockRestore();

    const detailFailure = jest.spyOn(Product, 'findById').mockReturnValueOnce({
      select: () => ({ lean: () => Promise.reject(new Error('internal query details')) }),
    });
    const detailRes = await request(app).get('/api/public/products/507f1f77bcf86cd799439011');
    expect(detailRes.status).toBe(500);
    expect(detailRes.body.error).toBe('Unable to retrieve public products');
    detailFailure.mockRestore();

    const ratingFailure = jest.spyOn(Product, 'findById').mockRejectedValueOnce(new Error('internal rating details'));
    const ratingRes = await request(app).post('/api/public/products/507f1f77bcf86cd799439011/rate').send({ rating: 5 });
    expect(ratingRes.status).toBe(500);
    expect(ratingRes.body.error).toBe('Unable to submit product rating');
    ratingFailure.mockRestore();
  });

  it('does not expose database details for invalid portal catalog identifiers', async () => {
    const passwordHash = await bcrypt.hash('Secret123!', 10);
    const customer = await Customer.create({
      name: 'Portal Customer', email: 'portal-customer@example.com', passwordHash,
      portalEnabled: true, firmId: global.portalTestFirm._id,
    });
    const login = await request(app).post('/api/portal/auth/login')
      .send({ email: customer.email, password: 'Secret123!' });

    const res = await request(app).get('/api/portal/catalog/not-a-valid-object-id')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to complete portal request');
    expect(res.body.error).not.toContain('Cast to ObjectId');
  });

  it('does not expose internal errors when portal login lookup fails', async () => {
    const lookup = jest.spyOn(Customer, 'findOne').mockRejectedValueOnce(new Error('database credentials leaked'));

    const res = await request(app)
      .post('/api/portal/auth/login')
      .send({ email: 'store@example.com', password: 'Secret123!' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to complete portal login');
    expect(res.body.error).not.toContain('database credentials');
    lookup.mockRestore();
  });

  it('rate limits repeated customer portal login attempts by client IP', async () => {
    let lastResponse;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      lastResponse = await request(app)
        .post('/api/portal/auth/login')
        .send({});
    }

    expect(lastResponse.status).toBe(429);
    expect(lastResponse.body.error).toContain('Too many portal login attempts');
    expect(lastResponse.headers['ratelimit-limit']).toBe('20');
  });
});
