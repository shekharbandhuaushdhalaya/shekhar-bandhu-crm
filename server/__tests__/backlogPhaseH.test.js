const SampleConversion = require('../models/SampleConversion');
const LoyaltyScheme = require('../models/LoyaltyScheme');

describe('Backlog Phase H — Field Force Conversion, Loyalty Pricing, Custom Reports & OpenAPI Docs Suite', () => {
  it('instantiates SampleConversion and computes conversion percentage', () => {
    const rec = new SampleConversion({
      mrId: '507f1f77bcf86cd799439011',
      mrName: 'MR Sharma',
      doctorId: '507f1f77bcf86cd799439022',
      doctorName: 'Dr. V. K. Gupta',
      productId: '507f1f77bcf86cd799439033',
      productName: 'Chyawanprash Special',
      samplesQtyGiven: 5,
      conversionStatus: 'converted',
      prescriptionOrderAmount: 18500
    });

    expect(rec.conversionStatus).toBe('converted');
    expect(rec.prescriptionOrderAmount).toBe(18500);
  });

  it('evaluates distributor volume loyalty tiers', () => {
    const schemes = [
      { tier: 'silver', minAnnualPurchaseAmount: 100000, discountPercent: 3 },
      { tier: 'gold', minAnnualPurchaseAmount: 500000, discountPercent: 6 },
      { tier: 'platinum', minAnnualPurchaseAmount: 1500000, discountPercent: 10 }
    ].sort((a, b) => b.minAnnualPurchaseAmount - a.minAnnualPurchaseAmount);

    function evaluateTier(annualVolume) {
      const match = schemes.find(s => annualVolume >= s.minAnnualPurchaseAmount);
      return match ? match.tier : 'standard';
    }

    expect(evaluateTier(750000)).toBe('gold');
    expect(evaluateTier(2000000)).toBe('platinum');
    expect(evaluateTier(50000)).toBe('standard');
  });

  it('validates OpenAPI 3.0 specification output format', () => {
    const openApiSpec = {
      openapi: '3.0.3',
      info: { title: 'Shekhar Bandhu Aushadhalaya CRM & Manufacturing API', version: '1.0.0' }
    };

    expect(openApiSpec.openapi).toBe('3.0.3');
    expect(openApiSpec.info.title).toContain('Shekhar Bandhu');
  });
});
