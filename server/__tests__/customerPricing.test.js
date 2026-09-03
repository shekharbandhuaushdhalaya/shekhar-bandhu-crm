const CustomerPricing = require('../models/CustomerPricing');

describe('CustomerPricing Model and Volume Tier Logic', () => {
  it('instantiates CustomerPricing schema with custom rate and volume tiers', () => {
    const pricing = new CustomerPricing({
      customerId: '507f1f77bcf86cd799439011',
      productId: '507f1f77bcf86cd799439022',
      customRate: 450,
      discountPercent: 5,
      volumeTiers: [
        { minQty: 10, discountPercent: 10, fixedRate: 420 },
        { minQty: 50, discountPercent: 15, fixedRate: 380 }
      ]
    });

    expect(pricing.customerId.toString()).toBe('507f1f77bcf86cd799439011');
    expect(pricing.customRate).toBe(450);
    expect(pricing.volumeTiers.length).toBe(2);
    expect(pricing.volumeTiers[1].minQty).toBe(50);
    expect(pricing.volumeTiers[1].fixedRate).toBe(380);
  });

  it('correctly matches volume tiers by quantity breaks', () => {
    const tiers = [
      { minQty: 10, discountPercent: 5, fixedRate: 420 },
      { minQty: 50, discountPercent: 10, fixedRate: 390 },
      { minQty: 100, discountPercent: 15, fixedRate: 350 }
    ];

    const sortedTiers = [...tiers].sort((a, b) => b.minQty - a.minQty);

    const match5 = sortedTiers.find(t => 5 >= t.minQty);
    const match20 = sortedTiers.find(t => 20 >= t.minQty);
    const match75 = sortedTiers.find(t => 75 >= t.minQty);
    const match150 = sortedTiers.find(t => 150 >= t.minQty);

    expect(match5).toBeUndefined();
    expect(match20.minQty).toBe(10);
    expect(match75.minQty).toBe(50);
    expect(match150.minQty).toBe(100);
  });
});
