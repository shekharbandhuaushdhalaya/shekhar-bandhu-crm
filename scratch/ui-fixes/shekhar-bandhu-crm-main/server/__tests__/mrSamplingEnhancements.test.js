const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const MedicalRepresentative = require('../models/MedicalRepresentative');
const Contact = require('../models/Contact');
const Product = require('../models/Product');
const MrSampleBag = require('../models/MrSampleBag');
const MrVisit = require('../models/MrVisit');
const medicalRepRoutes = require('../routes/crm/medicalReps');

let mongoServer;
let app;
let currentUser = { id: '507f1f77bcf86cd799439011', role: 'admin', email: 'admin@company.com' };

describe('Doctor Sample Management Enhancements (Expiry Warnings, Quotas, Signature & OTP)', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = currentUser;
      next();
    });
    app.use('/api/medical-reps', medicalRepRoutes);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await MedicalRepresentative.deleteMany({});
    await Contact.deleteMany({});
    await Product.deleteMany({});
    await MrSampleBag.deleteMany({});
    await MrVisit.deleteMany({});
    currentUser = { id: '507f1f77bcf86cd799439011', role: 'admin', email: 'admin@company.com' };
  });

  it('issues sample bag stock with expiry date & calculates near-expiry flags', async () => {
    const mr = await MedicalRepresentative.create({
      name: 'Suresh Kumar',
      email: 'suresh@company.com',
      phone: '9876543210',
      code: 'MR-201'
    });

    const prod = await Product.create({
      name: 'Ashwagandha Churna Sample',
      sku: 'SKU-SMP-01',
      stockLevel: 100,
      mrp: 150
    });

    // 15 days in the future (Near Expiry)
    const futureExpiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    const issueRes = await request(app)
      .post(`/api/medical-reps/${mr._id}/sample-bag/issue`)
      .send({
        productId: prod._id.toString(),
        batchNo: 'BATCH-2026-X',
        qty: 20,
        expiryDate: futureExpiry.toISOString()
      });

    expect(issueRes.status).toBe(201);
    expect(issueRes.body.qty).toBe(20);

    const bagRes = await request(app)
      .get(`/api/medical-reps/${mr._id}/sample-bag`);

    expect(bagRes.status).toBe(200);
    expect(bagRes.body.length).toBe(1);
    expect(bagRes.body[0].isNearExpiry).toBe(true);
    expect(bagRes.body[0].isExpired).toBe(false);
    expect(bagRes.body[0].daysToExpiry).toBeLessThanOrEqual(15);
  });

  it('enforces doctor monthly sample quota based on category and custom limit', async () => {
    const mr = await MedicalRepresentative.create({
      name: 'Suresh Kumar',
      email: 'suresh@company.com',
      phone: '9876543210',
      code: 'MR-201'
    });

    // Doctor with category 'B' (Default quota: 5 units/month)
    const doctor = await Contact.create({
      name: 'Dr. Category B Doctor',
      category: 'B',
      phone: '9876543211',
      monthlySampleQuota: 5
    });

    const prod = await Product.create({
      name: 'Syrup Sample',
      sku: 'SKU-SMP-02',
      stockLevel: 100
    });

    await MrSampleBag.create({
      mrId: mr._id,
      productId: prod._id,
      qty: 20
    });

    // Visit 1: Hand over 4 samples (Allowed)
    const visit1 = await request(app)
      .post(`/api/medical-reps/${mr._id}/visits`)
      .send({
        doctorId: doctor._id.toString(),
        doctorName: doctor.name,
        purpose: 'sampling',
        sampleDetails: [{ productId: prod._id.toString(), name: prod.name, qty: 4 }]
      });

    expect(visit1.status).toBe(201);

    // Visit 2: Attempt to hand over 3 more samples (4 + 3 = 7 > quota 5 -> Blocked)
    const visit2 = await request(app)
      .post(`/api/medical-reps/${mr._id}/visits`)
      .send({
        doctorId: doctor._id.toString(),
        doctorName: doctor.name,
        purpose: 'sampling',
        sampleDetails: [{ productId: prod._id.toString(), name: prod.name, qty: 3 }]
      });

    expect(visit2.status).toBe(400);
    expect(visit2.body.error).toContain('Sample monthly quota exceeded');
    expect(visit2.body.monthlyQuota).toBe(5);
    expect(visit2.body.alreadyGivenQty).toBe(4);
  });

  it('sends and verifies doctor sample acknowledgment OTP', async () => {
    const doctor = await Contact.create({
      name: 'Dr. V. K. Singh',
      phone: '9876500000'
    });

    // 1. Send OTP
    const sendRes = await request(app)
      .post('/api/medical-reps/sample-otp/send')
      .send({ doctorId: doctor._id.toString(), doctorPhone: doctor.phone });

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.success).toBe(true);
    expect(sendRes.body.otp).toBe('1234');

    // 2. Verify with wrong OTP
    const wrongRes = await request(app)
      .post('/api/medical-reps/sample-otp/verify')
      .send({ otpKey: doctor._id.toString(), otp: '9999' });

    expect(wrongRes.status).toBe(400);
    expect(wrongRes.body.verified).toBe(false);

    // 3. Verify with correct OTP
    const verifyRes = await request(app)
      .post('/api/medical-reps/sample-otp/verify')
      .send({ otpKey: doctor._id.toString(), otp: '1234' });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.verified).toBe(true);
  });

  it('logs doctor visit with digital signature and verified OTP status', async () => {
    const mr = await MedicalRepresentative.create({
      name: 'Suresh Kumar',
      email: 'suresh@company.com',
      phone: '9876543210',
      code: 'MR-201'
    });

    const doc = await Contact.create({
      name: 'Dr. Signature Doctor',
      phone: '9876543222'
    });

    const prod = await Product.create({ name: 'Churna', sku: 'SKU-SMP-03', stockLevel: 50 });
    await MrSampleBag.create({ mrId: mr._id, productId: prod._id, qty: 10 });

    const visitRes = await request(app)
      .post(`/api/medical-reps/${mr._id}/visits`)
      .send({
        doctorId: doc._id.toString(),
        doctorName: doc.name,
        purpose: 'sampling',
        doctorSignature: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0...',
        sampleAckOtp: '1234',
        sampleOtpVerified: true,
        sampleDetails: [{ productId: prod._id.toString(), name: prod.name, qty: 2 }]
      });

    expect(visitRes.status).toBe(201);
    expect(visitRes.body.doctorSignature).toContain('data:image/svg+xml');
    expect(visitRes.body.sampleOtpVerified).toBe(true);
  });
});
