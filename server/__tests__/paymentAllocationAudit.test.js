jest.mock('../models/Payment', () => ({ findById: jest.fn() }));
jest.mock('../models/Invoice', () => ({ findById: jest.fn() }));
jest.mock('../models/Customer', () => ({ findById: jest.fn() }));
jest.mock('../models/Vendor', () => ({ findById: jest.fn() }));
jest.mock('../utils/withTransaction', () => ({ withTransaction: jest.fn(work => work({ id: 'allocation-session' })) }));

const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const { allocateExistingPayment } = require('../services/paymentPostingService');

describe('Existing payment allocation audit evidence', () => {
  test('records the authenticated allocator and timestamp on each allocation', async () => {
    const actor = { id: '507f191e810c19729de860ea', name: 'Finance Reviewer' };
    const invoice = {
      _id: 'invoice-1', invoiceNo: 'INV-1', isFinalized: true, status: 'unpaid',
      type: 'sale', customerId: 'customer-1', amount: 100, amountPaid: 0,
      payments: [], save: jest.fn().mockResolvedValue(true)
    };
    const payment = {
      _id: 'payment-1', status: 'active', partyType: 'Customer', partyId: 'customer-1',
      amount: 100, unallocatedAmount: 100, allocations: [],
      save: jest.fn().mockResolvedValue(true)
    };
    Payment.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(payment) });
    Invoice.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(invoice) });

    const result = await allocateExistingPayment({
      paymentId: payment._id, allocations: [{ invoiceId: invoice._id, amountApplied: 40 }], actor
    });

    expect(result.allocations[0]).toMatchObject({
      invoiceId: invoice._id, amountApplied: 40,
      allocatedByUserId: actor.id, allocatedByName: actor.name
    });
    expect(result.allocations[0].allocatedAt).toBeInstanceOf(Date);
    expect(result.unallocatedAmount).toBe(60);
    expect(invoice.amountPaid).toBe(40);
    expect(invoice.payments[0]).toMatchObject({ paymentId: payment._id, amountApplied: 40 });
  });

  test('requires authenticated actor evidence before opening a transaction', async () => {
    await expect(allocateExistingPayment({
      paymentId: 'payment-1', allocations: [{ invoiceId: 'invoice-1', amountApplied: 10 }]
    })).rejects.toMatchObject({ code: 'PAYMENT_ALLOCATION_ACTOR_REQUIRED' });
  });
});
