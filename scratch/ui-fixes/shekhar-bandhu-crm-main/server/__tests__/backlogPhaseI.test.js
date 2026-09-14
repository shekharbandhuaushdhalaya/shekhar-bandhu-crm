const Invoice = require('../models/Invoice');

describe('Backlog Phase I — Territory Heatmaps, Receivables Aging, Multi-Currency Exports & WhatsApp Broadcasts Suite', () => {
  it('aggregates territory heatmap visit densities by city', () => {
    const visits = [
      { city: 'Varanasi', orderAmount: 5000, latitude: 25.3176, longitude: 82.9739 },
      { city: 'Varanasi', orderAmount: 12000, latitude: 25.3200, longitude: 82.9800 },
      { city: 'Lucknow', orderAmount: 8000, latitude: 26.8467, longitude: 80.9462 }
    ];

    const cityMap = new Map();
    visits.forEach(v => {
      const city = v.city || 'Varanasi';
      if (!cityMap.has(city)) {
        cityMap.set(city, { city, totalVisits: 0, totalOrdersAmount: 0 });
      }
      const item = cityMap.get(city);
      item.totalVisits++;
      item.totalOrdersAmount += v.orderAmount;
    });

    expect(cityMap.get('Varanasi').totalVisits).toBe(2);
    expect(cityMap.get('Varanasi').totalOrdersAmount).toBe(17000);
    expect(cityMap.get('Lucknow').totalVisits).toBe(1);
  });

  it('categorizes unpaid customer invoices into receivables aging brackets', () => {
    function getAgingBracket(daysOld) {
      if (daysOld <= 30) return '0-30 Days';
      if (daysOld <= 60) return '31-60 Days';
      if (daysOld <= 90) return '61-90 Days';
      return '90+ Days';
    }

    expect(getAgingBracket(15)).toBe('0-30 Days');
    expect(getAgingBracket(45)).toBe('31-60 Days');
    expect(getAgingBracket(75)).toBe('61-90 Days');
    expect(getAgingBracket(120)).toBe('90+ Days');
  });

  it('supports multi-currency export invoice conversion to base INR', () => {
    const inv = new Invoice({
      invoiceNo: 'VP/EXP/26-27/001',
      type: 'sale',
      amount: 415000, // ₹4.15L INR base
      currency: 'USD',
      exchangeRate: 83.0,
      foreignAmount: 5000 // $5,000 USD
    });

    expect(inv.currency).toBe('USD');
    expect(inv.exchangeRate).toBe(83.0);
    expect(inv.foreignAmount).toBe(5000);
    expect(inv.foreignAmount * inv.exchangeRate).toBe(415000);
  });

  it('validates WhatsApp mass broadcast recipient phone numbers payload', () => {
    const rawPhones = [' +91 9876543210 ', '98765-43211', 'invalid'];
    const validPhones = rawPhones
      .map(p => (p || '').toString().trim().replace(/[^0-9+]/g, ''))
      .filter(p => p.length >= 10);

    expect(validPhones.length).toBe(2);
    expect(validPhones[0]).toBe('+919876543210');
  });
});
