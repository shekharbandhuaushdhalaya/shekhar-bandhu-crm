const Lead = require('../models/Lead');
const Order = require('../models/Order');
const VendorQualification = require('../models/VendorQualification');
const Equipment = require('../models/Equipment');
const { calculateTdsTcs } = require('../services/invoiceService');

describe('Backlog Phase C — Sales Pipeline, Quality & Compliance Suite', () => {
  it('manages Lead opportunity pipeline stage transitions', () => {
    const lead = new Lead({
      title: 'Bulk Herb Supply Deal',
      customerName: 'Aushadh Kendra Varanasi',
      dealValue: 250000,
      stage: 'proposal',
      winProbability: 60
    });

    expect(lead.stage).toBe('proposal');
    expect(lead.winProbability).toBe(60);

    lead.stage = 'won';
    lead.winProbability = 100;
    expect(lead.stage).toBe('won');
  });

  it('triggers approval requirement on large-value orders over ₹50,000', () => {
    const order = new Order({
      name: 'Dr. Sharma Clinic',
      email: 'drsharma@example.com',
      phone: '9876543210',
      shippingAddress: 'Varanasi UP',
      totalAmount: 75000,
      approvalRequired: true,
      approvalStatus: 'pending_approval'
    });

    expect(order.approvalRequired).toBe(true);
    expect(order.approvalStatus).toBe('pending_approval');

    order.approvalStatus = 'approved';
    order.approvedBy = 'Factory Manager';
    expect(order.approvalStatus).toBe('approved');
  });

  it('instantiates VendorQualification for GMP vendor audit trails', () => {
    const vq = new VendorQualification({
      vendorId: '507f1f77bcf86cd799439011',
      vendorName: 'Herbal Extracts Pvt Ltd',
      auditorName: 'QA Auditor Mishra',
      gmpComplianceScore: 95,
      qualificationStatus: 'approved',
      nextAuditDue: new Date('2027-09-01')
    });

    expect(vq.qualificationStatus).toBe('approved');
    expect(vq.gmpComplianceScore).toBe(95);
  });

  it('tracks Equipment calibration logs and maintenance logs', () => {
    const eq = new Equipment({
      code: 'EQ-MIX-01',
      name: 'High Shear Powder Mixer 500L',
      category: 'mixer',
      manufacturingUnitId: '507f1f77bcf86cd799439022',
      calibrationDueDate: new Date('2026-12-31')
    });

    eq.calibrationLogs.push({
      calibratedOn: new Date(),
      calibratedBy: 'QC Inspector',
      certificateNo: 'CAL-2026-001'
    });

    expect(eq.calibrationLogs.length).toBe(1);
    expect(eq.calibrationLogs[0].certificateNo).toBe('CAL-2026-001');
  });

  it('calculates TDS and TCS on transactions exceeding ₹50 Lakhs threshold', () => {
    const saleRes = calculateTdsTcs('sale', 100000, 6000000); // > 50L
    expect(saleRes.tcsAmount).toBe(100); // 0.1% of 100,000

    const purchaseRes = calculateTdsTcs('purchase', 100000, 6000000);
    expect(purchaseRes.tdsAmount).toBe(100);

    const underThresholdRes = calculateTdsTcs('sale', 100000, 2000000); // < 50L
    expect(underThresholdRes.tcsAmount).toBe(0);
  });
});
