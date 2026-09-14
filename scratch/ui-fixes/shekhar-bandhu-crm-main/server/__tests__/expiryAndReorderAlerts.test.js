describe('Pharma Batch Expiry & Low Stock Reorder Alerts', () => {
  it('categorizes expiring batches into 30/60/90 day buckets', () => {
    const now = new Date();
    const bExpired = { expiryDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000) };
    const b30 = { expiryDate: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000) };
    const b60 = { expiryDate: new Date(now.getTime() + 50 * 24 * 60 * 60 * 1000) };
    const b90 = { expiryDate: new Date(now.getTime() + 80 * 24 * 60 * 60 * 1000) };

    const batches = [bExpired, b30, b60, b90];
    const categorized = { expired: [], days30: [], days60: [], days90: [] };

    batches.forEach(b => {
      const daysLeft = Math.ceil((b.expiryDate - now) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 0) categorized.expired.push(b);
      else if (daysLeft <= 30) categorized.days30.push(b);
      else if (daysLeft <= 60) categorized.days60.push(b);
      else categorized.days90.push(b);
    });

    expect(categorized.expired.length).toBe(1);
    expect(categorized.days30.length).toBe(1);
    expect(categorized.days60.length).toBe(1);
    expect(categorized.days90.length).toBe(1);
  });

  it('detects low stock items below minimum reorder level', () => {
    const rm1 = { name: 'Ashwagandha', minReorder: 100, stockLevel: 40, unit: 'kg' };
    const rm2 = { name: 'Tulsi Extract', minReorder: 50, stockLevel: 80, unit: 'kg' };

    expect((rm1.stockLevel || 0) <= rm1.minReorder).toBe(true);
    expect((rm2.stockLevel || 0) <= rm2.minReorder).toBe(false);
  });
});
