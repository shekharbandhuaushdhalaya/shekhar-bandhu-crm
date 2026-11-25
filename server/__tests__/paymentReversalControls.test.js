jest.mock('../models/Payment', () => ({ findById: jest.fn() }));
jest.mock('../models/Invoice', () => ({ findById: jest.fn() }));
jest.mock('../models/Customer', () => ({ findById: jest.fn() }));
jest.mock('../models/Vendor', () => ({ findById: jest.fn() }));
jest.mock('../utils/withTransaction', () => ({ withTransaction: jest.fn(work => work({ id: 'payment-reversal-session' })) }));

const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const { withTransaction } = require('../utils/withTransaction');
const { reversePayment } = require('../services/paymentPostingService');

describe('Payment reversal audit and maker-checker controls', () => {
  let payment;
  let invoice;
  let customer;
  const actor = { id: '507f191e810c19729de860ea', name: 'Finance Reviewer' };
  const reason = 'Duplicate receipt recorded against the same bank reference';

  beforeEach(() => {
    jest.clearAllMocks();
    payment = {
      _id: 'payment-1', status: 'active', createdByUserId: '507f191e810c19729de860eb',
      partyType: 'Customer', partyId: 'customer-1', type: 'receive', mode: 'regular',
      amount: 40, allocations: [{ invoiceId: 'invoice-1', amountApplied: 40 }],
      save: jest.fn().mockResolvedValue(true)
    };
    invoice = {
      _id: 'invoice-1', amount: 100, amountPaid: 40, status: 'partially_paid',
      payments: [{ paymentId: 'payment-1', amountApplied: 40 }],
      save: jest.fn().mockResolvedValue(true)
    };
    customer = { _id: 'customer-1', regularBalance: 960, save: jest.fn().mockResolvedValue(true) };
    Payment.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(payment) });
    Invoice.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(invoice) });
    Customer.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(customer) });
  });

  test('reverses allocations and party balance atomically while preserving actor and reason evidence', async () => {
    const result = await reversePayment('payment-1', actor, reason);
    expect(result).toBe(payment);
    expect(invoice.amountPaid).toBe(0);
    expect(invoice.status).toBe('unpaid');
    expect(invoice.payments).toHaveLength(0);
    expect(customer.regularBalance).toBe(1000);
    expect(payment.status).toBe('reversed');
    expect(payment.reversedBy).toBe(actor.id);
    expect(payment.reversedByName).toBe(actor.name);
    expect(payment.reversalReason).toBe(reason);
    expect(payment.reversedAt).toBeInstanceOf(Date);
    expect(invoice.save).toHaveBeenCalledWith({ session: { id: 'payment-reversal-session' } });
    expect(customer.save).toHaveBeenCalledWith({ session: { id: 'payment-reversal-session' } });
    expect(payment.save).toHaveBeenCalledWith({ session: { id: 'payment-reversal-session' } });
  });

  test('prevents the payment creator from reversing their own payment', async () => {
    payment.createdByUserId = actor.id;
    await expect(reversePayment('payment-1', actor, reason))
      .rejects.toMatchObject({ code: 'PAYMENT_REVERSAL_MAKER_CHECKER_REQUIRED' });
    expect(Invoice.findById).not.toHaveBeenCalled();
    expect(payment.save).not.toHaveBeenCalled();
  });

  test('requires authenticated reviewer identity and a substantive reason', async () => {
    await expect(reversePayment('payment-1', actor, 'duplicate'))
      .rejects.toMatchObject({ code: 'PAYMENT_REVERSAL_EVIDENCE_REQUIRED' });
    await expect(reversePayment('payment-1', {}, reason))
      .rejects.toMatchObject({ code: 'PAYMENT_REVERSAL_EVIDENCE_REQUIRED' });
    expect(withTransaction).not.toHaveBeenCalled();
  });
});
