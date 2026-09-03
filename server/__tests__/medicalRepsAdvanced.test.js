const MrTourPlan = require('../models/MrTourPlan');
const MrSampleBag = require('../models/MrSampleBag');

describe('MR Advanced Suite Models & Schemas', () => {
  it('validates MrTourPlan creation correctly', () => {
    const tp = new MrTourPlan({
      mrId: '507f1f77bcf86cd799439011',
      month: '09',
      year: 2026,
      status: 'submitted',
      entries: [
        {
          date: new Date(),
          territory: 'North Zone',
          targetDoctorNames: ['Dr. Sharma', 'Dr. Verma'],
          notes: 'Focus on Ayush Syrup'
        }
      ]
    });

    expect(tp.mrId.toString()).toBe('507f1f77bcf86cd799439011');
    expect(tp.status).toBe('submitted');
    expect(tp.entries.length).toBe(1);
    expect(tp.entries[0].targetDoctorNames).toContain('Dr. Sharma');
  });

  it('validates MrSampleBag stock balance model', () => {
    const sb = new MrSampleBag({
      mrId: '507f1f77bcf86cd799439011',
      productId: '507f1f77bcf86cd799439022',
      batchNo: 'BATCH-2026-01',
      qty: 25
    });

    expect(sb.qty).toBe(25);
    expect(sb.batchNo).toBe('BATCH-2026-01');
  });
});
