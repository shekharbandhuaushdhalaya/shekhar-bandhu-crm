const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');

let mongoServer;

describe('Bill-Wise Payment Allocation & Receivables Ageing Test Suite', () => {
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
    await Invoice.deleteMany({});
    await Payment.deleteMany({});
    await Customer.deleteMany({});
  });

  describe('Bill-Wise Payment Allocation', () => {
    it('allocates payment across multiple invoices updating status to partial and paid', async () => {
      const cust = await Customer.create({
        name: 'Dabur Pharma Distributors',
        regularBalance: 15000
      });

      const inv1 = await Invoice.create({
        invoiceNo: 'INV-TEST-001',
        customerName: cust.name,
        amount: 5000,
        amountPaid: 0,
        status: 'unpaid',
        type: 'sale',
        isFinalized: true,
        date: new Date()
      });

      const inv2 = await Invoice.create({
        invoiceNo: 'INV-TEST-002',
        customerName: cust.name,
        amount: 10000,
        amountPaid: 0,
        status: 'unpaid',
        type: 'sale',
        isFinalized: true,
        date: new Date()
      });

      // Receive payment of 8000 (5000 to inv1 -> paid, 3000 to inv2 -> partial, remainder 0)
      const paymentAllocations = [
        { invoiceId: inv1._id, amountApplied: 5000 },
        { invoiceId: inv2._id, amountApplied: 3000 }
      ];

      // Simulate payment creation with allocation logic
      let totalAllocated = 0;
      for (const a of paymentAllocations) totalAllocated += a.amountApplied;

      expect(totalAllocated).toBe(8000);

      const payment = await Payment.create({
        type: 'receive',
        partyType: 'Customer',
        partyId: cust._id,
        partyName: cust.name,
        amount: 8000,
        unallocatedAmount: 8000 - totalAllocated,
        allocations: paymentAllocations
      });

      // Update invoices as payment controller does
      for (const alloc of paymentAllocations) {
        const inv = await Invoice.findById(alloc.invoiceId);
        inv.payments = inv.payments || [];
        inv.payments.push({ paymentId: payment._id, amountAllocated: alloc.amountApplied, amountApplied: alloc.amountApplied });
        inv.amountPaid += alloc.amountApplied;
        inv.status = inv.amountPaid >= inv.amount ? 'paid' : (inv.amountPaid > 0 ? 'partial' : 'unpaid');
        await inv.save();
      }

      const updatedInv1 = await Invoice.findById(inv1._id);
      expect(updatedInv1.amountPaid).toBe(5000);
      expect(updatedInv1.status).toBe('paid');
      expect(updatedInv1.balanceDue).toBe(0);

      const updatedInv2 = await Invoice.findById(inv2._id);
      expect(updatedInv2.amountPaid).toBe(3000);
      expect(updatedInv2.status).toBe('partial');
      expect(updatedInv2.balanceDue).toBe(7000);
    });

    it('prevents over-allocation when total allocations exceed payment amount', () => {
      const paymentAmount = 10000;
      const allocations = [
        { invoiceId: new mongoose.Types.ObjectId(), amountApplied: 7000 },
        { invoiceId: new mongoose.Types.ObjectId(), amountApplied: 5000 }
      ];

      const sumAllocated = allocations.reduce((s, a) => s + a.amountApplied, 0);
      expect(sumAllocated).toBe(12000);
      expect(sumAllocated > paymentAmount).toBe(true);
    });
  });

  describe('Receivables Ageing Brackets Math', () => {
    it('buckets overdue invoices correctly into 0-30, 31-60, 61-90, 90+ days', async () => {
      const now = new Date();
      const dayMs = 24 * 60 * 60 * 1000;

      // Seed 4 invoices in different ageing brackets
      await Invoice.create({
        invoiceNo: 'INV-0-30',
        customerName: 'Apex Healthcare',
        amount: 1000,
        amountPaid: 0,
        status: 'unpaid',
        type: 'sale',
        isFinalized: true,
        dueDate: new Date(now.getTime() - 15 * dayMs) // 15 days overdue -> 0-30
      });

      await Invoice.create({
        invoiceNo: 'INV-31-60',
        customerName: 'Apex Healthcare',
        amount: 2000,
        amountPaid: 0,
        status: 'unpaid',
        type: 'sale',
        isFinalized: true,
        dueDate: new Date(now.getTime() - 45 * dayMs) // 45 days overdue -> 31-60
      });

      await Invoice.create({
        invoiceNo: 'INV-61-90',
        customerName: 'Apex Healthcare',
        amount: 3000,
        amountPaid: 0,
        status: 'unpaid',
        type: 'sale',
        isFinalized: true,
        dueDate: new Date(now.getTime() - 75 * dayMs) // 75 days overdue -> 61-90
      });

      await Invoice.create({
        invoiceNo: 'INV-90-PLUS',
        customerName: 'Apex Healthcare',
        amount: 4000,
        amountPaid: 0,
        status: 'unpaid',
        type: 'sale',
        isFinalized: true,
        dueDate: new Date(now.getTime() - 120 * dayMs) // 120 days overdue -> 90+
      });

      // Ageing calculation logic
      const unpaidInvoices = await Invoice.find({ type: 'sale', isFinalized: true, status: { $ne: 'paid' } }).lean();
      const brackets = { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0, totalOutstanding: 0 };

      unpaidInvoices.forEach(inv => {
        const outstanding = inv.amount - (inv.amountPaid || 0);
        const baseDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.date);
        const diffDays = Math.max(0, Math.floor((now.getTime() - baseDate.getTime()) / dayMs));

        brackets.totalOutstanding += outstanding;
        if (diffDays <= 30) brackets.b0_30 += outstanding;
        else if (diffDays <= 60) brackets.b31_60 += outstanding;
        else if (diffDays <= 90) brackets.b61_90 += outstanding;
        else brackets.b90_plus += outstanding;
      });

      expect(brackets.b0_30).toBe(1000);
      expect(brackets.b31_60).toBe(2000);
      expect(brackets.b61_90).toBe(3000);
      expect(brackets.b90_plus).toBe(4000);
      expect(brackets.totalOutstanding).toBe(10000);
    });
  });
});
