const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');

describe('Payment Allocation & Receivables Ageing Logic', () => {
  it('instantiates Payment with bill-wise allocations', () => {
    const payment = new Payment({
      type: 'receive',
      partyType: 'Customer',
      partyId: '507f1f77bcf86cd799439011',
      partyName: 'Delhi Distributors',
      amount: 10000,
      unallocatedAmount: 4000,
      allocations: [
        {
          invoiceId: '507f1f77bcf86cd799439022',
          invoiceNo: 'INV-2026-001',
          amountAllocated: 6000
        }
      ]
    });

    expect(payment.amount).toBe(10000);
    expect(payment.unallocatedAmount).toBe(4000);
    expect(payment.allocations.length).toBe(1);
    expect(payment.allocations[0].invoiceNo).toBe('INV-2026-001');
    expect(payment.allocations[0].amountAllocated).toBe(6000);
  });

  it('correctly calculates age brackets for outstanding invoices', () => {
    const now = new Date();
    const date15 = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const date45 = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
    const date75 = new Date(now.getTime() - 75 * 24 * 60 * 60 * 1000);
    const date120 = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);

    const invoices = [
      { date: date15, amount: 5000, amountPaid: 0 },
      { date: date45, amount: 8000, amountPaid: 2000 },
      { date: date75, amount: 12000, amountPaid: 0 },
      { date: date120, amount: 15000, amountPaid: 5000 }
    ];

    const brackets = { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0 };

    invoices.forEach(inv => {
      const outstanding = inv.amount - inv.amountPaid;
      const diffDays = Math.ceil(Math.abs(now.getTime() - inv.date.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 30) brackets.b0_30 += outstanding;
      else if (diffDays <= 60) brackets.b31_60 += outstanding;
      else if (diffDays <= 90) brackets.b61_90 += outstanding;
      else brackets.b90_plus += outstanding;
    });

    expect(brackets.b0_30).toBe(5000);
    expect(brackets.b31_60).toBe(6000);
    expect(brackets.b61_90).toBe(12000);
    expect(brackets.b90_plus).toBe(10000);
  });
});
