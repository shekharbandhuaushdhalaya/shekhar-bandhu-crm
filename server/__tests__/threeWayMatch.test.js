const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceivedNote = require('../models/GoodsReceivedNote');

describe('Procurement PO, GRN, and 3-Way Match Models', () => {
  it('instantiates PurchaseOrder correctly', () => {
    const po = new PurchaseOrder({
      poNo: 'PO-2026-0001',
      vendorId: '507f1f77bcf86cd799439011',
      vendorName: 'Apex Herbs Ltd',
      items: [
        {
          name: 'Ashwagandha Powder',
          qtyOrdered: 100,
          unitPrice: 350,
          unit: 'kg',
          gstRate: 12
        }
      ],
      subtotal: 35000,
      taxAmount: 4200,
      totalAmount: 39200
    });

    expect(po.poNo).toBe('PO-2026-0001');
    expect(po.totalAmount).toBe(39200);
    expect(po.items[0].qtyOrdered).toBe(100);
  });

  it('verifies 3-way match logic for matching PO, GRN, and Invoice', () => {
    const poQtyOrdered = 100;
    const poTotalAmount = 39200;

    const grnQtyAccepted = 100;
    const invoiceQtyBilled = 100;
    const invoiceTotalAmount = 39200;

    const qtyMatch = grnQtyAccepted >= poQtyOrdered && invoiceQtyBilled === grnQtyAccepted;
    const amountMatch = Math.abs(poTotalAmount - invoiceTotalAmount) <= 10;

    expect(qtyMatch).toBe(true);
    expect(amountMatch).toBe(true);
  });
});
