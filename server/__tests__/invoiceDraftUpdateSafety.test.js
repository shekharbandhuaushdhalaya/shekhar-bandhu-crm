const { sanitizeInvoiceDraftUpdate, PROTECTED_DRAFT_FIELDS } = require('../utils/sanitizeInvoiceDraftUpdate');

describe('Purchase and sale invoice draft update safety', () => {
  test('strips finalization, payment, and source-document fields from draft edits', () => {
    const result = sanitizeInvoiceDraftUpdate({
      isFinalized: true,
      status: 'paid',
      amountPaid: 999,
      payments: [{ paymentId: 'payment-1', amountApplied: 999 }],
      sourceDocType: 'Challan',
      sourceDocId: 'challan-1',
      type: 'purchase',
      invoiceNo: 'FORGED-1',
      firmDetails: { name: 'Forged Firm' },
      amount: 125,
      supplierName: 'Approved Supplier',
      items: [{ name: 'Material', qty: 5, rate: 25 }]
    });

    expect(result).toEqual({
      amount: 125,
      supplierName: 'Approved Supplier',
      items: [{ name: 'Material', qty: 5, rate: 25 }]
    });
    expect(result.isFinalized).toBeUndefined();
    expect(result.amountPaid).toBeUndefined();
    expect(result.status).toBeUndefined();
  });

  test('protects every server-managed invoice field', () => {
    for (const field of PROTECTED_DRAFT_FIELDS) {
      expect(sanitizeInvoiceDraftUpdate({ [field]: 'untrusted' })).toEqual({});
    }
  });

  test('rejects operator, dotted-path, and prototype-pollution keys', () => {
    expect(sanitizeInvoiceDraftUpdate({
      '$set': { isFinalized: true },
      'payments.0.amountApplied': 999,
      'firmId.owner': 'another-tenant',
      '__proto__': { isFinalized: true },
      constructor: { prototype: { isFinalized: true } },
      amount: 50
    })).toEqual({ amount: 50 });
  });

  test('returns an empty update for non-object input', () => {
    expect(sanitizeInvoiceDraftUpdate(null)).toEqual({});
    expect(sanitizeInvoiceDraftUpdate([])).toEqual({});
  });
});
