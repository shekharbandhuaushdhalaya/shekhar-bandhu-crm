const { buildSupplierScorecard } = require('../services/supplierScorecardService');

describe('Evidence-based supplier scorecard', () => {
  test('calculates delivery, acceptance, return and qualification coverage from linked records', () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-12-31');
    const result = buildSupplierScorecard({
      from, to,
      purchaseOrders: [{
        _id: 'po-1', poNo: 'PO-1', status: 'completed', totalAmount: 10000,
        expectedDeliveryDate: new Date('2026-05-10'),
        items: [{ rawMaterialId: 'raw-1', qtyOrdered: 8 }]
      }],
      goodsReceivedNotes: [{
        _id: 'grn-1', poId: 'po-1', receivedDate: new Date('2026-05-09'),
        items: [{ rawMaterialId: 'raw-1', qtyAccepted: 8, qtyRejected: 2 }]
      }],
      supplierReturns: [{ qty: 2, status: 'closed' }],
      qualifications: [{
        qualificationStatus: 'approved', verifiedByUserId: 'qa-1',
        verifiedAt: new Date('2026-04-01'), nextAuditDue: new Date('2027-04-01'),
        rawMaterialIds: ['raw-1']
      }]
    });
    expect(result).toMatchObject({
      purchaseOrderCount: 1,
      totalPurchaseOrderValue: 10000,
      completedOrdersWithPromisedDate: 1,
      onTimeDeliveryCount: 1,
      onTimeDeliveryRate: 100,
      receivedQuantity: 10,
      acceptedQuantity: 8,
      rejectedQuantity: 2,
      acceptanceRate: 80,
      rejectionRate: 20,
      supplierReturnRequestCount: 1,
      supplierReturnQuantity: 2,
      supplierReturnRate: 20,
      currentQualificationCoverage: 100,
      qualifiedRawMaterialIds: ['raw-1']
    });
  });

  test('returns null rates when the source records do not support a calculation', () => {
    const result = buildSupplierScorecard({
      purchaseOrders: [{ _id: 'po-1', status: 'draft', totalAmount: 0, items: [] }],
      goodsReceivedNotes: [], supplierReturns: [], qualifications: []
    });
    expect(result.onTimeDeliveryRate).toBeNull();
    expect(result.acceptanceRate).toBeNull();
    expect(result.rejectionRate).toBeNull();
    expect(result.supplierReturnRate).toBeNull();
    expect(result.currentQualificationCoverage).toBeNull();
  });

  test('does not count cancelled orders, rejected return requests or expired qualifications', () => {
    const result = buildSupplierScorecard({
      purchaseOrders: [{ _id: 'po-cancelled', status: 'cancelled', totalAmount: 500, items: [] }],
      goodsReceivedNotes: [],
      supplierReturns: [{ qty: 5, status: 'rejected' }, { qty: 2, status: 'cancelled' }],
      qualifications: [{
        qualificationStatus: 'approved', verifiedByUserId: 'qa-1',
        verifiedAt: new Date('2025-01-01'), nextAuditDue: new Date('2025-02-01'),
        rawMaterialIds: ['raw-1']
      }]
    });
    expect(result.purchaseOrderCount).toBe(0);
    expect(result.totalPurchaseOrderValue).toBe(0);
    expect(result.supplierReturnRequestCount).toBe(0);
    expect(result.currentQualificationCoverage).toBeNull();
  });
});
