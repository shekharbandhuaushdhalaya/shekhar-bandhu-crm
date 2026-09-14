const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
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
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Customer.deleteMany({});
    await Invoice.deleteMany({});
  });

  it('prevents login when portalEnabled is false or password is invalid', async () => {
    const passwordHash = await bcrypt.hash('Secret123!', 10);
    await Customer.create({
      name: 'Disabled Customer',
      email: 'disabled@customer.com',
      passwordHash,
      portalEnabled: false
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
      portalEnabled: true
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
      portalEnabled: true
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

    expect(pdfResB.status).toBe(403);
    expect(pdfResB.body.error).toContain('Forbidden');
  });
});
