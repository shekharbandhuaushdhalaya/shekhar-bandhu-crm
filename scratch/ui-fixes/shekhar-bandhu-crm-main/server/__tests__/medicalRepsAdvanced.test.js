const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const MedicalRepresentative = require('../models/MedicalRepresentative');
const SalesTarget = require('../models/SalesTarget');
const Invoice = require('../models/Invoice');
const MrTourPlan = require('../models/MrTourPlan');
const MrSampleBag = require('../models/MrSampleBag');
const medicalRepsRouter = require('../routes/crm/medicalReps');

jest.mock('../middleware/authorize', () => ({
  authorize: () => (req, res, next) => {
    req.user = { id: 'usr1', name: 'Admin', role: 'admin' };
    next();
  }
}));

let mongoServer;
let app;

describe('MR Advanced Suite Models & Performance Summary API', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use('/api/medical-reps', medicalRepsRouter);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await MedicalRepresentative.deleteMany({});
    await SalesTarget.deleteMany({});
    await Invoice.deleteMany({});
  });

  it('validates MrTourPlan creation correctly', () => {
    const tp = new MrTourPlan({
      mrId: '507f1f77bcf86cd799439011',
      month: '09',
      year: 2026,
      status: 'submitted',
      entries: [
        {
          date: new Date(),
          territory: 'North Zone',
          targetDoctorNames: ['Dr. Sharma', 'Dr. Verma'],
          notes: 'Focus on Ayush Syrup'
        }
      ]
    });

    expect(tp.mrId.toString()).toBe('507f1f77bcf86cd799439011');
    expect(tp.status).toBe('submitted');
    expect(tp.entries.length).toBe(1);
    expect(tp.entries[0].targetDoctorNames).toContain('Dr. Sharma');
  });

  it('validates MrSampleBag stock balance model', () => {
    const sb = new MrSampleBag({
      mrId: '507f1f77bcf86cd799439011',
      productId: '507f1f77bcf86cd799439022',
      batchNo: 'BATCH-2026-01',
      qty: 25
    });

    expect(sb.qty).toBe(25);
    expect(sb.batchNo).toBe('BATCH-2026-01');
  });

  it('calculates non-zero incentivePayout in performance scorecard endpoint when MR has sales', async () => {
    const mr = await MedicalRepresentative.create({
      name: 'Rakesh Verma',
      code: 'MR-101',
      email: 'rakesh@example.com',
      phone: '9876543210'
    });

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    await SalesTarget.create({
      mrId: mr._id,
      agentId: mr._id,
      agentName: mr.name,
      month: currentMonth,
      year: currentYear,
      targetAmount: 100000
    });

    await Invoice.create({
      invoiceNo: 'INV-2026-001',
      type: 'sale',
      isFinalized: true,
      mrId: mr._id,
      assignedMrId: mr._id,
      amount: 150000,
      nettTotal: 150000,
      date: now
    });

    const res = await request(app).get(`/api/medical-reps/${mr._id}/scorecard`);

    expect(res.status).toBe(200);
    expect(res.body.mrId.toString()).toBe(mr._id.toString());
    expect(res.body.incentivePayout).toBeGreaterThan(0);
    expect(res.body.incentivePayout).toBe(7500); // 150000 * 5% slab commission
  });
});
