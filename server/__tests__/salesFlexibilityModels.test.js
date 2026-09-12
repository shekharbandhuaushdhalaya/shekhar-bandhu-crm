const Order = require('../models/Order');
const SalesScheme = require('../models/SalesScheme');
const SalesReturn = require('../models/SalesReturn');
const CommissionRule = require('../models/CommissionRule');

describe('Flexible sales domain models', () => {
  test('sales order tracks partial fulfillment and attribution', () => {
    const o = new Order({
      orderNo: 'SO-00001', name: 'ABC Pharmacy', email: 'a@example.com', phone: '1', shippingAddress: 'x', totalAmount: 100,
      sourceType: 'mr', sourcePersonName: 'Amit', items: [{ productId: '507f1f77bcf86cd799439011', name: 'P1', qty: 10, price: 10, fulfilledQty: 4, backorderedQty: 6, freeQty: 1 }]
    });
    expect(o.items[0].fulfilledQty).toBe(4);
    expect(o.items[0].backorderedQty).toBe(6);
    expect(o.sourceType).toBe('mr');
  });

  test('scheme supports buy-x-get-y plus discount', () => {
    const s = new SalesScheme({ name:'10+1', code:'TENPLUS', productId:'507f1f77bcf86cd799439011', minQty:10, freeQty:1, discountPercent:2 });
    expect(s.minQty).toBe(10); expect(s.freeQty).toBe(1); expect(s.discountPercent).toBe(2);
  });

  test('sales return is a controlled draft before posting', () => {
    const r = new SalesReturn({ returnNo:'SR-00001', customerId:'507f1f77bcf86cd799439012', customerName:'ABC', warehouseId:'507f1f77bcf86cd799439013', items:[{productId:'507f1f77bcf86cd799439011',name:'P1',qty:1}] });
    expect(r.status).toBe('draft'); expect(r.resolution).toBe('credit_note');
  });

  test('commission rules support slabs', () => {
    const r = new CommissionRule({ name:'MR slabs', appliesTo:'mr', slabs:[{min:0,max:100000,percent:1},{min:100001,percent:2}] });
    expect(r.slabs).toHaveLength(2); expect(r.slabs[1].percent).toBe(2);
  });
});
