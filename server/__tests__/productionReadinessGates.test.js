const PurchaseOrder = require('../models/PurchaseOrder');
const VendorQualification = require('../models/VendorQualification');
const Dispatch = require('../models/Dispatch');
const CertificateOfAnalysis = require('../models/CertificateOfAnalysis');

describe('Production release-control defaults', () => {
  it('creates purchase orders as drafts with no implicit approval', () => {
    const po = new PurchaseOrder({
      poNo: 'PO-TEST-001',
      vendorId: '507f1f77bcf86cd799439011',
      vendorName: 'Test supplier',
      items: [{ name: 'Ashwagandha', rawMaterialId: '507f1f77bcf86cd799439022', qtyOrdered: 10, unitPrice: 20 }]
    });
    expect(po.status).toBe('draft');
    expect(po.approvedAt).toBeNull();
    expect(po.approvedByUserId).toBeNull();
  });

  it('does not implicitly qualify a newly recorded supplier', () => {
    const qualification = new VendorQualification({
      vendorId: '507f1f77bcf86cd799439011',
      vendorName: 'Test supplier',
      auditorName: 'Quality auditor',
      nextAuditDue: new Date(Date.now() + 86400000)
    });
    expect(qualification.qualificationStatus).toBe('conditional');
  });

  it('requires delivery evidence fields to be populated explicitly', () => {
    const dispatch = new Dispatch({
      dispatchNo: 'DSP-TEST-001',
      customerName: 'Test customer'
    });
    expect(dispatch.proofOfDelivery.recipientName).toBe('');
    expect(dispatch.proofOfDelivery.receivedAt).toBeNull();
    expect(dispatch.proofOfDelivery.condition).toBe('');
  });

  it('does not fabricate laboratory results or regulatory licence identifiers', () => {
    const coa = new CertificateOfAnalysis({
      coaNumber: 'COA-TEST-001',
      batchNo: 'BATCH-TEST-001',
      productName: 'Test formulation',
      manufacturingDate: new Date(),
      expiryDate: new Date(Date.now() + 86400000),
      testedBy: 'QC analyst'
    });
    expect(coa.status).toBe('draft');
    expect(coa.overallResult).toBe('PENDING');
    expect(coa.organolepticTests.passed).toBe(false);
    expect(coa.physicochemicalTests.passed).toBe(false);
    expect(coa.heavyMetalTests.passed).toBe(false);
    expect(coa.microbialTests.passed).toBe(false);
    expect(coa.manufacturingLicenseNo).toBe('');
    expect(coa.gmpCertificateNo).toBe('');
  });
});


describe('Manufacturing release-control records', () => {
  const LineClearance = require('../models/LineClearance');
  const ProductionPlan = require('../models/ProductionPlan');

  it('does not consider a new line clearance cleared by default', () => {
    const clearance = new LineClearance({
      batchId: '507f1f77bcf86cd799439011',
      manufacturingUnitId: '507f1f77bcf86cd799439022',
      clearedBy: '507f1f77bcf86cd799439033'
    });
    expect(clearance.cleared).toBe(false);
    expect(clearance.checklist.equipmentCleaned).toBe(false);
  });

  it('records production-plan maker/checker approval separately', () => {
    const plan = new ProductionPlan({
      planNo: 'PLAN-TEST-001', title: 'Test Plan',
      manufacturingUnitId: '507f1f77bcf86cd799439011',
      manufacturingUnitName: 'Test Unit',
      startDate: new Date(), endDate: new Date(Date.now() + 86400000),
      createdByUserId: '507f1f77bcf86cd799439022'
    });
    expect(plan.status).toBe('draft');
    expect(plan.approvedByUserId).toBeNull();
    expect(plan.approvedAt).toBeNull();
  });
});
