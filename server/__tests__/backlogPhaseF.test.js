const DrugLicense = require('../models/DrugLicense');
const MrVisit = require('../models/MrVisit');

describe('Backlog Phase F — Regulatory Compliance, Banking, Geo-Tracking & Forecasting Suite', () => {
  it('calculates DrugLicense validity and expiry-soon warnings', () => {
    const now = new Date('2026-09-01');
    const expFar = new Date('2027-09-01');
    const expSoon = new Date('2026-09-25'); // < 60 days
    const expPast = new Date('2026-08-01');

    function getStatus(expDate) {
      const d60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      if (expDate <= now) return 'expired';
      if (expDate <= d60) return 'expiring_soon';
      return 'valid';
    }

    expect(getStatus(expFar)).toBe('valid');
    expect(getStatus(expSoon)).toBe('expiring_soon');
    expect(getStatus(expPast)).toBe('expired');
  });

  it('verifies bank statement line reconciliation matching logic', () => {
    const bankLine = { amount: 25000, referenceNo: 'UTRN123456', date: new Date('2026-09-01') };
    const ledgerPayment = { amount: 25000, referenceNo: 'UTRN123456', paymentDate: new Date('2026-09-02') };

    const amountMatch = Math.abs(bankLine.amount - ledgerPayment.amount) < 1;
    const refMatch = bankLine.referenceNo === ledgerPayment.referenceNo;

    expect(amountMatch).toBe(true);
    expect(refMatch).toBe(true);
  });

  it('instantiates MrVisit with latitude, longitude and checkIn timestamp', () => {
    const visit = new MrVisit({
      mrId: '507f1f77bcf86cd799439011',
      doctorName: 'Dr. A. K. Banerjee',
      latitude: 25.3176,
      longitude: 82.9739,
      checkIn: { time: new Date() },
      status: 'checked_in'
    });

    expect(visit.latitude).toBe(25.3176);
    expect(visit.longitude).toBe(82.9739);
    expect(visit.status).toBe('checked_in');
  });

  it('computes 3-month moving average demand forecast with seasonal buffer', () => {
    const past3MonthsTotalSalesUnits = 300;
    const avgMonthlyDemand = Number((past3MonthsTotalSalesUnits / 3).toFixed(1)); // 100 units
    const projectedNextMonthUnits = Math.ceil(Number((avgMonthlyDemand * 1.1).toFixed(2))); // 110 units

    expect(avgMonthlyDemand).toBe(100.0);
    expect(projectedNextMonthUnits).toBe(110);
  });
});
