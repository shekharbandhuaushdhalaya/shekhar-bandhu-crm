const { assertAllocationOwnership } = require('../services/paymentPostingService');

describe('Payment allocation direction', () => {
  const saleInvoice = { invoiceNo: 'SALE-1', isFinalized: true, status: 'unpaid', type: 'sale', customerId: 'customer-1' };
  const purchaseInvoice = { invoiceNo: 'PUR-1', isFinalized: true, status: 'unpaid', type: 'purchase', vendorId: 'vendor-1' };

  test('allows customer receipts against their finalized sales invoices', () => {
    expect(() => assertAllocationOwnership(saleInvoice, 'Customer', 'customer-1', 'receive')).not.toThrow();
  });

  test('rejects customer refunds against sales invoices', () => {
    expect(() => assertAllocationOwnership(saleInvoice, 'Customer', 'customer-1', 'make'))
      .toThrow('Only customer receipts can be allocated to sales invoices');
  });

  test('allows vendor payments against their finalized purchase invoices', () => {
    expect(() => assertAllocationOwnership(purchaseInvoice, 'Vendor', 'vendor-1', 'make')).not.toThrow();
  });

  test('rejects vendor refunds against purchase invoices', () => {
    expect(() => assertAllocationOwnership(purchaseInvoice, 'Vendor', 'vendor-1', 'receive'))
      .toThrow('Only vendor payments can be allocated to purchase invoices');
  });
});
