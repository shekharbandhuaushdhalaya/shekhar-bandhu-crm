const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const { calculateTCS } = require('../utils/tdsTcsCalculator');

let mongoServer;

describe('Task 2 — Section 206C(1H) TCS Calculation & Finance Summary Suite', () => {
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

  beforeEach(async () => {
    await Invoice.deleteMany({});
    await Customer.deleteMany({});
  });

  it('(a) returns no TCS when cumulative financial year sales are below ₹50 Lakhs', async () => {
    const res = await calculateTCS({
      customerId: 'CUST-001',
      invoiceAmount: 2000000,
      financialYearCumulativeSales: 2500000
    });

    expect(res.applicable).toBe(false);
    expect(res.amount).toBe(0);
  });

  it('(b) calculates partial TCS only on the portion pushing past ₹50 Lakhs when crossing threshold', async () => {
    // Cumulative sales ₹49 Lakhs (₹4,900,000)
    // New invoice ₹3 Lakhs (₹300,000)
    // Total = ₹52 Lakhs. Portion above ₹50L = ₹2 Lakhs (₹200,000)
    // 0.1% TCS on ₹200,000 = ₹200
    const res = await calculateTCS({
      customerId: 'CUST-001',
      invoiceAmount: 300000,
      financialYearCumulativeSales: 4900000
    });

    expect(res.applicable).toBe(true);
    expect(res.taxablePortion).toBe(200000);
    expect(res.amount).toBe(200);
  });

  it('(c) calculates full 0.1% TCS on the entire invoice amount once threshold is already crossed', async () => {
    // Cumulative sales ₹52 Lakhs (₹5,200,000)
    // New invoice ₹1 Lakh (₹100,000)
    // 0.1% TCS on ₹100,000 = ₹100
    const res = await calculateTCS({
      customerId: 'CUST-001',
      invoiceAmount: 100000,
      financialYearCumulativeSales: 5200000
    });

    expect(res.applicable).toBe(true);
    expect(res.taxablePortion).toBe(100000);
    expect(res.amount).toBe(100);
  });

  it('queries prior finalized sale invoices in DB to compute cumulative FY sales dynamically', async () => {
    const cust = await Customer.create({
      name: 'Dynamic Ayurvedic Dealer',
      phone: '9876543210',
      regularBalance: 0
    });

    // Create prior finalized sale invoice of ₹4,900,000
    await Invoice.create({
      invoiceNo: 'VP/26-27/001',
      type: 'sale',
      isFinalized: true,
      customerId: cust._id,
      customerName: cust.name,
      amount: 4900000,
      nettTotal: 4900000,
      date: new Date()
    });

    const res = await calculateTCS({
      customerId: cust._id,
      invoiceAmount: 300000,
      invoiceDate: new Date(Date.now() + 1000)
    });

    expect(res.applicable).toBe(true);
    expect(res.cumulativeSales).toBe(4900000);
    expect(res.taxablePortion).toBe(200000);
    expect(res.amount).toBe(200);
  });
});
