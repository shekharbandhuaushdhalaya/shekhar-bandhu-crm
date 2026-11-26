const { consolidateInvoiceAllocations } = require('../services/paymentPostingService');

describe('Payment allocation consolidation', () => {
  test('combines repeated invoice rows before outstanding-balance validation and posting', () => {
    expect(consolidateInvoiceAllocations([
      { invoiceId: 'invoice-1', amountApplied: 35 },
      { invoiceId: 'invoice-2', amountAllocated: 10 },
      { invoiceId: 'invoice-1', amount: 45 },
      { invoiceId: 'invoice-2', amountApplied: 5 },
      { invoiceId: 'invoice-3', amountApplied: 0 }
    ])).toEqual([
      { invoiceId: 'invoice-1', amountApplied: 80 },
      { invoiceId: 'invoice-2', amountApplied: 15 }
    ]);
  });

  test('uses cent precision when combining allocation rows', () => {
    expect(consolidateInvoiceAllocations([
      { invoiceId: 'invoice-1', amountApplied: 0.1 },
      { invoiceId: 'invoice-1', amountApplied: 0.2 }
    ])).toEqual([{ invoiceId: 'invoice-1', amountApplied: 0.3 }]);
  });
});
